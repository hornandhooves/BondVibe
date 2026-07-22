/**
 * AI Foundation — the single gateway between Kinlo and Anthropic Claude.
 * (kinlo_build/ai_features/02_AI_FOUNDATION.md)
 *
 * Contract (callable `callClaude`):
 *   data: { feature: "smart_wall" | "ask_kinlo", input: {...} }
 *   returns: { ok:true, data:<feature JSON> }
 *          | { ok:false, error:string, fallback:true, needsPlus?:true }
 *
 * Guarantees:
 *  - API key server-side only (Functions secret).
 *  - Auth required; attendee AI honors users/{uid}.aiOptIn.
 *  - Per-user daily rate limit + freemium "taste" counters (server-enforced).
 *  - Least-privilege context: each feature loads only the data it needs.
 *  - Grounded, schema-validated JSON out (retry once, then fallback:true).
 *  - Every call logged to `aiEvents` (feature, tokens, latency, outcome —
 *    ids only, no message bodies / PII).
 *  - Nothing hardcoded: model id, token caps, limits and tastes read from
 *    Firestore `config/ai` (admin-tunable) over code defaults.
 */

const {onCall} = require("firebase-functions/v2/https");
const p2 = require("./features");
const roster = require("../utils/roster");

// Abuse ceiling on the Anthropic bill. App Check binds calls to a genuine app
// build (stops scripted key-farming); maxInstances caps burst concurrency so a
// flood can't fan out to unbounded spend. App Check ENFORCEMENT is env-gated
// (AI_ENFORCE_APP_CHECK=true) because the RN client only attaches App Check
// tokens from the next native build (docs/APP_CHECK_SETUP.md) — flip it on with
// that build so we don't lock out current beta testers. Tokens are still
// verified when present regardless.
const AI_MAX_INSTANCES = 10;
const ENFORCE_APP_CHECK = process.env.AI_ENFORCE_APP_CHECK === "true";

// ─── Tunables: defaults, overridable via Firestore config/ai ────────────────
const AI_DEFAULTS = {
  model: "claude-sonnet-4-6",
  anthropicVersion: "2023-06-01",
  dailyCallLimit: 40, // per user, across AI features
  // Circuit breaker across ALL users for one day — a stolen token / abuse spike
  // trips this long before it becomes a large Anthropic invoice. Counts every
  // Anthropic round-trip, retries included.
  globalDailyCallLimit: 5000,
  features: {
    smart_wall: {maxTokens: 1400, candidateLimit: 20, cacheTtlMinutes: 90},
    ask_kinlo: {
      maxTokens: 700,
      // Freemium taste (spec §1.8): free users get N questions per week.
      freeTastePerWeek: 3,
      searchLimit: 12,
    },
    ...p2.DEFAULTS,
  },
};

/**
 * Merge Firestore config/ai over the code defaults.
 * @param {FirebaseFirestore.Firestore} db Firestore handle
 * @return {Promise<object>} effective config
 */
async function getAiConfig(db) {
  try {
    const snap = await db.collection("config").doc("ai").get();
    if (!snap.exists) return AI_DEFAULTS;
    const remote = snap.data() || {};
    const features = {};
    for (const key of Object.keys(AI_DEFAULTS.features)) {
      features[key] = {
        ...AI_DEFAULTS.features[key],
        ...((remote.features || {})[key] || {}),
      };
    }
    return {...AI_DEFAULTS, ...remote, features};
  } catch (e) {
    console.error("config/ai read failed, using defaults:", e);
    return AI_DEFAULTS;
  }
}

// ─── Usage: daily limit + weekly taste, one doc per user ────────────────────

/**
 * Consume one call from the user's budget in a transaction.
 * @param {FirebaseFirestore.Firestore} db Firestore handle
 * @param {string} uid caller
 * @param {string} feature feature key
 * @param {object} cfg effective AI config
 * @param {boolean} isPlus caller has Kinlo Plus
 * @return {Promise<object>} verdict {allowed, reason}
 */
async function consumeBudget(db, uid, feature, cfg, isPlus) {
  const ref = db.collection("aiUsage").doc(uid);
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  // ISO week key: YYYY-Www
  const week = (() => {
    const d = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  })();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const day = data.day === dayKey ? data : {day: dayKey, calls: 0};
    const wk = data.week === week ? data : {...data, week, weekly: {}};

    if ((day.calls || 0) >= cfg.dailyCallLimit) {
      return {allowed: false, reason: "rate_limited"};
    }

    // Freemium taste: ask_kinlo capped per week for non-Plus users.
    if (feature === "ask_kinlo" && !isPlus) {
      const used = (wk.weekly && wk.weekly.ask_kinlo) || 0;
      if (used >= cfg.features.ask_kinlo.freeTastePerWeek) {
        return {allowed: false, reason: "taste_limit"};
      }
    }

    // Preserve unrelated keys (copilotDrafts, digestMonth/Count from the
    // feature gates) — a plain overwrite here silently reset the tastes.
    tx.set(ref, {
      ...data,
      day: dayKey,
      calls: (day.calls || 0) + 1,
      week,
      weekly: {
        ...(wk.weekly || {}),
        [feature]: (((wk.weekly || {})[feature]) || 0) + 1,
      },
      updatedAt: now.toISOString(),
    }, {merge: false});
    return {allowed: true};
  });
}

/**
 * Charge `n` Anthropic round-trips against the GLOBAL daily circuit breaker.
 * Denies (without incrementing) once the day is over budget, so a single
 * runaway/abuse source can't run up an unbounded bill. Separate from the
 * per-user budget: this is the last line before real money.
 * @param {FirebaseFirestore.Firestore} db Firestore handle
 * @param {object} cfg effective AI config
 * @param {number} n calls to charge (1 for a first call, 1 more per retry)
 * @return {Promise<object>} verdict {allowed, reason}
 */
async function consumeGlobal(db, cfg, n = 1) {
  const ref = db.collection("aiUsage").doc("_global");
  const dayKey = new Date().toISOString().slice(0, 10);
  const limit = cfg.globalDailyCallLimit || AI_DEFAULTS.globalDailyCallLimit;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const calls = data.day === dayKey ? (data.calls || 0) : 0;
    if (calls >= limit) return {allowed: false, reason: "global_rate_limited"};
    tx.set(ref, {day: dayKey, calls: calls + n,
      updatedAt: new Date().toISOString()}, {merge: false});
    return {allowed: true};
  });
}

// ─── Context loaders (least-privilege) ──────────────────────────────────────

/**
 * Load only what Smart Wall needs: the user's tastes + upcoming candidate
 * events + which followed friends are going.
 * @param {FirebaseFirestore.Firestore} db Firestore handle
 * @param {string} uid caller
 * @param {object} cfg effective AI config
 * @return {Promise<object>} grounded context
 */
async function loadSmartWallContext(db, uid, cfg) {
  const nowIso = new Date().toISOString();
  const [userSnap, matchSnap, eventsSnap, followsSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    // PRIVACY (fix/privacy-*): personality lives in the gated
    // users/{uid}/match/profile subdoc, not the world-readable main doc.
    db.collection("users").doc(uid).collection("match").doc("profile").get(),
    db.collection("events")
      .where("date", ">=", nowIso)
      .orderBy("date", "asc")
      .limit(cfg.features.smart_wall.candidateLimit)
      .get(),
    db.collection("follows")
      .where("followerId", "==", uid).limit(200).get(),
  ]);
  const u = userSnap.exists ? userSnap.data() : {};
  const personality = (matchSnap.exists && matchSnap.data().personality) || null;
  const following = new Set(
    followsSnap.docs.map((d) => d.data().followeeId).filter(Boolean));
  // ROSTER (fix/privacy-event-roster): friendsGoing needs the LIST of attendees
  // (intersect with who the user follows) → read each candidate's active roster.
  // The COUNT (spotsLeft) uses participantCount — no extra reads.
  const candidates = await Promise.all(eventsSnap.docs.map(async (d) => {
    const e = d.data();
    const activeUids = await roster.activeUids(db, d.id);
    const friendsGoing = activeUids.filter((a) => following.has(a)).length;
    return {
      eventId: d.id,
      title: e.title || "",
      startsAt: e.date || null,
      category: e.category || null,
      city: e.city || null,
      price: e.price || 0,
      friendsGoing,
      // §2.4 signals feed the ranking: the user's own soft-interest is a
      // strong boost; overall interest is social proof.
      userInterested: (e.interested || []).includes(uid),
      interestedCount: (e.interested || []).length,
      spotsLeft: e.maxAttendees ?
        Math.max(0, e.maxAttendees - (e.participantCount || 0)) : null,
    };
  }));
  return {
    user: {
      interests: u.interests || [],
      personalityScores: personality,
      city: u.location || null,
    },
    candidates,
  };
}

/**
 * Load only what Ask Kinlo needs: light user profile + upcoming events the
 * concierge may reference (grounding pool).
 * @param {FirebaseFirestore.Firestore} db Firestore handle
 * @param {string} uid caller
 * @param {object} cfg effective AI config
 * @return {Promise<object>} grounded context
 */
async function loadAskKinloContext(db, uid, cfg) {
  const nowIso = new Date().toISOString();
  const [userSnap, eventsSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("events")
      .where("date", ">=", nowIso)
      .orderBy("date", "asc")
      .limit(cfg.features.ask_kinlo.searchLimit)
      .get(),
  ]);
  const u = userSnap.exists ? userSnap.data() : {};
  const events = eventsSnap.docs.map((d) => {
    const e = d.data();
    return {
      eventId: d.id,
      title: e.title || "",
      startsAt: e.date || null,
      category: e.category || null,
      city: e.city || null,
      price: e.price || 0,
      going: e.participantCount || 0, // ROSTER: count from participantCount
    };
  });
  return {
    user: {
      name: (u.fullName || "").split(" ")[0] || "there",
      interests: u.interests || [],
      city: u.location || null,
    },
    events,
  };
}

// ─── Prompts (shared skeleton per spec) ─────────────────────────────────────

const SYSTEM_BASE =
  "You are Kinlo's community intelligence. You help people belong and " +
  "show up in real life. You are given ONLY this user's real Kinlo " +
  "context. Never invent events, people, or numbers. Return STRICT JSON " +
  "matching the schema. Warm, concise, first-person-friendly. English.";

const PROMPTS = {
  smart_wall: (ctx) => ({
    system: SYSTEM_BASE +
      " Schema: {\"digest\":{\"text\":string}," +
      "\"feed\":[{\"eventId\":string,\"reason\":string,\"score\":number}]}" +
      " Rank the BEST 8 candidate events by fit (interests, personality, friends " +
      "going, time proximity). reason = one short grounded line. Only use " +
      "eventIds from the context. digest.text = 1-2 sentence weekly framing.",
    user: JSON.stringify(ctx),
  }),
  ask_kinlo: (ctx, input) => ({
    system: SYSTEM_BASE +
      " Schema: {\"reply\":string," +
      "\"attachments\":[{\"type\":\"event\",\"eventId\":string}]," +
      "\"suggestions\":[string]}" +
      " Answer the user's question using ONLY events in the context. " +
      "Attach at most 3 relevant eventIds. If nothing matches, say so and " +
      "offer to broaden. suggestions = up to 3 short follow-up chips.",
    user: JSON.stringify({context: ctx, question: String(input.question ||
      "").slice(0, 500)}),
  }),
};

// ─── Output validation (dependency-free, strict) ────────────────────────────

const VALIDATORS = {
  smart_wall: (data, ctx) => {
    if (!data || typeof data !== "object") return "not an object";
    if (!data.digest || typeof data.digest.text !== "string") {
      return "digest.text missing";
    }
    if (!Array.isArray(data.feed)) return "feed not an array";
    const valid = new Set(ctx.candidates.map((c) => c.eventId));
    for (const item of data.feed) {
      if (!item || typeof item.eventId !== "string" ||
          typeof item.reason !== "string" ||
          typeof item.score !== "number") {
        return "feed item malformed";
      }
      if (!valid.has(item.eventId)) return `ungrounded eventId ${item.eventId}`;
    }
    return null;
  },
  ask_kinlo: (data, ctx) => {
    if (!data || typeof data !== "object") return "not an object";
    if (typeof data.reply !== "string" || !data.reply) return "reply missing";
    if (!Array.isArray(data.attachments)) return "attachments not an array";
    const valid = new Set(ctx.events.map((e) => e.eventId));
    for (const a of data.attachments) {
      if (!a || a.type !== "event" || typeof a.eventId !== "string") {
        return "attachment malformed";
      }
      if (!valid.has(a.eventId)) return `ungrounded eventId ${a.eventId}`;
    }
    if (!Array.isArray(data.suggestions)) data.suggestions = [];
    return null;
  },
};

// ─── Anthropic call ─────────────────────────────────────────────────────────

/**
 * One Messages API call returning parsed JSON + usage.
 * @param {object} cfg effective AI config
 * @param {string} apiKey Anthropic key
 * @param {string} system system prompt
 * @param {string} user user content
 * @param {number} maxTokens output cap
 * @return {Promise<object>} result {json, usage, raw}
 */
async function callAnthropic(cfg, apiKey, system, user, maxTokens) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": cfg.anthropicVersion,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{role: "user", content: user}],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`anthropic ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const raw = (data.content?.[0]?.text || "").trim();
  // Tolerate code fences around the JSON.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let json = null;
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    json = null;
  }
  return {json, usage: data.usage || {}, raw};
}

// ─── The callable ───────────────────────────────────────────────────────────

const CONTEXT_LOADERS = {
  smart_wall: loadSmartWallContext,
  ask_kinlo: loadAskKinloContext,
  ...p2.CONTEXT_LOADERS,
};
Object.assign(PROMPTS, p2.PROMPTS);
Object.assign(VALIDATORS, p2.VALIDATORS);

/**
 * Register the callClaude callable on the given admin app/db.
 * @param {FirebaseFirestore.Firestore} db Firestore handle
 * @param {object} anthropicKey defineSecret handle
 * @return {object} the callable export
 */
function buildCallClaude(db, anthropicKey) {
  return onCall({secrets: [anthropicKey], timeoutSeconds: 60,
    enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: AI_MAX_INSTANCES},
  async (request) => {
    const started = Date.now();
    const uid = request.auth?.uid;
    const feature = String(request.data?.feature || "");
    const input = request.data?.input || {};

    /**
         * Write one aiEvents log row (ids/counters only — no bodies).
         * @param {string} outcome ok|fallback|denied|error
         * @param {object} extra additional fields
         */
    const log = async (outcome, extra = {}) => {
      try {
        await db.collection("aiEvents").add({
          uid: uid || null,
          feature,
          outcome,
          latencyMs: Date.now() - started,
          createdAt: new Date().toISOString(),
          ...extra,
        });
      } catch (e) {
        console.error("aiEvents log failed:", e);
      }
    };

    if (!uid) {
      await log("denied", {reason: "unauthenticated"});
      return {ok: false, error: "unauthenticated", fallback: true};
    }
    if (!CONTEXT_LOADERS[feature]) {
      await log("denied", {reason: "unknown_feature"});
      return {ok: false, error: "unknown_feature", fallback: true};
    }

    const cfg = await getAiConfig(db);

    // Opt-in + subscription state.
    const userSnap = await db.collection("users").doc(uid).get();
    const u = userSnap.exists ? userSnap.data() : {};
    if (u.aiOptIn !== true) {
      await log("denied", {reason: "not_opted_in"});
      return {ok: false, error: "not_opted_in", fallback: true};
    }
    const isPlus = u.plan === "kinlo_plus";

    // Feature-specific access gate (Pro requirement / freemium taste).
    if (p2.GATES[feature]) {
      const denial = await p2.GATES[feature](db, uid, u, cfg);
      if (denial) {
        await log("denied", {reason: denial.error});
        return {ok: false, fallback: true, ...denial};
      }
    }

    const budget = await consumeBudget(db, uid, feature, cfg, isPlus);
    if (!budget.allowed) {
      await log("denied", {reason: budget.reason});
      return {
        ok: false,
        error: budget.reason,
        fallback: true,
        ...(budget.reason === "taste_limit" ? {needsPlus: true} : {}),
      };
    }

    // GLOBAL circuit breaker — the per-user budget is spent; now charge the
    // shared daily ceiling before touching Anthropic (real money starts here).
    const g = await consumeGlobal(db, cfg, 1);
    if (!g.allowed) {
      await log("denied", {reason: g.reason});
      return {ok: false, error: g.reason, fallback: true};
    }

    try {
      const ctx = await CONTEXT_LOADERS[feature](db, uid, cfg, input);
      const {system, user} = PROMPTS[feature](ctx, input);
      const maxTokens = cfg.features[feature].maxTokens;

      let attempt = await callAnthropic(
        cfg, anthropicKey.value(), system, user, maxTokens);
      let validationError = attempt.json ?
        VALIDATORS[feature](attempt.json, ctx) : "no JSON";

      if (validationError) {
        // The retry is a SECOND Anthropic round-trip — charge it against both
        // the user's daily budget and the global ceiling so a feature that
        // always fails validation can't burn 2× spend uncounted.
        await consumeGlobal(db, cfg, 1).catch(() => {});
        await consumeBudget(db, uid, feature, cfg, isPlus).catch(() => {});
        // One retry, reminding the model of the contract.
        attempt = await callAnthropic(cfg, anthropicKey.value(),
          system + " Previous output was invalid (" + validationError +
                "). Return ONLY the JSON object.", user, maxTokens);
        validationError = attempt.json ?
          VALIDATORS[feature](attempt.json, ctx) : "no JSON";
      }

      if (validationError) {
        await log("fallback", {reason: validationError.slice(0, 120)});
        return {ok: false, error: "invalid_output", fallback: true};
      }

      await log("ok", {
        inputTokens: attempt.usage.input_tokens || 0,
        outputTokens: attempt.usage.output_tokens || 0,
      });
      // Server-side taste enforcement (§1.8) — clients can't bypass.
      const data = p2.POSTPROCESS[feature] ?
        p2.POSTPROCESS[feature](attempt.json, u) : attempt.json;
      return {ok: true, data};
    } catch (e) {
      console.error("callClaude error:", e);
      await log("error", {reason: String(e.message || e).slice(0, 120)});
      return {ok: false, error: "ai_unavailable", fallback: true};
    }
  });
}

module.exports = {
  buildCallClaude,
  callAnthropic, // reused by the recap trigger
  // exported for unit tests
  getAiConfig,
  consumeBudget,
  consumeGlobal,
  VALIDATORS,
  AI_DEFAULTS,
};
