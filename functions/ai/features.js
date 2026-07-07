/**
 * P2 AI features — definitions plugged into the foundation gateway:
 *   host_copilot   (Pro · taste: 1 draft)   — draft event from an idea
 *   member_intel   (Pro)                    — aggregate community pulse
 *   ai_analytics   (Pro · taste: headline)  — AI reads the host's month
 *   match_intel    (Plus · taste: rationale)— why-you-click + icebreakers
 *   weekly_digest  (Plus · taste: monthly)  — your-week narrative
 *
 * Privacy: host features receive AGGREGATES only (never who liked/DMed whom);
 * match_intel only runs between two opted-in match profiles.
 */

const SYSTEM_BASE =
  "You are Kinlo's community intelligence. You help people belong and " +
  "show up in real life. You are given ONLY this user's real Kinlo " +
  "context. Never invent events, people, or numbers. Return STRICT JSON " +
  "matching the schema. Warm, concise, first-person-friendly. English.";

const DEFAULTS = {
  host_copilot: {maxTokens: 900, freeDrafts: 1},
  member_intel: {maxTokens: 700},
  ai_analytics: {maxTokens: 800},
  match_intel: {maxTokens: 600},
  weekly_digest: {maxTokens: 700, freePerMonth: 1},
  content_translation: {maxTokens: 1500, freePerMonth: 1},
  business_dashboard: {maxTokens: 700},
  momentum_action: {maxTokens: 500},
};

// ─── Context loaders ────────────────────────────────────────────────────────

/**
 * Host Copilot: the host's own past events as grounding for price/turnout.
 * @param {FirebaseFirestore.Firestore} db handle
 * @param {string} uid host
 * @return {Promise<object>} context
 */
async function loadHostCopilot(db, uid) {
  // No composite index needed: filter by creator only, sort in memory.
  const snap = await db.collection("events")
    .where("creatorId", "==", uid).limit(60).get();
  const docs = [...snap.docs].sort((a, b) =>
    String(b.data().date || "").localeCompare(String(a.data().date || "")))
    .slice(0, 12);
  const pastEvents = docs.map((d) => {
    const e = d.data();
    return {
      title: e.title || "",
      price: e.price || 0,
      capacity: e.maxAttendees || null,
      attended: (e.attendees || []).length,
      category: e.category || null,
    };
  });
  const memberCount = new Set(
    docs.flatMap((d) => d.data().attendees || [])).size;
  return {host: {pastEvents, memberCount}};
}

/**
 * Member Intelligence: AGGREGATE member activity only.
 * @param {FirebaseFirestore.Firestore} db handle
 * @param {string} uid host
 * @return {Promise<object>} context
 */
async function loadMemberIntel(db, uid) {
  const nowMs = Date.now();
  const threeWeeksAgo = nowMs - 21 * 86400000;
  const [eventsSnap, ratingsSnap] = await Promise.all([
    db.collection("events").where("creatorId", "==", uid)
      .limit(80).get(),
    db.collection("ratings").where("hostId", "==", uid)
      .orderBy("createdAt", "desc").limit(40).get().catch(() => null),
  ]);
  const counts = {}; // uid -> {n, lastMs}
  for (const d of eventsSnap.docs) {
    const e = d.data();
    const t = e.date ? new Date(e.date).getTime() : 0;
    for (const a of e.attendees || []) {
      const c = counts[a] || {n: 0, lastMs: 0};
      c.n += 1;
      c.lastMs = Math.max(c.lastMs, t);
      counts[a] = c;
    }
  }
  const vals = Object.values(counts);
  const regulars = vals.filter((c) => c.n >= 2).length;
  const lapsing = vals.filter(
    (c) => c.n >= 2 && c.lastMs > 0 && c.lastMs < threeWeeksAgo).length;
  const ratings = ratingsSnap ?
    ratingsSnap.docs.map((d) => d.data()) : [];
  const avg = ratings.length ?
    ratings.reduce((s, r) => s + (r.rating || 0), 0) / ratings.length : null;
  const sampleThemes = ratings
    .map((r) => (r.comment || "").trim()).filter(Boolean).slice(0, 8);
  const upcoming = eventsSnap.docs
    .map((d) => d.data())
    .filter((e) => e.date && new Date(e.date).getTime() > nowMs)
    .slice(0, 3)
    .map((e) => ({title: e.title, startsAt: e.date}));
  return {
    members: {total: vals.length, regulars, lapsingCount: lapsing,
      lapsingSegment: "attended 2+, absent 3wk"},
    sentiment: {avgRating: avg, sampleThemes},
    upcoming,
  };
}

/**
 * AI Analytics: aggregate metrics for the host's recent period.
 * @param {FirebaseFirestore.Firestore} db handle
 * @param {string} uid host
 * @return {Promise<object>} context
 */
async function loadAiAnalytics(db, uid) {
  const nowMs = Date.now();
  const monthAgo = nowMs - 30 * 86400000;
  const prevMonth = nowMs - 60 * 86400000;
  const snap = await db.collection("events").where("creatorId", "==", uid)
    .limit(80).get();
  const events = snap.docs.map((d) => d.data());
  const inWindow = (e, from, to) => {
    const t = e.date ? new Date(e.date).getTime() : 0;
    return t >= from && t < to;
  };
  const revenueOf = (list) => list.reduce(
    (s, e) => s + (e.price || 0) * (e.attendees || []).length, 0);
  const cur = events.filter((e) => inWindow(e, monthAgo, nowMs));
  const prev = events.filter((e) => inWindow(e, prevMonth, monthAgo));
  const revenue = revenueOf(cur);
  const revenuePrev = revenueOf(prev);
  const counts = {};
  for (const e of events) {
    for (const a of e.attendees || []) counts[a] = (counts[a] || 0) + 1;
  }
  const uniq = Object.keys(counts).length;
  const repeat = uniq ?
    Object.values(counts).filter((n) => n >= 2).length / uniq : 0;
  return {
    period: new Date().toISOString().slice(0, 7),
    metrics: {
      revenue,
      revenueDeltaPct: revenuePrev ?
        Math.round(((revenue - revenuePrev) / revenuePrev) * 100) : null,
      repeatRatePct: Math.round(repeat * 100),
      eventsThisMonth: cur.length,
    },
    events: cur.slice(0, 10).map((e) => ({
      title: e.title,
      day: e.date ? new Date(e.date).toLocaleDateString("en-US",
        {weekday: "short"}) : null,
      price: e.price || 0,
      capacity: e.maxAttendees || null,
      attended: (e.attendees || []).length,
    })),
  };
}

/**
 * Business Dashboard (Kinlo for Business): aggregate the host's own CRM +
 * attendance for the requested window. bizId == uid (one business per owner).
 * Numbers only — never PII — so the AI read stays grounded and privacy-safe.
 * @param {FirebaseFirestore.Firestore} db handle
 * @param {string} uid host / bizId
 * @param {object} cfg config (unused)
 * @param {object} input {from, to} ISO window
 * @return {Promise<object>} context
 */
async function loadBusinessDashboard(db, uid, cfg, input) {
  const fromMs = new Date(input?.from || 0).getTime();
  const toMs = input?.to ? new Date(input.to).getTime() : Date.now();
  const base = db.collection("businesses").doc(uid);
  const [bizSnap, memSnap, attSnap] = await Promise.all([
    base.get(),
    base.collection("members").limit(2000).get(),
    base.collection("attendance")
      .where("date", ">=", new Date(fromMs).toISOString())
      .where("date", "<=", new Date(toMs).toISOString())
      .limit(4000).get(),
  ]);
  const members = memSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const attendance = attSnap.docs.map((d) => d.data());
  const attendedIds = new Set(attendance.map((a) => a.memberId));
  const createdIn = (m) => {
    const c = m.createdAt && m.createdAt.toMillis ?
      m.createdAt.toMillis() : 0;
    return c >= fromMs && c < toMs;
  };
  const statusCount = (s) =>
    members.filter((m) => (m.status || "active") === s).length;
  return {
    vertical: bizSnap.exists ? (bizSnap.data().vertical || "other") : "other",
    window: {
      from: new Date(fromMs).toISOString().slice(0, 10),
      to: new Date(toMs).toISOString().slice(0, 10),
    },
    metrics: {
      totalMembers: members.length,
      activeInRange: attendedIds.size,
      attendance: attendance.length,
      newMembers: members.filter(createdIn).length,
      prospects: members.filter(
        (m) => createdIn(m) && !attendedIds.has(m.id)).length,
      atRisk: statusCount("at_risk"),
      inactive: statusCount("inactive"),
    },
  };
}

/**
 * Momentum action (Kinlo for Business): one member's real signals so the AI can
 * suggest the next retention action + draft a message. bizId == uid.
 * @param {FirebaseFirestore.Firestore} db handle
 * @param {string} uid host / bizId
 * @param {object} cfg config (unused)
 * @param {object} input {memberId}
 * @return {Promise<object>} context
 */
async function loadMomentumAction(db, uid, cfg, input) {
  const memberId = input?.memberId;
  if (!memberId) throw new Error("missing memberId");
  const base = db.collection("businesses").doc(uid);
  const [memSnap, attSnap] = await Promise.all([
    base.collection("members").doc(memberId).get(),
    base.collection("attendance").where("memberId", "==", memberId)
      .limit(50).get(),
  ]);
  if (!memSnap.exists) throw new Error("member not found");
  const m = memSnap.data();
  const dates = attSnap.docs
    .map((d) => new Date(d.data().date).getTime())
    .filter((n) => isFinite(n))
    .sort((a, b) => b - a);
  const lastSeenDaysAgo = dates.length ?
    Math.round((Date.now() - dates[0]) / 86400000) : null;
  return {
    member: {
      name: m.name || "",
      status: m.status || "active",
      tags: Array.isArray(m.tags) ? m.tags.slice(0, 6) : [],
      creditBalance: typeof m.creditBalance === "number" ?
        m.creditBalance : null,
      package: m.activePackage ? {
        name: m.activePackage.name,
        remaining: m.activePackage.creditsRemaining,
        expiresAt: m.activePackage.expiresAt ?
          String(m.activePackage.expiresAt).slice(0, 10) : null,
      } : null,
      totalVisits: dates.length,
      lastSeenDaysAgo,
    },
  };
}

/**
 * Match Intelligence: both OPT-IN match profiles for one event.
 * @param {FirebaseFirestore.Firestore} db handle
 * @param {string} uid caller
 * @param {object} cfg config (unused)
 * @param {object} input {eventId, otherUid}
 * @return {Promise<object>} context
 */
async function loadMatchIntel(db, uid, cfg, input) {
  const {eventId, otherUid} = input || {};
  if (!eventId || !otherUid) throw new Error("missing eventId/otherUid");
  const ref = (u) =>
    db.collection("matchProfiles").doc(eventId)
      .collection("attendees").doc(u);
  const [mineSnap, theirsSnap, evSnap] = await Promise.all([
    ref(uid).get(), ref(otherUid).get(),
    db.collection("events").doc(eventId).get(),
  ]);
  if (!mineSnap.exists || !theirsSnap.exists) {
    throw new Error("both attendees must have opt-in match profiles");
  }
  // Privacy: the caller must be checked in, and the other person must be
  // discoverable (same gate the grid enforces in rules) — the Admin SDK
  // bypasses rules, so re-check here or we'd leak hidden/unavailable profiles.
  const myCheckin = await db.collection("events").doc(eventId)
    .collection("checkins").doc(uid).get();
  if (!myCheckin.exists) throw new Error("caller not checked in");
  const them = theirsSnap.data() || {};
  if (them.available !== true || them.visibility === "hidden") {
    throw new Error("target profile is not discoverable");
  }
  const pick = (s) => {
    const p = s.data() || {};
    return {
      personalityScores: p.personality || null,
      interests: p.interests || [],
      lookingFor: p.lookingFor || null,
      bio: (p.bio || "").slice(0, 240),
    };
  };
  const ev = evSnap.exists ? evSnap.data() : {};
  return {
    me: pick(mineSnap),
    them: pick(theirsSnap),
    event: {type: (ev.matching && ev.matching.types || ["friend"])[0]},
  };
}

/**
 * Weekly Digest: the user's RSVPs + what's opening soon.
 * @param {FirebaseFirestore.Firestore} db handle
 * @param {string} uid user
 * @return {Promise<object>} context
 */
async function loadWeeklyDigest(db, uid) {
  const nowIso = new Date().toISOString();
  const [userSnap, mineSnap, soonSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("events")
      .where("attendees", "array-contains", uid)
      .where("date", ">=", nowIso).limit(6).get().catch(() => null),
    db.collection("events")
      .where("date", ">=", nowIso).orderBy("date", "asc").limit(8).get(),
  ]);
  const u = userSnap.exists ? userSnap.data() : {};
  const evLite = (d) => {
    const e = d.data();
    return {eventId: d.id, title: e.title || "", startsAt: e.date || null,
      going: (e.attendees || []).length};
  };
  return {
    user: {name: (u.fullName || "").split(" ")[0] || "there"},
    upcoming: mineSnap ? mineSnap.docs.map(evLite) : [],
    openingSoon: soonSnap.docs.map(evLite),
  };
}

/**
 * Content translation (Layer 2): ground is ONLY the user's content text — no
 * account data loaded. The client passes the text + target language.
 * @param {FirebaseFirestore.Firestore} db handle (unused)
 * @param {string} uid caller (unused)
 * @param {object} cfg config (unused)
 * @param {object} input {text, targetLang, targetName}
 * @return {Promise<object>} context
 */
async function loadContentTranslation(db, uid, cfg, input) {
  const text = String((input && input.text) || "").slice(0, 4000);
  if (!text.trim()) throw new Error("no text to translate");
  const targetName = String(
    (input && (input.targetName || input.targetLang)) || "English").slice(0, 40);
  return {text, targetName};
}

// ─── Prompts ────────────────────────────────────────────────────────────────

const PROMPTS = {
  content_translation: (ctx) => ({
    system:
      "You are a professional translator for Kinlo. Translate the user's " +
      "content into " + ctx.targetName + ". Preserve meaning, tone, emojis, " +
      "and line breaks. Do not add notes, quotes, or explanations. Return " +
      "STRICT JSON: {\"translation\":string} where translation is ONLY the " +
      "translated text. If the text is already in " + ctx.targetName +
      ", return it unchanged.",
    user: JSON.stringify({text: ctx.text}),
  }),
  host_copilot: (ctx, input) => ({
    system: SYSTEM_BASE +
      " Schema: {\"title\":string,\"description\":string," +
      "\"priceSuggestion\":{\"amount\":number,\"currency\":\"MXN\"," +
      "\"rationale\":string}|null," +
      "\"turnoutPrediction\":{\"expected\":number,\"capacity\":number," +
      "\"basis\":string}|null,\"bestPostTime\":{\"day\":string," +
      "\"hour\":number}|null}" +
      " Draft a polished event from the host's idea, grounded in their " +
      "past events. If fewer than 3 past events, set priceSuggestion and " +
      "turnoutPrediction to null (not enough history). Predictions are " +
      "estimates — phrase rationale/basis accordingly.",
    user: JSON.stringify({context: ctx,
      idea: String(input.idea || "").slice(0, 300)}),
  }),
  member_intel: (ctx) => ({
    system: SYSTEM_BASE +
      " Schema: {\"pulse\":string,\"metrics\":{\"sentiment\":number|null," +
      "\"coolingOff\":number,\"regulars\":number}," +
      "\"winBack\":{\"audienceCount\":number,\"message\":string}}" +
      " pulse = one grounded sentence on community health. sentiment = " +
      "0-100 from avgRating (null if no ratings). winBack.message = warm, " +
      "sendable note to lapsed members referencing something real.",
    user: JSON.stringify(ctx),
  }),
  ai_analytics: (ctx) => ({
    system: SYSTEM_BASE +
      " Schema: {\"narrative\":string,\"recommendations\":[{\"text\":string," +
      "\"expectedImpact\":string}]}" +
      " narrative = 2-3 sentences reading the month from the metrics. " +
      "recommendations = up to 3 concrete ranked actions. Label estimates " +
      "as estimates. If data is thin, say so plainly.",
    user: JSON.stringify(ctx),
  }),
  business_dashboard: (ctx) => ({
    system: SYSTEM_BASE +
      " You read a small business's CRM metrics for a period. Schema: " +
      "{\"narrative\":string,\"projection\":{\"attendanceNext\":number|null," +
      "\"note\":string},\"recommendations\":[{\"text\":string}]}" +
      " narrative = 2-3 sentences reading the period from the metrics " +
      "(members, attendance, new, prospects, at-risk). projection = a next-" +
      "period attendance ESTIMATE grounded in the numbers (null if data is " +
      "too thin) with a one-line note calling it an estimate. " +
      "recommendations = up to 3 concrete ranked actions. Never invent " +
      "numbers not derivable from the metrics.",
    user: JSON.stringify(ctx),
  }),
  momentum_action: (ctx) => ({
    system: SYSTEM_BASE +
      " A host is working a retention board. For this ONE member, suggest the " +
      "next action + priority and draft a short, warm, sendable message. " +
      "Schema: {\"actionTitle\":string,\"priority\":\"low\"|\"medium\"|" +
      "\"high\"|\"urgent\",\"message\":string} " +
      "actionTitle = a few words (e.g. 'Send 2-for-1 win-back'). message = " +
      "1-3 sentences the host can send as-is, referencing something real " +
      "(last visit, expiring credits). Never invent facts not in the context.",
    user: JSON.stringify(ctx),
  }),
  match_intel: (ctx) => ({
    system: SYSTEM_BASE +
      " Schema: {\"rationale\":string,\"icebreakers\":[string]}" +
      " rationale = one grounded paragraph on why these two fit " +
      "(shared traits, interests, what each is looking for). " +
      "icebreakers = exactly 3 specific, sendable openers. Never invent " +
      "details not present in the profiles.",
    user: JSON.stringify(ctx),
  }),
  weekly_digest: (ctx) => ({
    system: SYSTEM_BASE +
      " Schema: {\"greeting\":string,\"narrative\":string," +
      "\"picks\":[{\"eventId\":string,\"cta\":\"go\"|\"remind\"}]}" +
      " greeting = 'Hey {name} — here's your week ✨' style. narrative = " +
      "2-3 warm sentences from their real RSVPs and what's opening. " +
      "picks = up to 3 eventIds from the context only.",
    user: JSON.stringify(ctx),
  }),
};

// ─── Validators ─────────────────────────────────────────────────────────────

const VALIDATORS = {
  content_translation: (d) => {
    if (!d || typeof d.translation !== "string" || !d.translation.trim()) {
      return "translation missing";
    }
    return null;
  },
  host_copilot: (d) => {
    if (!d || typeof d.title !== "string" || !d.title) return "title missing";
    if (typeof d.description !== "string" || !d.description) {
      return "description missing";
    }
    if (d.priceSuggestion !== null &&
        typeof d.priceSuggestion?.amount !== "number") {
      return "priceSuggestion malformed";
    }
    if (d.turnoutPrediction !== null &&
        typeof d.turnoutPrediction?.expected !== "number") {
      return "turnoutPrediction malformed";
    }
    return null;
  },
  member_intel: (d) => {
    if (!d || typeof d.pulse !== "string" || !d.pulse) return "pulse missing";
    if (!d.metrics || typeof d.metrics.coolingOff !== "number" ||
        typeof d.metrics.regulars !== "number") return "metrics malformed";
    if (!d.winBack || typeof d.winBack.message !== "string") {
      return "winBack malformed";
    }
    return null;
  },
  ai_analytics: (d) => {
    if (!d || typeof d.narrative !== "string" || !d.narrative) {
      return "narrative missing";
    }
    if (!Array.isArray(d.recommendations)) return "recommendations malformed";
    for (const r of d.recommendations) {
      if (typeof r?.text !== "string") return "recommendation malformed";
    }
    return null;
  },
  business_dashboard: (d) => {
    if (!d || typeof d.narrative !== "string" || !d.narrative) {
      return "narrative missing";
    }
    if (!d.projection || typeof d.projection.note !== "string") {
      return "projection malformed";
    }
    if (!Array.isArray(d.recommendations)) return "recommendations malformed";
    for (const r of d.recommendations) {
      if (typeof r?.text !== "string") return "recommendation malformed";
    }
    return null;
  },
  momentum_action: (d) => {
    if (!d || typeof d.actionTitle !== "string" || !d.actionTitle) {
      return "actionTitle missing";
    }
    if (!["low", "medium", "high", "urgent"].includes(d.priority)) {
      return "priority invalid";
    }
    if (typeof d.message !== "string" || !d.message) return "message missing";
    return null;
  },
  match_intel: (d) => {
    if (!d || typeof d.rationale !== "string" || !d.rationale) {
      return "rationale missing";
    }
    if (!Array.isArray(d.icebreakers) || d.icebreakers.length < 1 ||
        d.icebreakers.some((i) => typeof i !== "string")) {
      return "icebreakers malformed";
    }
    return null;
  },
  weekly_digest: (d, ctx) => {
    if (!d || typeof d.greeting !== "string") return "greeting missing";
    if (typeof d.narrative !== "string" || !d.narrative) {
      return "narrative missing";
    }
    if (!Array.isArray(d.picks)) return "picks malformed";
    const valid = new Set([
      ...ctx.upcoming.map((e) => e.eventId),
      ...ctx.openingSoon.map((e) => e.eventId),
    ]);
    for (const p of d.picks) {
      if (!valid.has(p?.eventId)) return `ungrounded eventId ${p?.eventId}`;
    }
    return null;
  },
};

// ─── Access gates (beyond opt-in + daily budget, per §1.8) ──────────────────
// Each returns null when allowed, or {error, needsPro?/needsPlus?}.

const GATES = {
  // Translate: Plus members AND Pro hosts get it unlimited; everyone else gets
  // 1 free translation per month, then the client routes to the paywall
  // (Plus, or Pro if the user is a host).
  content_translation: async (db, uid, user, cfg) => {
    if (user.plan === "kinlo_plus" || user.isPremium === true) return null;
    const monthKey = new Date().toISOString().slice(0, 7);
    const ref = db.collection("aiUsage").doc(uid);
    const snap = await ref.get();
    const d = snap.exists ? snap.data() : {};
    const used = d.translateMonth === monthKey ? (d.translateCount || 0) : 0;
    if (used >= (cfg.features.content_translation.freePerMonth || 1)) {
      return {error: "taste_limit", needsPlus: true};
    }
    await ref.set(
      {translateMonth: monthKey, translateCount: used + 1}, {merge: true});
    return null;
  },
  host_copilot: async (db, uid, user, cfg) => {
    if (user.isPremium === true) return null;
    // Free taste: one lifetime draft, tracked in aiUsage.
    const usage = await db.collection("aiUsage").doc(uid).get();
    const drafts = usage.exists ? (usage.data().copilotDrafts || 0) : 0;
    if (drafts >= (cfg.features.host_copilot.freeDrafts || 1)) {
      return {error: "needs_pro", needsPro: true};
    }
    await db.collection("aiUsage").doc(uid)
      .set({copilotDrafts: drafts + 1}, {merge: true});
    return null;
  },
  member_intel: async (db, uid, user) =>
    user.isPremium === true ? null : {error: "needs_pro", needsPro: true},
  business_dashboard: async (db, uid, user) =>
    user.isPremium === true ? null : {error: "needs_pro", needsPro: true},
  momentum_action: async (db, uid, user) =>
    user.isPremium === true ? null : {error: "needs_pro", needsPro: true},
  ai_analytics: async () => null, // taste = headline; full text is the same
  // call in v1 — the client dims recommendations for non-Pro.
  match_intel: async () => null, // rationale free; icebreakers locked below.
  weekly_digest: async (db, uid, user, cfg) => {
    if (user.plan === "kinlo_plus") return null;
    const monthKey = new Date().toISOString().slice(0, 7);
    const ref = db.collection("aiUsage").doc(uid);
    const snap = await ref.get();
    const d = snap.exists ? snap.data() : {};
    const used = d.digestMonth === monthKey ? (d.digestCount || 0) : 0;
    if (used >= (cfg.features.weekly_digest.freePerMonth || 1)) {
      return {error: "taste_limit", needsPlus: true};
    }
    await ref.set(
      {digestMonth: monthKey, digestCount: used + 1}, {merge: true});
    return null;
  },
};

// Post-processing per §1.8 tastes (server-side, so clients can't bypass).
const POSTPROCESS = {
  match_intel: (data, user) => {
    if (user.plan === "kinlo_plus") return {...data, icebreakersLocked: false};
    return {...data, icebreakers: [], icebreakersLocked: true};
  },
  ai_analytics: (data, user) => {
    if (user.isPremium === true) return {...data, locked: false};
    // Taste: headline only — recommendations locked for non-Pro.
    return {narrative: data.narrative, recommendations: [], locked: true};
  },
};

module.exports = {
  DEFAULTS,
  CONTEXT_LOADERS: {
    host_copilot: loadHostCopilot,
    member_intel: loadMemberIntel,
    ai_analytics: loadAiAnalytics,
    match_intel: loadMatchIntel,
    weekly_digest: loadWeeklyDigest,
    content_translation: loadContentTranslation,
    business_dashboard: loadBusinessDashboard,
    momentum_action: loadMomentumAction,
  },
  PROMPTS,
  VALIDATORS,
  GATES,
  POSTPROCESS,
};
