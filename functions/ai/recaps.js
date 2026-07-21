/**
 * Post-event recaps (Smart Wall §10): when a checked-in attendee shares a
 * moment (events/{eventId}/recapPhotos), create — or extend — the event's
 * recap post on the Wall with an AI caption grounded in the event's real
 * data. One recap post per event (id stored at events/{id}.recapPostId).
 * On AI failure the caption falls back to a plain line — never blocked.
 */

const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {FieldValue} = require("firebase-admin/firestore");
const {getAiConfig, callAnthropic} = require("./foundation");
const roster = require("../utils/roster");

const MAX_RECAP_IMAGES = 3;

/**
 * Build the trigger with shared handles.
 * @param {FirebaseFirestore.Firestore} db Firestore
 * @param {object} anthropicKey secret handle
 * @return {object} the trigger export
 */
function buildOnRecapPhotoCreated(db, anthropicKey) {
  return onDocumentCreated(
    {document: "events/{eventId}/recapPhotos/{photoId}",
      secrets: [anthropicKey]},
    async (event) => {
      const {eventId} = event.params;
      const photo = event.data ? event.data.data() : null;
      if (!photo || !photo.url) return;

      const evRef = db.collection("events").doc(eventId);
      const evSnap = await evRef.get();
      if (!evSnap.exists) return;
      const ev = evSnap.data();

      // Recaps are strictly post-event.
      if (!ev.date || new Date(ev.date).getTime() > Date.now()) return;

      // Extend an existing recap post (up to 3 photos, per the mockup grid).
      if (ev.recapPostId) {
        const postRef = db.collection("posts").doc(ev.recapPostId);
        await db.runTransaction(async (tx) => {
          const post = await tx.get(postRef);
          if (!post.exists) return;
          const images = post.data().images || [];
          if (images.length >= MAX_RECAP_IMAGES) return;
          tx.update(postRef, {images: [...images, photo.url]});
        });
        return;
      }

      // First moment → AI caption + recap post. ROSTER (fix/privacy-event-roster):
      // the recap needs the attendee LIST (route into their feeds + "You were
      // there ✓") → read the active roster, not the removed array.
      const attendees = await roster.activeUids(db, eventId);
      let caption = `What a time at ${ev.title || "this event"}.`;
      try {
        const cfg = await getAiConfig(db);
        const {json} = await callAnthropic(
          cfg,
          anthropicKey.value(),
          "You write one warm, short recap line (max 120 chars) for a " +
            "community event that just happened. Ground it ONLY in the " +
            "given facts; never invent names or numbers. Return STRICT " +
            "JSON: {\"caption\":string}. English.",
          JSON.stringify({
            title: ev.title || "",
            city: ev.city || null,
            attendeeCount: attendees.length,
            category: ev.category || null,
          }),
          150,
        );
        if (json && typeof json.caption === "string" && json.caption) {
          caption = json.caption.slice(0, 160);
        }
      } catch (e) {
        console.warn("recap caption fallback:", e.message);
      }

      const postRef = await db.collection("posts").add({
        type: "recap",
        eventId,
        eventTitle: ev.title || "",
        authorId: ev.creatorId || photo.uid,
        text: caption,
        images: [photo.url],
        // Snapshot so the Wall can show "You were there ✓" and route the
        // recap into attendees' feeds (capped for doc-size safety).
        attendeeIds: attendees.slice(0, 100),
        likeCount: 0,
        commentCount: 0,
        createdAt: FieldValue.serverTimestamp(),
      });
      await evRef.update({recapPostId: postRef.id});
    },
  );
}

module.exports = {buildOnRecapPhotoCreated};
