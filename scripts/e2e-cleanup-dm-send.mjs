#!/usr/bin/env node
/**
 * KIN-275 cleanup — deletes the qaSeed:"KIN275-DM-SEND" thread doc, its
 * "messages" subcollection (the flow's sendDM() call — dmService.js:74 —
 * writes one message doc there, NOT tagged with qaSeed since the app writes
 * it, not this script — deleted by parentage, same lesson as
 * e2e-cleanup-join-event.mjs's roster subcollection), and the throwaway
 * users/{otherUid} doc.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-cleanup-dm-send.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();

const QA_SEED = "KIN275-DM-SEND";

(async () => {
  const threads = await db.collection("dms").where("qaSeed", "==", QA_SEED).get();
  const users = await db.collection("users").where("qaSeed", "==", QA_SEED).get();

  console.log("antes:", JSON.stringify({ dms: threads.size, users: users.size }));

  let messagesDeleted = 0;
  for (const d of threads.docs) {
    const messages = await d.ref.collection("messages").get();
    for (const m of messages.docs) {
      await m.ref.delete();
      messagesDeleted++;
    }
    await d.ref.delete();
  }
  for (const u of users.docs) await u.ref.delete();

  const afterThreads = await db.collection("dms").where("qaSeed", "==", QA_SEED).get();
  const afterUsers = await db.collection("users").where("qaSeed", "==", QA_SEED).get();

  console.log("después:", JSON.stringify({ dms: afterThreads.size, users: afterUsers.size, messagesDeleted }));
  console.log(afterThreads.size + afterUsers.size === 0 ? "LIMPIEZA COMPLETA" : "QUEDAN RESTOS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
