/**
 * Ask Kinlo streaming (ai_features/11 "streaming on"). SSE over onRequest:
 *
 *   POST /askKinloStream   Authorization: Bearer <Firebase ID token>
 *   body: {question}
 *   ← SSE frames: {"t":"text chunk"}… then {"attachments":[…],
 *     "suggestions":[…],"done":true}
 *
 * The model streams its conversational reply as plain text, then emits a
 * ###JSON### tail with attachments/suggestions. Text chunks relay to the
 * client live; the tail is buffered, parsed and GROUNDED server-side
 * (ungrounded eventIds are dropped) before the final frame.
 * Same guardrails as the callable: auth, aiOptIn, daily budget + weekly
 * taste (consumeBudget), aiEvents logging.
 */

const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {getAiConfig, consumeBudget, consumeGlobal} = require("./foundation");

const MARKER = "###JSON###";

// Mirror the callable's abuse ceiling: cap burst concurrency, and (once the
// native App Check build ships — docs/APP_CHECK_SETUP.md) require a valid App
// Check token. Env-gated so current beta clients, which don't attach one yet,
// aren't locked out. This is an onRequest, so App Check is verified by hand.
const AI_MAX_INSTANCES = 10;
const ENFORCE_APP_CHECK = process.env.AI_ENFORCE_APP_CHECK === "true";

/**
 * Build the streaming endpoint.
 * @param {FirebaseFirestore.Firestore} db Firestore
 * @param {object} anthropicKey secret handle
 * @return {object} the https export
 */
function buildAskKinloStream(db, anthropicKey) {
  return onRequest(
    // invoker public = anyone can reach the URL; real auth is the Firebase
    // ID token verified below (same trust model as onCall endpoints).
    {secrets: [anthropicKey], timeoutSeconds: 120, cors: true,
      invoker: "public", maxInstances: AI_MAX_INSTANCES},
    async (req, res) => {
      const started = Date.now();
      const log = async (outcome, extra = {}) => {
        try {
          await db.collection("aiEvents").add({
            uid: extra.uid || null,
            feature: "ask_kinlo",
            transport: "sse",
            outcome,
            latencyMs: Date.now() - started,
            createdAt: new Date().toISOString(),
            ...extra,
          });
        } catch (e) {
          console.error("aiEvents log failed:", e);
        }
      };

      const fail = (code, error, extra = {}) => {
        res.status(code).json({ok: false, error, fallback: true, ...extra});
      };

      if (req.method !== "POST") return fail(405, "method_not_allowed");

      // Auth via Bearer ID token.
      const authz = req.headers.authorization || "";
      const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : null;
      if (!idToken) return fail(401, "unauthenticated");
      let uid;
      try {
        uid = (await admin.auth().verifyIdToken(idToken)).uid;
      } catch (e) {
        return fail(401, "unauthenticated");
      }

      // App Check: onCall enforces natively; here (onRequest) verify by hand.
      if (ENFORCE_APP_CHECK) {
        const acToken = req.header("X-Firebase-AppCheck");
        if (!acToken) return fail(401, "app_check_required");
        try {
          await admin.appCheck().verifyToken(acToken);
        } catch (e) {
          return fail(401, "app_check_failed");
        }
      }

      const userSnap = await db.collection("users").doc(uid).get();
      const u = userSnap.exists ? userSnap.data() : {};
      if (u.aiOptIn !== true) {
        await log("denied", {uid, reason: "not_opted_in"});
        return fail(403, "not_opted_in");
      }
      const isPlus = u.plan === "kinlo_plus";
      const cfg = await getAiConfig(db);
      const budget = await consumeBudget(db, uid, "ask_kinlo", cfg, isPlus);
      if (!budget.allowed) {
        await log("denied", {uid, reason: budget.reason});
        return fail(429, budget.reason,
          budget.reason === "taste_limit" ? {needsPlus: true} : {});
      }
      // GLOBAL circuit breaker before the Anthropic round-trip (real money).
      const g = await consumeGlobal(db, cfg, 1);
      if (!g.allowed) {
        await log("denied", {uid, reason: g.reason});
        return fail(429, g.reason);
      }

      // Grounding pool — same loader shape as the callable path.
      const nowIso = new Date().toISOString();
      const eventsSnap = await db.collection("events")
        .where("date", ">=", nowIso).orderBy("date", "asc")
        .limit(cfg.features.ask_kinlo.searchLimit).get();
      const events = eventsSnap.docs.map((d) => {
        const e = d.data();
        return {eventId: d.id, title: e.title || "", startsAt: e.date || null,
          category: e.category || null, city: e.city || null,
          price: e.price || 0, going: e.participantCount || 0}; // ROSTER: count
      });
      const validIds = new Set(events.map((e) => e.eventId));
      const question = String((req.body || {}).question || "").slice(0, 500);

      const system =
        "You are Kinlo's community intelligence. You help people belong " +
        "and show up in real life. Use ONLY events in the provided " +
        "context; never invent events or numbers. English, warm, concise. " +
        "First stream your conversational reply as PLAIN TEXT (no JSON). " +
        `Then on a new line output ${MARKER} followed by STRICT JSON: ` +
        "{\"attachments\":[{\"type\":\"event\",\"eventId\":string}]," +
        "\"suggestions\":[string]} — at most 3 attachments, up to 3 " +
        "short follow-up suggestions.";

      let upstream;
      try {
        upstream = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey.value(),
            "anthropic-version": cfg.anthropicVersion,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: cfg.model,
            max_tokens: cfg.features.ask_kinlo.maxTokens,
            stream: true,
            system,
            messages: [{role: "user",
              content: JSON.stringify({context: {events}, question})}],
          }),
        });
      } catch (e) {
        await log("error", {uid, reason: String(e.message).slice(0, 120)});
        return fail(502, "ai_unavailable");
      }
      if (!upstream.ok) {
        await log("error", {uid, reason: `anthropic ${upstream.status}`});
        return fail(502, "ai_unavailable");
      }

      res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

      let full = "";
      let tail = null; // buffered after MARKER
      const decoder = new TextDecoder();
      const reader = upstream.body.getReader();
      let sseBuf = "";
      try {
        for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          sseBuf += decoder.decode(value, {stream: true});
          const lines = sseBuf.split("\n");
          sseBuf = lines.pop(); // keep incomplete line
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let evt;
            try {
              evt = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            const chunk = evt.type === "content_block_delta" ?
              (evt.delta && evt.delta.text) || "" : "";
            if (!chunk) continue;
            if (tail !== null) {
              tail += chunk;
              continue;
            }
            full += chunk;
            const idx = full.indexOf(MARKER);
            if (idx >= 0) {
              // Emit any text before the marker, start buffering the tail.
              const before = full.slice(0, idx);
              const already = full.length - chunk.length;
              if (before.length > already) {
                send({t: before.slice(already)});
              }
              tail = full.slice(idx + MARKER.length);
            } else {
              send({t: chunk});
            }
          }
        }
      } catch (e) {
        console.error("stream relay error:", e);
      }

      // Parse + ground the JSON tail; drop anything not in the context.
      let attachments = [];
      let suggestions = [];
      if (tail) {
        try {
          const parsed = JSON.parse(
            tail.trim().replace(/^```(json)?/i, "").replace(/```$/, ""));
          attachments = (parsed.attachments || [])
            .filter((a) => a && a.type === "event" && validIds.has(a.eventId))
            .slice(0, 3);
          suggestions = (parsed.suggestions || [])
            .filter((s) => typeof s === "string").slice(0, 3);
        } catch (e) {
          console.warn("tail parse failed:", e.message);
        }
      }
      send({attachments, suggestions, done: true});
      res.end();
      await log("ok", {uid});
    },
  );
}

module.exports = {buildAskKinloStream};
