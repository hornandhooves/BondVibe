/**
 * Community Matching — client data layer.
 *
 * Post-event, opt-in, privacy-first attendee matching (a Kinlo Pro feature).
 * Firestore model (see firestore.rules · "COMMUNITY MATCHING"):
 *   events/{eventId}.matching                      — host config + resolved window
 *   matchProfiles/{eventId}/attendees/{uid}        — opt-in profile (owner writes)
 *   likes/{eventId}/edges/{from}_{to}              — PRIVATE, server-only
 *   matches/{eventId}/pairs/{matchId}              — server-created, pair-only read
 *   matchChats/{matchId} (+/messages)              — pair + allowMessaging
 *   users/{uid}.plan | matchCountByEvent           — server-managed (webhook/fn)
 *
 * Money/limit-sensitive writes (likes, matches, match cap, matching config) go
 * through Cloud Functions (Block 2.2). Reads and the user's own profile are
 * direct Firestore. The host can never read `likes`.
 */
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { isBigFive } from "../utils/personalityScoring";
import { computeAffinity } from "../utils/computeAffinity";
import { syncMatchPool, removeFromMatchPool } from "./matchPoolService";
import { arr, stripUndefined } from "../utils/firestoreClean";
import {
  isProfileComplete,
  sanitizeIds,
  FUNNY_TAG_IDS,
  LANGUAGES,
  LEARNING,
  GROUP_PREFS,
  INDUSTRIES,
} from "../constants/matchTags";

// ---- Enums (mirror §4 of the handoff) -------------------------------------
export const MATCH_TYPES = ["friend", "professional", "romantic"];
// BUG 11: only Everyone / Same gender / Opposite gender. "Organizer only" and
// "Hidden for now" were removed — matching is opt-in already, so hiding is just
// not opting in. Legacy profiles with those values still read fine.
export const VISIBILITY_OPTIONS = [
  "everyone",
  "same_gender",
  "opposite_gender",
];
export const OPENS_AT_OPTIONS = ["now", "1h_before", "after_checkin", "after_event"];
export const CLOSES_AFTER_OPTIONS = ["24h", "3d", "1w", "forever"];
export const MAX_MATCHES_OPTIONS = [10, 20, 50, -1]; // -1 = unlimited

// Accent colors per match type (the only feature-specific palette; §7).
export const MATCH_TYPE_COLORS = {
  friend: { fg: "#1F8A6E", bg: "#E1F5EC" },
  professional: { fg: "#4F5BD5", bg: "#E6EAFB" },
  romantic: { fg: "#E91E8C", bg: "#FBE4F1" },
  brand: { fg: "#7C3AED", bg: "#EDE4FC" }, // v2 "IA / nuevo" accent
};

// ---- v2 profile sanitizers (P0) — structured, clamped, no free text ---------
const sanitizeEnergy = (e) => {
  if (!e || typeof e !== "object") return null;
  const a = Number(e.adventure);
  const s = Number(e.social);
  if (!Number.isFinite(a) || !Number.isFinite(s)) return null;
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  return { adventure: clamp(a), social: clamp(s) };
};
const sanitizePro = (p) => {
  if (!p || typeof p !== "object") return null;
  const str = (v) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const out = {
    role: str(p.role),
    industry: INDUSTRIES.includes(p.industry) ? p.industry : null,
    offer: str(p.offer),
    seek: str(p.seek),
  };
  return out.role || out.industry || out.offer || out.seek ? out : null;
};

// ---- Helpers ---------------------------------------------------------------
const uid = () => auth.currentUser?.uid || null;

/** Firestore Timestamp | ISO | ms → epoch ms (or null). */
const toMillis = (v) => {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return new Date(v).getTime();
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  return null;
};

/** Deterministic match id from two uids. */
export const matchIdFor = (a, b) => [a, b].sort().join("_");

/**
 * Resolve the current matching state from an event's `matching` block.
 * disabled → enabled_locked (before opensAt) → open → closed.
 * @param {object} event event doc (with `matching`)
 * @param {number} [now] epoch ms (defaults to Date.now())
 * @return {"disabled"|"enabled_locked"|"open"|"closed"}
 */
export const getMatchingState = (event, now = Date.now()) => {
  const m = event?.matching;
  if (!m || !m.enabled) return "disabled";
  const opensAt = toMillis(m.opensAtResolved);
  const closesAt = toMillis(m.closesAtResolved); // null = "forever"
  if (opensAt != null && now < opensAt) return "enabled_locked";
  if (closesAt != null && now >= closesAt) return "closed";
  return "open";
};

/** ms until the window opens (for the B2 countdown), or 0 if already open. */
export const msUntilOpen = (event, now = Date.now()) => {
  const opensAt = toMillis(event?.matching?.opensAtResolved);
  return opensAt && opensAt > now ? opensAt - now : 0;
};

// ---- Host config (Function-gated to Kinlo Pro) -----------------------------
/**
 * Enable/update matching config for an event. Server validates the caller is
 * the host AND isPremium (Kinlo Pro), then resolves the time window.
 * @param {string} eventId event id
 * @param {object} config { enabled, types, opensAt, closesAfter, allowMessaging, maxMatches }
 */
export const setMatchingConfig = async (eventId, config) => {
  const fn = httpsCallable(getFunctions(), "setMatchingConfig");
  const res = await fn({ eventId, config });
  return res.data;
};

// ---- Opt-in + consent + profile -------------------------------------------
const profileRef = (eventId, userId) =>
  doc(db, "matchProfiles", eventId, "attendees", userId);

/** The current user's match profile for an event (or null). */
export const getMyMatchProfile = async (eventId) => {
  const me = uid();
  if (!me) return null;
  const s = await getDoc(profileRef(eventId, me));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};

/** The current user's CANONICAL (user-level) match profile, or null. This is the
 *  profile the Profile-tab editor reads and the one matchPool / the curated
 *  generator / postService.authorFunnyTag consume. */
export const getCanonicalMatchProfile = async () => {
  const me = uid();
  if (!me) return null;
  try {
    const s = await getDoc(doc(db, "users", me));
    if (!s.exists()) return null;
    const u = s.data();
    if (!u.matchProfile) return null;
    // Personality lives at users/{uid}.personality (the quiz writes it there).
    return { ...u.matchProfile, personality: u.personality ?? u.matchProfile.personality ?? null };
  } catch (e) {
    console.error("❌ getCanonicalMatchProfile:", e);
    return null;
  }
};

/**
 * Sanitize the raw form into the canonical field bundle. Every array coerces to
 * [] so a missing one can never reach Firestore as `undefined` (the root of the
 * old save crash); every write also goes through stripUndefined.
 * @param {object} profile raw form values
 * @param {object} u the user doc
 * @return {object} sanitized fields
 */
function sanitizeProfileFields(profile, u) {
  return {
    interests: arr(profile.interests),
    lookingFor: arr(profile.lookingFor),
    funnyTags: sanitizeIds(profile.funnyTags, FUNNY_TAG_IDS),
    languages: sanitizeIds(profile.languages, LANGUAGES),
    learning: sanitizeIds(profile.learning, LEARNING),
    energy: sanitizeEnergy(profile.energy),
    groupPref: GROUP_PREFS.includes(profile.groupPref) ? profile.groupPref : null,
    pro: sanitizePro(profile.pro),
    // Big Five snapshot, denormalized for ranking without N reads.
    personality: isBigFive(u.personality) ? u.personality : null,
    bio: typeof profile.bio === "string" ? profile.bio : "",
    icebreaker: typeof profile.icebreaker === "string" ? profile.icebreaker : "",
  };
}

/**
 * Write the canonical profile + the gate mirror on users/{me}, then refresh the
 * cross-community pool. Shared by both modes.
 * @param {string} me uid
 * @param {object} u the user doc
 * @param {object} f sanitized fields (from sanitizeProfileFields)
 * @param {object} [opts] { consentFallback } — the event flow passes a fallback
 *   because it came through MatchConsent; the canonical editor passes none, so
 *   editing your profile NEVER fabricates consent (privacy-first gate).
 * @return {Promise<boolean>} whether the profile is complete
 */
async function writeCanonicalProfile(me, u, f, opts = {}) {
  const complete = isProfileComplete(f);
  const consentAt = u.matchmaking?.consentAt ?? opts.consentFallback ?? null;
  await setDoc(
    doc(db, "users", me),
    stripUndefined({
      matchmaking: {
        consentAt,
        profileComplete: complete,
        enabled: u.matchmaking?.enabled ?? true,
      },
      matchProfile: {
        interests: f.interests,
        funnyTags: f.funnyTags,
        lookingFor: f.lookingFor,
        energy: f.energy,
        groupPref: f.groupPref,
        pro: f.pro,
        personality: f.personality,
        bio: f.bio,
        languages: f.languages,
        learning: f.learning,
        icebreaker: f.icebreaker,
      },
    }),
    { merge: true }
  );
  // The pool write requires consent (rules) — skip it when not consented, or
  // we'd fire a guaranteed permission error.
  if (complete && consentAt != null) {
    try {
      await syncMatchPool();
    } catch (e) {
      /* non-fatal — the weekly batch reconciles */
    }
  }
  return complete;
}

/**
 * Save the CANONICAL (user-level) match profile — the Profile-tab editor, no
 * event. Fills users/{me}.matchProfile (what matchPool and
 * postService.authorFunnyTag read). Consent is preserved, never fabricated:
 * you can curate your profile without opting into matchmaking.
 * @param {object} profile the same form shape as the event-scoped save
 * @return {Promise<{success:boolean, profileComplete?:boolean}>}
 */
export const saveCanonicalMatchProfile = async (profile) => {
  const me = uid();
  if (!me) return { success: false, error: "Not signed in" };
  try {
    const userSnap = await getDoc(doc(db, "users", me));
    const u = userSnap.exists() ? userSnap.data() : {};
    const f = sanitizeProfileFields(profile, u);
    const complete = await writeCanonicalProfile(me, u, f);
    return { success: true, profileComplete: complete };
  } catch (e) {
    console.error("❌ saveCanonicalMatchProfile:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Create/update the current user's opt-in match profile FOR AN EVENT. Writes the
 * event-scoped attendee doc AND merges the same values into the canonical
 * user-level profile.
 * @param {string} eventId event id
 * @param {object} profile { photoUrl, displayName, age?, bio, interests[],
 *   profession, languages[], lookingFor[], icebreaker, available, visibility }
 */
export const saveMatchProfile = async (eventId, profile) => {
  const me = uid();
  if (!me) return { success: false, error: "Not signed in" };
  try {
    const userSnap = await getDoc(doc(db, "users", me));
    const u = userSnap.exists() ? userSnap.data() : {};
    const f = sanitizeProfileFields(profile, u);
    const { interests, lookingFor, funnyTags, languages, learning, energy, groupPref, pro, personality } = f;

    await setDoc(
      profileRef(eventId, me),
      stripUndefined({
        userId: me,
        photoUrl: profile.photoUrl ?? u.avatar ?? null,
        displayName: profile.displayName ?? u.fullName ?? u.name ?? "Guest",
        age: profile.age ?? null,
        bio: profile.bio ?? "",
        interests, // catalog ids (new picker) or legacy free text
        profession: profile.profession ?? u.profession ?? "",
        languages,
        lookingFor,
        icebreaker: profile.icebreaker ?? "",
        available: profile.available ?? true,
        visibility: profile.visibility ?? "everyone",
        gender: profile.gender ?? u.gender ?? null,
        // v2 expanded profile (P0) — structured tags, no free text / no emoji.
        energy,
        groupPref,
        funnyTags,
        learning,
        pro,
        // Denormalized personality snapshot for compatibility ranking.
        personality,
        consentAt: profile.consentAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    // Mirror the same values into the canonical user-level profile + the gate.
    // The event flow came through MatchConsent, so it may stamp consent.
    const complete = await writeCanonicalProfile(me, u, f, {
      consentFallback: profile.consentAt ?? serverTimestamp(),
    });
    return { success: true, profileComplete: complete };
  } catch (e) {
    console.error("❌ saveMatchProfile:", e);
    return { success: false, error: e.message };
  }
};

/** Flip visibility / availability (D4 controls). */
export const updateMatchVisibility = async (eventId, patch) => {
  const me = uid();
  if (!me) return { success: false };
  try {
    await setDoc(profileRef(eventId, me), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    return { success: true };
  } catch (e) {
    console.error("❌ updateMatchVisibility:", e);
    return { success: false, error: e.message };
  }
};

/** Leave matching for an event: delete the profile (effective removal). */
export const leaveMatching = async (eventId) => {
  const me = uid();
  if (!me) return { success: false };
  try {
    await deleteDoc(profileRef(eventId, me));
    return { success: true };
  } catch (e) {
    console.error("❌ leaveMatching:", e);
    return { success: false, error: e.message };
  }
};

// ---- Matchmaking state (v2 user-level gate) --------------------------------
// users/{uid}.matchmaking = { consentAt, profileComplete, enabled, freeTrialEndsAt?, plan? }.
// consent + profileComplete are the mandatory gate; server rules read this.

/** The current user's matchmaking state, or null. */
export const getMatchmaking = async () => {
  const me = uid();
  if (!me) return null;
  const s = await getDoc(doc(db, "users", me));
  return (s.exists() && s.data().matchmaking) || null;
};

/** Record consent (the mandatory first gate step). Idempotent — never clears a
 *  prior consentAt; sets enabled. */
export const setMatchmakingConsent = async () => {
  const me = uid();
  if (!me) return { success: false };
  try {
    const s = await getDoc(doc(db, "users", me));
    const mm = (s.exists() && s.data().matchmaking) || {};
    await setDoc(
      doc(db, "users", me),
      { matchmaking: { ...mm, consentAt: mm.consentAt ?? serverTimestamp(), enabled: true } },
      { merge: true }
    );
    return { success: true };
  } catch (e) {
    console.error("❌ setMatchmakingConsent:", e);
    return { success: false, error: e.message };
  }
};

/** Patch matchmaking settings (enabled / paused / crossCommunity …). */
export const updateMatchmaking = async (patch) => {
  const me = uid();
  if (!me) return { success: false };
  try {
    await setDoc(doc(db, "users", me), { matchmaking: patch || {} }, { merge: true });
    return { success: true };
  } catch (e) {
    console.error("❌ updateMatchmaking:", e);
    return { success: false, error: e.message };
  }
};

// ---- v2 settings (P4) — participate / pause / cross-community / disable ------

/** Master switch. Off = paused (profile kept, stops appearing); on = active.
 *  Keeps the pool doc's `enabled` flag in sync so the user really (dis)appears. */
export const setMatchmakingEnabled = async (enabled) => {
  const res = await updateMatchmaking({ enabled: !!enabled });
  if (res.success) {
    try {
      await syncMatchPool();
    } catch (e) {
      /* non-fatal — the weekly batch reconciles */
    }
  }
  return res;
};

/** Opt into cross-community discovery (default off = only shared communities). */
export const setCrossCommunity = async (on) => updateMatchmaking({ crossCommunity: !!on });

/**
 * Disable matchmaking (destructive): delete the cross-community pool profile so
 * the user is removed from every future set/pool, and revoke consent so the
 * server gates treat them as a non-participant. Reversible only by opting in
 * again (which re-consents + rebuilds the profile).
 */
export const leaveMatchmaking = async () => {
  const me = uid();
  if (!me) return { success: false };
  try {
    await removeFromMatchPool();
    await setDoc(
      doc(db, "users", me),
      { matchmaking: { enabled: false, consentAt: null, profileComplete: false } },
      { merge: true }
    );
    return { success: true };
  } catch (e) {
    console.error("❌ leaveMatchmaking:", e);
    return { success: false, error: e.message };
  }
};

// ---- Grid ("who was here") -------------------------------------------------
/**
 * Attendee profiles for the post-event grid, ranked by compatibility with me.
 * Rules already restrict reads to checked-in same-event users; here we apply
 * gender-based visibility and rank by Big Five compatibility.
 * @param {string} eventId event id
 * @return {Promise<Array>} profiles with `compatibility` (0-100) added
 */
export const getMatchGrid = async (eventId) => {
  const me = uid();
  if (!me) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, "matchProfiles", eventId, "attendees"),
        where("available", "==", true)
      )
    );
    const myProfile = await getMyMatchProfile(eventId);
    const myGender = myProfile?.gender ?? null;

    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.userId !== me && p.visibility !== "hidden")
      .filter((p) => passesGenderVisibility(p, myGender))
      .map((p) => {
        // v2: deterministic multi-signal affinity (P1). The score is computed
        // here — the AI never produces it. Insufficient signal → under_construction.
        const affinity = computeAffinity(myProfile, p, "social");
        return {
          ...p,
          affinity,
          compatibility: affinity.status === "ok" ? affinity.score : null,
        };
      })
      .sort((a, b) => (b.compatibility ?? -1) - (a.compatibility ?? -1));
  } catch (e) {
    console.error("❌ getMatchGrid:", e);
    return [];
  }
};

/** Apply a peer's same/opposite-gender visibility choice against the viewer. */
function passesGenderVisibility(peer, myGender) {
  switch (peer.visibility) {
    case "same_gender":
      return !!myGender && myGender === peer.gender;
    case "opposite_gender":
      return !!myGender && !!peer.gender && myGender !== peer.gender;
    case "organizer":
      return false; // organizer-only profiles aren't shown in the peer grid
    case "hidden":
      return false;
    default:
      return true; // "everyone"
  }
}

// ---- Like / match (server transaction; enforces the cap) -------------------
/**
 * Like an attendee. The Cloud Function validates the open window + check-in,
 * enforces matchCount < maxMatches unless plan === 'kinlo_plus', writes the
 * (private) like, and forms a match on a reciprocal like.
 * @param {string} eventId event id
 * @param {string} toUid liked attendee's uid
 * @return {Promise<{matched:boolean, capReached?:boolean, matchId?:string}>}
 */
export const likeAttendee = async (eventId, toUid) => {
  const fn = httpsCallable(getFunctions(), "createLikeAndMaybeMatch");
  const res = await fn({ eventId, toUid });
  return res.data;
};

/** Matches for the current user within one event. */
export const getMyMatches = async (eventId) => {
  const me = uid();
  if (!me) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, "matches", eventId, "pairs"),
        where("users", "array-contains", me)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("❌ getMyMatches:", e);
    return [];
  }
};

/** All matches for the current user across events ("People you met" · D1). */
export const getAllMyMatches = async () => {
  const me = uid();
  if (!me) return [];
  try {
    const snap = await getDocs(
      query(
        collectionGroup(db, "pairs"),
        where("users", "array-contains", me),
        orderBy("createdAt", "desc")
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("❌ getAllMyMatches:", e);
    return [];
  }
};

// ---- Match chat ------------------------------------------------------------
export const subscribeMatchChat = (matchId, cb) => {
  const q = query(
    collection(db, "matchChats", matchId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error("❌ subscribeMatchChat:", err)
  );
};

export const sendMatchMessage = async (matchId, text) => {
  const me = uid();
  const body = (text || "").trim();
  if (!me || !body) return { success: false };
  try {
    await addDoc(collection(db, "matchChats", matchId, "messages"), {
      senderId: me,
      text: body,
      createdAt: serverTimestamp(),
    });
    return { success: true };
  } catch (e) {
    console.error("❌ sendMatchMessage:", e);
    return { success: false, error: e.message };
  }
};

// ---- Host analytics (aggregates only; never exposes pairs/likes) -----------
export const getHostMatchAnalytics = async (eventId) => {
  const fn = httpsCallable(getFunctions(), "getHostMatchAnalytics");
  const res = await fn({ eventId });
  return res.data;
};
