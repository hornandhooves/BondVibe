/**
 * KIN-218 — tell the people who signed up when the host changes the plan.
 *
 * Until now nothing did. onEventWritten is the only trigger on the event doc
 * and it only recomputes escrow, location gating and searchKeywords;
 * onEventRosterChanged fires on joins and leaves, not on edits. So a host could
 * move an event to a different day, or a different venue, and the attendees
 * found out when they showed up at the old one.
 *
 * Six fields are watched — the ones EditEventScreen actually lets a host
 * change and that affect whether someone can still make it: title, date, time,
 * durationMinutes, location, venueAddress. `description` is deliberately out of
 * this round, and `city` is out because the edit UI has no control for it, so
 * watching it would be dead code.
 *
 * WHY THE BODY DOESN'T NAME THE FIELD THAT CHANGED
 * The in-app notification is re-rendered on the client from titleKey/bodyKey in
 * the READER's language (BUG 34 / KIN-93). Interpolating a list of field labels
 * would mean picking their language on the server and freezing it into the doc
 * — the exact bug that catalog split exists to prevent. Naming them properly
 * needs the client to render from the raw field names, which is a client change
 * and out of scope here. The names ARE carried in `metadata.changedFields` so
 * that UI can be built later without re-deriving anything.
 */

const {FieldValue} = require("firebase-admin/firestore");
const {sendBatchPushNotifications} = require("./pushService");
const {tPush, baseLang} = require("../i18n");
const roster = require("../utils/roster");
const {getEventCreatorId} = require("../utils/eventHelpers");

/** The fields whose change is worth interrupting an attendee for. */
const WATCHED_FIELDS = Object.freeze([
  "title",
  "date",
  "time",
  "durationMinutes",
  "location",
  "venueAddress",
]);

const TITLE_KEY = "notifications.event.detailsChanged.title";
const BODY_KEY = "notifications.event.detailsChanged.body";

/** KIN-235 — alguien te sumó como co-anfitrión. */
const COHOST_TITLE_KEY = "notifications.event.addedAsCoHost.title";
const COHOST_BODY_KEY = "notifications.event.addedAsCoHost.body";

/**
 * Missing, null and empty all mean "not set" — an older doc simply lacks the key.
 * @param {*} v the stored value
 * @return {boolean} true when the field carries no value
 */
const isAbsent = (v) => v === null || v === undefined || v === "";

/**
 * Compare loosely on purpose. durationMinutes has been written as both a number
 * and a numeric string over the life of this collection; a type migration is
 * not a schedule change and must not push anyone.
 * @param {*} a before
 * @param {*} b after
 * @return {boolean} true when the two mean the same thing
 */
const sameValue = (a, b) =>
  (isAbsent(a) && isAbsent(b)) || (!isAbsent(a) && !isAbsent(b) && String(a) === String(b));

/**
 * Which of the watched fields actually changed.
 * @param {object} beforeData the event doc before the write
 * @param {object} afterData the event doc after the write
 * @return {string[]} changed field names, in WATCHED_FIELDS order (empty = nothing to say)
 */
function changedEventFields(beforeData, afterData) {
  if (!beforeData || !afterData) return []; // a creation has nobody to notify yet
  return WATCHED_FIELDS.filter((f) => !sameValue(beforeData[f], afterData[f]));
}

/**
 * Notify everyone attached to the event that it was edited — asistentes,
 * creador y co-anfitriones — menos quien hizo la edición (KIN-234).
 *
 * One notification per save that touches at least one watched field — no
 * debounce. A host correcting a typo twice sends twice; that's the honest
 * reading of "the plan changed", and grouping would delay the case that
 * matters most (a date move announced minutes before the old start).
 *
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} eventId the event
 * @param {object} beforeData the event doc before the write
 * @param {object} afterData the event doc after the write
 * @return {Promise<string[]>} the uids notified (empty when nothing was sent).
 *   El actor sale de `afterData.lastEditedBy`, que escribe EditEventScreen; un
 *   trigger de Firestore no tiene request.auth.uid.
 */
async function notifyRosterOfEventEdit(db, eventId, beforeData, afterData) {
  const changedFields = changedEventFields(beforeData, afterData);
  if (changedFields.length === 0) return [];
  // A cancelled event has its own notification; don't also announce the edit.
  if (afterData.status === "cancelled") return [];

  // KIN-234: quién editó DE VERDAD. Antes se asumía que era el creador y se le
  // excluía a él, lo que dejaba dos huecos: si editaba un co-anfitrión, el
  // creador no se enteraba de un cambio en su propio evento, y ese co-anfitrión
  // sí recibía aviso de su propia acción cuando además estaba en el roster.
  // `lastEditedBy` lo escribe EditEventScreen; los documentos anteriores a este
  // ticket no lo traen, y para ésos el creador sigue siendo la mejor suposición.
  const creatorId = getEventCreatorId(afterData);
  const actorUid = afterData.lastEditedBy || creatorId;

  // Todo el que tiene algo que ver con el evento, menos quien lo editó.
  const coHosts = Array.isArray(afterData.coHosts) ? afterData.coHosts : [];
  const audience = new Set([
    ...(await roster.activeUids(db, eventId)),
    creatorId,
    ...coHosts,
  ]);
  audience.delete(actorUid); // nadie se autonotifica
  const uids = [...audience].filter(Boolean);
  if (uids.length === 0) return [];

  const params = {event: afterData.title || "an event"};
  const metadata = {eventId, eventTitle: afterData.title || "", changedFields};

  // The in-app bubble first: it's the record, and it must land whether or not
  // the recipient has push enabled.
  // KIN-224: the ref is generated BEFORE the batch.set so each recipient's push
  // can carry its own doc id. One id per uid — sharing one would let a tap mark
  // somebody else's bubble read.
  const notifIdByUid = {};
  const batch = db.batch();
  for (const uid of uids) {
    const notifRef = db.collection("notifications").doc();
    notifIdByUid[uid] = notifRef.id;
    batch.set(notifRef, {
      userId: uid,
      type: "event_details_changed",
      // English copies are the write-time fallback only (BUG 34); the client
      // re-renders from the keys in the reader's own language.
      title: tPush(TITLE_KEY, "en", params),
      message: tPush(BODY_KEY, "en", params),
      titleKey: TITLE_KEY,
      bodyKey: BODY_KEY,
      params,
      icon: "edit",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata,
    });
  }
  await batch.commit();

  // Then push, localized per recipient — a mixed-language roster gets each
  // person their own language, same as every other fan-out here.
  const entries = [];
  for (const uid of uids) {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) continue;
    const u = snap.data();
    if (!u.pushToken) continue;
    entries.push({
      pushToken: u.pushToken,
      uid,
      lang: baseLang(u.language),
      titleKey: TITLE_KEY,
      bodyKey: BODY_KEY,
      params,
      data: {
        type: "event_details_changed",
        eventId,
        notificationId: notifIdByUid[uid],
      },
    });
  }
  if (entries.length > 0) await sendBatchPushNotifications(entries);

  console.log(
    `✏️ Event ${eventId} edited (${changedFields.join(", ")}) — ` +
    `notified ${uids.length}, pushed ${entries.length}`,
  );
  return uids;
}

module.exports = {
  notifyNewCoHosts,
  WATCHED_FIELDS,
  changedEventFields,
  notifyRosterOfEventEdit,
  TITLE_KEY,
  BODY_KEY,
};

/**
 * KIN-235 — avisar a quien acaban de sumar como co-anfitrión.
 *
 * Se resuelve en el trigger y no en el botón que llama a arrayUnion a
 * propósito: `coHosts` puede escribirse desde cualquier camino que exista hoy o
 * mañana —una pantalla de administración, un script, una importación— y un
 * aviso colgado de un botón concreto sólo cubre ese botón.
 *
 * Sólo notifica a los uids NUEVOS. Quitar a alguien (arrayRemove) no dispara
 * nada, y la creación de un evento con co-anfitriones ya poblados tampoco: sin
 * `beforeData` no hay nada con qué comparar, igual que trata la creación el
 * resto de este archivo.
 *
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} eventId el evento
 * @param {object} beforeData doc antes de la escritura (null en creación)
 * @param {object} afterData doc después
 * @return {Promise<string[]>} los uids avisados
 */
async function notifyNewCoHosts(db, eventId, beforeData, afterData) {
  if (!beforeData) return []; // creación: nadie fue "agregado"
  if (afterData.status === "cancelled") return [];

  const before = new Set(Array.isArray(beforeData.coHosts) ? beforeData.coHosts : []);
  const after = Array.isArray(afterData.coHosts) ? afterData.coHosts : [];
  const added = [...new Set(after)].filter((uid) => uid && !before.has(uid));
  if (added.length === 0) return [];

  const params = {event: afterData.title || "an event"};
  const metadata = {eventId, eventTitle: afterData.title || ""};

  const notifIdByUid = {};
  const batch = db.batch();
  for (const uid of added) {
    const notifRef = db.collection("notifications").doc();
    notifIdByUid[uid] = notifRef.id; // KIN-224: un id por destinatario
    batch.set(notifRef, {
      userId: uid,
      type: "added_as_cohost",
      title: tPush(COHOST_TITLE_KEY, "en", params),
      message: tPush(COHOST_BODY_KEY, "en", params),
      titleKey: COHOST_TITLE_KEY,
      bodyKey: COHOST_BODY_KEY,
      params,
      icon: "users",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata,
    });
  }
  await batch.commit();

  const entries = [];
  for (const uid of added) {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) continue;
    const u = snap.data();
    if (!u.pushToken) continue;
    entries.push({
      pushToken: u.pushToken,
      uid,
      lang: baseLang(u.language),
      titleKey: COHOST_TITLE_KEY,
      bodyKey: COHOST_BODY_KEY,
      params,
      data: {
        type: "added_as_cohost",
        eventId,
        notificationId: notifIdByUid[uid],
      },
    });
  }
  if (entries.length > 0) await sendBatchPushNotifications(entries);

  console.log(`🤝 Event ${eventId}: ${added.length} co-host(s) nuevos avisados`);
  return added;
}
