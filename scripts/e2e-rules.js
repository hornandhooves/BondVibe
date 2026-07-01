/**
 * End-to-end security/flow tests for BondVibe, run against the LIVE deployed
 * Firestore rules + callable Cloud Functions of the configured project (uses
 * real Firebase Auth temp users — exactly what the app does).
 *
 * Usage:  node scripts/e2e-rules.js
 *
 * It creates temporary users + docs and cleans them up. Safe to run against the
 * dev project. Exits non-zero if any assertion fails.
 */
const fs = require("fs");
const path = require("path");

const app = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app.json"), "utf8"));
const API_KEY = app.expo.extra.EXPO_PUBLIC_FIREBASE_API_KEY;
const PROJECT = app.expo.extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

// Run against the local Firebase Emulator Suite when USE_EMULATOR=1 (or when
// firebase emulators:exec injects FIRESTORE_EMULATOR_HOST). Otherwise hit live.
const EMU = process.env.USE_EMULATOR === "1" || !!process.env.FIRESTORE_EMULATOR_HOST;
const IDT = EMU
  ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts"
  : "https://identitytoolkit.googleapis.com/v1/accounts";
const FS = EMU
  ? `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = EMU
  ? `http://127.0.0.1:5001/${PROJECT}/us-central1`
  : `https://us-central1-${PROJECT}.cloudfunctions.net`;
if (EMU) console.log("🧪 Using LOCAL emulators");

const j = (r) => r.json();
const s = (v) => ({ stringValue: v });
const b = (v) => ({ booleanValue: v });
const i = (v) => ({ integerValue: v });
const arr = (vs) => ({ arrayValue: { values: vs.map(s) } });

let pass = 0, fail = 0;
const chk = (name, got, want) => {
  const ok = Array.isArray(want) ? want.includes(got) : got === want;
  ok ? (pass++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name} → got ${got}, want ${want}`));
};
const section = (t) => console.log(`\n${t}`);

const mkUser = async () => {
  const r = await fetch(`${IDT}:signUp?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `e2e_${Date.now()}_${Math.random().toString(36).slice(2)}@bv-test.com`, password: "Test123456!", returnSecureToken: true }),
  }).then(j);
  return { idToken: r.idToken, uid: r.localId, headers: { Authorization: `Bearer ${r.idToken}`, "Content-Type": "application/json" } };
};
const createDoc = (p, fields, h) =>
  fetch(`${FS}/${p}`, { method: "POST", headers: h, body: JSON.stringify({ fields }) }).then((r) => r.status);
const patchDoc = (p, fields, h) =>
  fetch(`${FS}/${p}`, { method: "PATCH", headers: h, body: JSON.stringify({ fields }) }).then((r) => r.status);
const readDoc = (p, h) => fetch(`${FS}/${p}`, { headers: h }).then((r) => r.status);
const del = (p, h) => fetch(`${FS}/${p}`, { method: "DELETE", headers: h });
const callFn = (n, data, h) =>
  fetch(`${FN}/${n}`, { method: "POST", headers: h, body: JSON.stringify({ data }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runQuery = async (structuredQuery, h) => {
  const res = await fetch(`${FS}:runQuery`, { method: "POST", headers: h, body: JSON.stringify({ structuredQuery }) });
  const body = await res.json();
  if (!Array.isArray(body)) return { error: body.error?.message || "non-array", rows: [] };
  return { rows: body.filter((r) => r.document).map((r) => r.document.name.split("/").pop()) };
};
const getFields = async (p, h) => {
  const r = await fetch(`${FS}/${p}`, { headers: h });
  if (r.status !== 200) return null;
  return (await r.json()).fields || {};
};
const arrVals = (f) => (f?.arrayValue?.values || []).map((v) => v.stringValue);

(async () => {
  console.log(`E2E against ${PROJECT}\n========================================`);
  const host = await mkUser(), member = await mkUser(), outsider = await mkUser(), stranger = await mkUser();
  const ev = `e2e_${Date.now()}`;
  const gId = `e2eg_${Date.now()}`;
  // Unique invite code per run — a static code can collide with an orphan group
  // left by a previous failed run (joinGroupByCode matches where(code) limit 1).
  const inviteCode = `E2E${Date.now()}`;
  const cleanup = [];

  // ---- EVENTS ----
  section("Events");
  chk("host creates event", await createDoc(`events?documentId=${ev}`, {
    title: s("E2E"), creatorId: s(host.uid), attendees: arr([member.uid]), price: i(0), status: s("active"),
  }, host.headers), 200);
  chk("host CANNOT self-feature on create", await createDoc(`events?documentId=${ev}x`, {
    title: s("x"), creatorId: s(host.uid), featured: b(true),
  }, host.headers), 403);
  chk("attendee joins (attendees only)", await patchDoc(`events/${ev}?updateMask.fieldPaths=attendees`, { attendees: arr([member.uid, outsider.uid]) }, outsider.headers), 200);
  chk("attendee CANNOT set averageRating", await patchDoc(`events/${ev}?updateMask.fieldPaths=averageRating`, { averageRating: { doubleValue: 5 } }, member.headers), 403);
  chk("host CANNOT set featured via update", await patchDoc(`events/${ev}?updateMask.fieldPaths=featured`, { featured: b(true) }, host.headers), 403);

  // ---- RATINGS ----
  section("Ratings");
  const ratingId = `e2er_${Date.now()}`;
  chk("attendee creates rating", await createDoc(`ratings?documentId=${ratingId}`, {
    eventId: s(ev), hostId: s(host.uid), userId: s(member.uid), rating: i(5), comment: s("Great"),
  }, member.headers), 200);
  chk("non-attendee CANNOT rate", await createDoc(`ratings?documentId=${ratingId}b`, {
    eventId: s(ev), hostId: s(host.uid), userId: s(stranger.uid), rating: i(1),
  }, stranger.headers), 403);
  chk("rating reply by party (host)", await createDoc(`ratings/${ratingId}/messages?documentId=rm1`, {
    senderId: s(host.uid), text: s("thanks"),
  }, host.headers), 200);
  chk("rating reply by outsider blocked", await createDoc(`ratings/${ratingId}/messages?documentId=rm2`, {
    senderId: s(outsider.uid), text: s("x"),
  }, outsider.headers), 403);
  cleanup.push(`ratings/${ratingId}`);

  // ---- HOST RATING / hostStats manipulation ----
  section("Anti-manipulation");
  // Clean user docs first (so the hostStats attempt below is an UPDATE).
  await createDoc(`users?documentId=${host.uid}`, { email: s("h@x.com"), role: s("user") }, host.headers);
  await createDoc(`users?documentId=${member.uid}`, { email: s("m@x.com"), role: s("user") }, member.headers);
  chk("user CANNOT CREATE doc with hostStats", await createDoc(`users?documentId=${stranger.uid}`, {
    email: s("s@x.com"), hostStats: { mapValue: { fields: { averageRating: { doubleValue: 5 } } } },
  }, stranger.headers), 403);
  chk("user CANNOT CREATE doc with isPremium", await createDoc(`users?documentId=${stranger.uid}`, {
    email: s("s@x.com"), isPremium: b(true),
  }, stranger.headers), 403);
  chk("host CANNOT UPDATE own hostStats", await patchDoc(`users/${host.uid}?updateMask.fieldPaths=hostStats`, {
    hostStats: { mapValue: { fields: { averageRating: { doubleValue: 5 } } } },
  }, host.headers), 403);
  chk("user CANNOT UPDATE own carpoolStats", await patchDoc(`users/${member.uid}?updateMask.fieldPaths=carpoolStats`, {
    carpoolStats: { mapValue: { fields: { seatsShared: i(99) } } },
  }, member.headers), 403);
  chk("host CANNOT self-grant isPremium", await patchDoc(`users/${host.uid}?updateMask.fieldPaths=isPremium`, {
    isPremium: b(true),
  }, host.headers), 403);
  chk("host CAN set own hostConfig.payoutProcessor", await patchDoc(`users/${host.uid}?updateMask.fieldPaths=hostConfig.payoutProcessor`, {
    hostConfig: { mapValue: { fields: { payoutProcessor: s("mercadopago") } } },
  }, host.headers), 200);

  // ---- MEMBERSHIP PLANS / money-sensitive collections ----
  section("Memberships & money-sensitive");
  chk("host creates own plan", await createDoc(`membershipPlans?documentId=e2ep_${Date.now()}`, {
    hostId: s(host.uid), name: s("10 classes"), type: s("credits"), creditsIncluded: i(10), validityDays: i(30), priceCentavos: i(120000), active: b(true),
  }, host.headers), 200);
  chk("user CANNOT create plan for another host", await createDoc(`membershipPlans?documentId=e2ep2_${Date.now()}`, {
    hostId: s(host.uid), name: s("x"), type: s("credits"),
  }, member.headers), 403);
  chk("client CANNOT create membership (server-only)", await createDoc(`memberships?documentId=m1_${Date.now()}`, {
    userId: s(member.uid), hostId: s(host.uid),
  }, member.headers), 403);
  chk("client CANNOT create promotion (server-only)", await createDoc(`promotions?documentId=pr1_${Date.now()}`, {
    hostId: s(host.uid),
  }, host.headers), 403);

  // ---- EVENT POLLS ----
  section("Event polls");
  const poll = "ep1";
  chk("host creates poll", await createDoc(`events/${ev}/polls?documentId=${poll}`, { question: s("Q?"), createdBy: s(host.uid), closed: b(false) }, host.headers), 200);
  chk("member CANNOT create poll", await createDoc(`events/${ev}/polls?documentId=ep2`, { question: s("x"), createdBy: s(member.uid) }, member.headers), 403);
  chk("member votes own", await patchDoc(`events/${ev}/polls/${poll}/votes/${member.uid}`, { optionId: s("0") }, member.headers), 200);
  chk("member CANNOT vote as other", await patchDoc(`events/${ev}/polls/${poll}/votes/${host.uid}`, { optionId: s("0") }, member.headers), 403);

  // ---- CAR POOL ----
  section("Car pool");
  const cp = "ecp1";
  chk("member creates carpool", await createDoc(`events/${ev}/carpools?documentId=${cp}`, { driverId: s(member.uid), seatsTotal: i(3), from: s("Centro"), status: s("open") }, member.headers), 200);
  chk("non-participant CANNOT request seat", await patchDoc(`events/${ev}/carpools/${cp}/riders/${stranger.uid}`, { status: s("requested"), name: s("X") }, stranger.headers), 403);
  chk("rider CANNOT request as another user", await patchDoc(`events/${ev}/carpools/${cp}/riders/${member.uid}`, { status: s("requested"), name: s("fake") }, outsider.headers), 403);
  chk("host requests seat", await patchDoc(`events/${ev}/carpools/${cp}/riders/${host.uid}`, { status: s("requested"), name: s("Host") }, host.headers), 200);
  chk("non-driver CANNOT approve a rider", await patchDoc(`events/${ev}/carpools/${cp}/riders/${host.uid}`, { status: s("approved"), name: s("Host") }, outsider.headers), 403);
  chk("driver approves", await patchDoc(`events/${ev}/carpools/${cp}/riders/${host.uid}`, { status: s("approved"), name: s("Host") }, member.headers), 200);

  // ---- CARPOOL TRIGGER (loyalty reward + notifications) ----
  section("Carpool trigger (reward + notifications)");
  // onCarpoolRiderWritten: request → driver notified; approve → rider notified + driver seatsShared++.
  let seatsShared = 0;
  for (let k = 0; k < 12 && seatsShared < 1; k++) {
    await sleep(1500);
    const f = await getFields(`users/${member.uid}`, member.headers);
    seatsShared = parseInt(
      f?.carpoolStats?.mapValue?.fields?.seatsShared?.integerValue || "0", 10);
  }
  chk("approving a rider increments driver carpoolStats.seatsShared", seatsShared >= 1, true);
  const reqNotif = await runQuery({
    from: [{ collectionId: "notifications" }],
    where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: s(member.uid) } },
      { fieldFilter: { field: { fieldPath: "type" }, op: "EQUAL", value: s("carpool_request") } },
    ] } },
  }, member.headers);
  chk("driver got a seat-request notification", reqNotif.rows.length >= 1, true);
  const appNotif = await runQuery({
    from: [{ collectionId: "notifications" }],
    where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: s(host.uid) } },
      { fieldFilter: { field: { fieldPath: "type" }, op: "EQUAL", value: s("carpool_approved") } },
    ] } },
  }, host.headers);
  chk("rider got a ride-confirmed notification", appNotif.rows.length >= 1, true);

  // ---- HOST GROUPS ----
  section("Host groups");
  chk("host creates group", await createDoc(`hostGroups?documentId=${gId}`, { hostId: s(host.uid), name: s("Regulars"), inviteCode: s(inviteCode), memberIds: arr([member.uid]) }, host.headers), 200);
  chk("member reads group", await readDoc(`hostGroups/${gId}`, member.headers), 200);
  chk("outsider CANNOT read group", await readDoc(`hostGroups/${gId}`, outsider.headers), 403);
  chk("member posts message", await createDoc(`hostGroups/${gId}/messages?documentId=gm1`, { senderId: s(member.uid), type: s("text"), text: s("hi") }, member.headers), 200);
  chk("outsider CANNOT post message", await createDoc(`hostGroups/${gId}/messages?documentId=gm2`, { senderId: s(outsider.uid), type: s("text"), text: s("x") }, outsider.headers), 403);
  chk("outsider CANNOT rename group", await patchDoc(`hostGroups/${gId}?updateMask.fieldPaths=name`, { name: s("hacked") }, outsider.headers), 403);

  // ---- GROUP POLLS ----
  section("Group polls");
  const gp = "egp1";
  chk("host creates group poll", await createDoc(`hostGroups/${gId}/polls?documentId=${gp}`, { question: s("Day?"), createdBy: s(host.uid), closed: b(false) }, host.headers), 200);
  chk("member CANNOT create group poll", await createDoc(`hostGroups/${gId}/polls?documentId=egp2`, { question: s("x"), createdBy: s(member.uid) }, member.headers), 403);
  chk("member votes group poll", await patchDoc(`hostGroups/${gId}/polls/${gp}/votes/${member.uid}`, { optionId: s("0") }, member.headers), 200);

  // ---- GROUP INVITES (callable) ----
  section("Group invites");
  const join = await callFn("joinGroupByCode", { code: inviteCode }, outsider.headers);
  chk("joinGroupByCode adds member", join.status === 200 && join.body?.result?.groupId === gId, true);
  chk("outsider can read after joining", await readDoc(`hostGroups/${gId}`, outsider.headers), 200);
  const bad = await callFn("joinGroupByCode", { code: "NOPE00" }, outsider.headers);
  chk("bad invite code rejected", bad.body?.error != null, true);

  // ---- GROUP MEMBER MANAGEMENT ----
  section("Group members (add/remove)");
  chk("host adds a member", await patchDoc(`hostGroups/${gId}?updateMask.fieldPaths=memberIds`, { memberIds: arr([member.uid, stranger.uid]) }, host.headers), 200);
  chk("non-host CANNOT change members", await patchDoc(`hostGroups/${gId}?updateMask.fieldPaths=memberIds`, { memberIds: arr([member.uid]) }, member.headers), 403);
  chk("host removes a member", await patchDoc(`hostGroups/${gId}?updateMask.fieldPaths=memberIds`, { memberIds: arr([member.uid]) }, host.headers), 200);

  // ---- GROUP MESSAGING: delivered / read receipts + unread badge ----
  section("Group receipts (delivered/read/unread)");
  // onGroupMessage (trigger) marks gm1 delivered to recipients + notifies them.
  let delivered = [];
  for (let k = 0; k < 12 && !delivered.includes(host.uid); k++) {
    await sleep(1500);
    delivered = arrVals((await getFields(`hostGroups/${gId}/messages/gm1`, host.headers))?.deliveredTo);
  }
  chk("onGroupMessage marks message delivered to recipient", delivered.includes(host.uid), true);
  // Read receipt: a member may add ONLY themselves to readBy.
  chk("recipient marks message read (readBy self)", await patchDoc(`hostGroups/${gId}/messages/gm1?updateMask.fieldPaths=readBy`, { readBy: arr([host.uid]) }, host.headers), 200);
  chk("read receipt persisted", arrVals((await getFields(`hostGroups/${gId}/messages/gm1`, host.headers))?.readBy).includes(host.uid), true);
  chk("member CANNOT edit message text", await patchDoc(`hostGroups/${gId}/messages/gm1?updateMask.fieldPaths=text`, { text: s("tampered") }, member.headers), 403);
  // Unread badge: the trigger created an unread group_message notification for the host.
  const gNotif = await runQuery({
    from: [{ collectionId: "notifications" }],
    where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: s(host.uid) } },
      { fieldFilter: { field: { fieldPath: "type" }, op: "EQUAL", value: s("group_message") } },
    ] } },
  }, host.headers);
  chk("group message created an unread notification (Home badge)", gNotif.rows.length >= 1, true);
  if (gNotif.rows.length) {
    chk("owner marks group notification read (badge clears)", await patchDoc(`notifications/${gNotif.rows[0]}?updateMask.fieldPaths=read`, { read: b(true) }, host.headers), 200);
  }

  // ---- HOST-ONLY POSTING + MODERATION REPORTS ----
  section("Host-only posting + reports");
  chk("host enables host-only", await patchDoc(`hostGroups/${gId}?updateMask.fieldPaths=hostOnly`, { hostOnly: b(true) }, host.headers), 200);
  chk("member CANNOT post in host-only group", await createDoc(`hostGroups/${gId}/messages?documentId=gmho`, { senderId: s(member.uid), type: s("text"), text: s("hi") }, member.headers), 403);
  chk("host CAN post in host-only group", await createDoc(`hostGroups/${gId}/messages?documentId=gmho2`, { senderId: s(host.uid), type: s("text"), text: s("update") }, host.headers), 200);
  chk("member still votes poll in host-only", await patchDoc(`hostGroups/${gId}/polls/${gp}/votes/${member.uid}`, { optionId: s("1") }, member.headers), 200);
  await patchDoc(`hostGroups/${gId}?updateMask.fieldPaths=hostOnly`, { hostOnly: b(false) }, host.headers);
  chk("user files a report (own reporterId)", await createDoc(`reports?documentId=rep_${Date.now()}`, { reporterId: s(member.uid), type: s("prohibited_content"), reason: s("x") }, member.headers), 200);
  chk("user CANNOT file report as another", await createDoc(`reports?documentId=rep2_${Date.now()}`, { reporterId: s(host.uid), type: s("x") }, member.headers), 403);

  // ---- FOLLOWS (social graph) ----
  section("Follows (social graph)");
  const fId = `${member.uid}_${host.uid}`;
  chk("user follows another (own followerId)", await createDoc(`follows?documentId=${fId}`, { followerId: s(member.uid), followeeId: s(host.uid) }, member.headers), 200);
  chk("user CANNOT follow as another", await createDoc(`follows?documentId=${host.uid}_${member.uid}`, { followerId: s(host.uid), followeeId: s(member.uid) }, member.headers), 403);
  chk("follow doc readable", await readDoc(`follows/${fId}`, member.headers), 200);
  chk("non-owner CANNOT delete a follow", (await del(`follows/${fId}`, outsider.headers)).status, [403, 404]);
  chk("owner unfollows", (await del(`follows/${fId}`, member.headers)).status, 200);

  // ---- SCALABILITY: targeted attendee query (getPendingRatings/MyEvents) ----
  section("Scalability queries");
  const attendeeQuery = await runQuery({
    from: [{ collectionId: "events" }],
    where: { fieldFilter: { field: { fieldPath: "attendees" }, op: "ARRAY_CONTAINS", value: { stringValue: member.uid } } },
  }, member.headers);
  chk("attendees array-contains returns the event", attendeeQuery.rows.includes(ev), true);

  // ---- SCALABILITY: per-user unread aggregate (useUnreadMessages source) ----
  section("Unread aggregate");
  chk("host posts event message", await createDoc(`events/${ev}/messages?documentId=emsg1`, {
    senderId: s(host.uid), type: s("text"), text: s("hello team"), createdAt: s(new Date().toISOString()),
  }, host.headers), 200);
  // onNewMessage trigger increments notifications/event_msg_{ev}_{member}
  let unread = 0;
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    const r = await fetch(`${FS}/notifications/event_msg_${ev}_${member.uid}`, { headers: member.headers });
    if (r.status === 200) {
      const d = await r.json();
      unread = parseInt(d.fields?.unreadCount?.integerValue || "0", 10);
      if (unread > 0) break;
    }
  }
  chk("trigger incremented member unreadCount", unread >= 1, true);

  // ---- QR CHECK-IN (host-authorized attendance) ----
  section("QR check-in");
  chk("host checks in an attendee", await patchDoc(`events/${ev}/checkins/${member.uid}`, {
    userId: s(member.uid), checkedInAt: s(new Date().toISOString()),
  }, host.headers), 200);
  chk("attendee CANNOT self check-in", await patchDoc(`events/${ev}/checkins/${member.uid}`, {
    userId: s(member.uid),
  }, member.headers), 403);
  chk("outsider CANNOT check in", await patchDoc(`events/${ev}/checkins/${outsider.uid}`, {
    userId: s(outsider.uid),
  }, outsider.headers), 403);
  chk("attendee can read own check-in", await readDoc(`events/${ev}/checkins/${member.uid}`, member.headers), 200);

  // ---- CO-HOST (shared event management) ----
  section("Co-host");
  chk("creator adds a co-host", await patchDoc(`events/${ev}?updateMask.fieldPaths=coHosts`, {
    coHosts: arr([member.uid]),
  }, host.headers), 200);
  chk("co-host can edit the event", await patchDoc(`events/${ev}?updateMask.fieldPaths=title`, {
    title: s("Edited by co-host"),
  }, member.headers), 200);
  chk("co-host CANNOT change ownership", await patchDoc(`events/${ev}?updateMask.fieldPaths=creatorId`, {
    creatorId: s(member.uid),
  }, member.headers), 403);
  chk("co-host CANNOT self-feature", await patchDoc(`events/${ev}?updateMask.fieldPaths=featured`, {
    featured: b(true),
  }, member.headers), 403);
  chk("outsider (attendee) CANNOT edit title", await patchDoc(`events/${ev}?updateMask.fieldPaths=title`, {
    title: s("hacked"),
  }, outsider.headers), 403);

  // ---- joinEvent (atomic free join + capacity) ----
  section("joinEvent (atomic)");
  const evJoin = `e2ejoin_${Date.now()}`;
  const evPaid = `e2epaid_${Date.now()}`;
  await createDoc(`events?documentId=${evJoin}`, {
    title: s("Free 1-seat"), creatorId: s(host.uid), price: i(0), status: s("active"),
    maxAttendees: i(1), attendees: arr([]), date: s(new Date(Date.now() + 7 * 864e5).toISOString()),
  }, host.headers);
  await createDoc(`events?documentId=${evPaid}`, {
    title: s("Paid"), creatorId: s(host.uid), price: i(100), status: s("active"),
    attendees: arr([]), date: s(new Date(Date.now() + 7 * 864e5).toISOString()),
  }, host.headers);
  const j1 = await callFn("joinEvent", { eventId: evJoin }, member.headers);
  chk("joinEvent adds first attendee", j1.body?.result?.success, true);
  const j2 = await callFn("joinEvent", { eventId: evJoin }, member.headers);
  chk("joinEvent idempotent (already in)", j2.body?.result?.already, true);
  const j3 = await callFn("joinEvent", { eventId: evJoin }, outsider.headers);
  chk("joinEvent waitlists when full", j3.body?.result?.waitlisted, true);
  const j4 = await callFn("joinEvent", { eventId: evPaid }, member.headers);
  chk("joinEvent rejects paid event", j4.body?.error?.message, "paid_event");
  // Member leaves → onEventAttendeesChanged should promote the waitlisted outsider.
  await patchDoc(`events/${evJoin}?updateMask.fieldPaths=attendees`, { attendees: arr([]) }, member.headers);
  let promoted = false;
  for (let k = 0; k < 12 && !promoted; k++) {
    await sleep(1500);
    promoted = arrVals((await getFields(`events/${evJoin}`, host.headers))?.attendees).includes(outsider.uid);
  }
  chk("waitlist auto-promotes when a spot opens", promoted, true);
  await del(`events/${evJoin}`, host.headers);
  await del(`events/${evPaid}`, host.headers);

  // ---- PREMIUM AI GATE (getHostFeedbackInsights) ----
  section("Premium AI gate");
  const aiCall = await callFn("getHostFeedbackInsights", {}, host.headers);
  chk("non-premium host blocked from AI insights", aiCall.body?.error?.message, "premium_required");
  // Admin-only functions reject non-admins (assert the specific gate message)
  const delCall = await callFn("adminDeleteUser", { uid: member.uid }, host.headers);
  chk("non-admin blocked from adminDeleteUser", delCall.body?.error?.message, "Admin only.");
  const resetCall = await callFn("adminResetPassword", { email: "x@x.com" }, host.headers);
  chk("non-admin blocked from adminResetPassword", resetCall.body?.error?.message, "Admin only.");
  const aiListing = await callFn("generateEventListing", { idea: "yoga al amanecer" }, host.headers);
  chk("non-premium blocked from AI listing writer", aiListing.body?.error?.message, "premium_required");
  const aiReply = await callFn("generateReviewReply", { rating: 5, comment: "great" }, host.headers);
  chk("non-premium blocked from AI review reply", aiReply.body?.error?.message, "premium_required");

  // ---- CLEANUP ----
  await del(`notifications/event_msg_${ev}_${member.uid}`, member.headers);
  await del(`notifications/event_msg_${ev}_${outsider.uid}`, outsider.headers);
  for (const p of cleanup) await del(p, host.headers);
  await del(`events/${ev}`, host.headers);
  await del(`hostGroups/${gId}`, host.headers);
  for (const u of [host, member, outsider, stranger])
    await fetch(`${IDT}:delete?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: u.idToken }) });

  console.log(`\n========================================\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
