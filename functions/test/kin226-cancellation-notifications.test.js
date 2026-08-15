/**
 * KIN-226 — cancelar un evento avisaba a medias.
 *
 *   npm run test:payments
 *
 * Lo que se encontró en producción-dev el 15-ago, con dos cancelaciones reales:
 * refunds.js escribía burbujas in-app y NADA más — cero push en todo el archivo,
 * y ningún trigger genérico que convirtiera una burbuja en push. Un asistente al
 * que le cancelaban un evento PAGADO sólo se enteraba abriendo la app. Y el host
 * no recibía nada por cancelar su propio evento: sólo veía algo por accidente,
 * cuando además había pagado algo en ese evento y le tocaba reembolso como
 * pagador.
 *
 * QUÉ SE PUEDE PROBAR AQUÍ Y QUÉ NO
 * Los pushes salen desde el proceso de la función en el emulador, así que no hay
 * forma de interceptar sendBatchPushNotifications desde este proceso: el payload
 * del push NO es observable a través de esa frontera. Lo que sí se cubre es todo
 * el lado Firestore —el resumen del host, su copy y sus llaves— más que un token
 * inválido deje la cancelación completa.
 *
 * El try/catch de pushToUser NO queda cubierto, y está comprobado por mutación:
 * quitarlo no hace fallar ninguna prueba, porque sendBatchPushNotifications ya
 * atrapa lo suyo y devuelve []. Ese guard existe para el otro riesgo (que falle
 * la lectura del doc de usuario), inalcanzable desde aquí. Se deja dicho en vez
 * de fingir cobertura.
 *
 * El evento se siembra GRATIS y sin pagos a propósito: así el camino no toca
 * Stripe y estas pruebas siguen la postura del resto de la suite (nunca una
 * llamada real de cobro).
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const IDT = `http://127.0.0.1:${
  process.env.FIREBASE_AUTH_EMULATOR_HOST.split(":")[1]
}/identitytoolkit.googleapis.com/v1/accounts`;

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();

let uniq = 0;
/** @return {string} sufijo único (el emulador es compartido por la suite) */
const nextId = () => `k226_${Date.now()}_${uniq++}`;

/**
 * Usuario de emulador con token de ID real.
 * @param {string} uid uid deseado
 * @return {Promise<string>} su ID token
 */
async function tokenFor(uid) {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: true});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: true});
  }
  const r = await fetch(`${IDT}:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  }).then((x) => x.json());
  assert.ok(r.idToken, `no idToken for ${uid}: ${JSON.stringify(r)}`);
  return r.idToken;
}

/**
 * @param {string} name nombre del callable
 * @param {object} data payload
 * @param {string} token bearer
 * @return {Promise<{status:number, body:object}>} respuesta
 */
const call = (name, data, token) =>
  fetch(`${FN}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

/**
 * Evento GRATIS, sin pagos: el camino de cancelación no toca Stripe.
 * @param {string} hostUid dueño del evento
 * @param {string[]} [coHosts] uids de co-anfitriones (KIN-227)
 * @return {Promise<string>} eventId
 */
async function seedFreeEvent(hostUid, coHosts) {
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    title: "Evento de prueba KIN-226",
    creatorId: hostUid,
    price: 0,
    status: "active",
    date: new Date(Date.now() + 5 * 864e5).toISOString(),
    participantCount: 0,
    ...(coHosts ? {coHosts} : {}), // KIN-227
  });
  return eventId;
}

/** @param {string} eventId el evento @return {Promise<Array>} sus notificaciones */
const notifsFor = async (eventId) => {
  const snap = await db.collection("notifications")
    .where("metadata.eventId", "==", eventId).get();
  return snap.docs.map((d) => ({id: d.id, ...d.data()}));
};

// ---------------------------------------------------------------------------

test("KIN-226 el host recibe un resumen de su propia cancelación", async () => {
  // El hueco exacto del reporte: antes NO se escribía nada para el host.
  const host = `host_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host);

  const res = await call("hostCancelEvent", {eventId}, token);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));

  const notifs = await notifsFor(eventId);
  const summary = notifs.find((n) => n.type === "host_cancelled_event");
  assert.ok(summary, "no se escribió el resumen para el host");
  assert.strictEqual(summary.userId, host);
});

test("KIN-226 el resumen usa el texto de 'sin reembolsos' cuando no hubo pagos", async () => {
  // Un evento gratis no tiene nada que devolver; decir "1 reembolso" sería
  // mentir sobre dinero, que es la peor clase de copy equivocado.
  const host = `host_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host);

  await call("hostCancelEvent", {eventId}, token);
  const summary = (await notifsFor(eventId))
    .find((n) => n.type === "host_cancelled_event");

  assert.strictEqual(
    summary.bodyKey, "notifications.refund.hostCancelled.bodyNone");
  assert.strictEqual(summary.params.count, 0);
  assert.strictEqual(summary.metadata.refundsProcessed, 0);
  assert.strictEqual(summary.metadata.refundedCentavos, 0);
});

test("KIN-226 el resumen viaja con llaves, no con texto congelado (BUG 34)", async () => {
  // El host puede leerlo en otro idioma del que tenía el servidor al escribirlo.
  const host = `host_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host);

  await call("hostCancelEvent", {eventId}, token);
  const summary = (await notifsFor(eventId))
    .find((n) => n.type === "host_cancelled_event");

  assert.strictEqual(
    summary.titleKey, "notifications.refund.hostCancelled.title");
  assert.ok(summary.params.event, "faltan los params para interpolar");
  assert.strictEqual(summary.read, false);
  assert.strictEqual(summary.metadata.eventId, eventId);
});

test("KIN-226 un token de push inválido degrada a silencio", async () => {
  // Un token expirado o revocado es lo NORMAL en producción, no la excepción, y
  // pushToUser corre DESPUÉS de mover dinero: la cancelación tiene que quedar
  // completa igual.
  //
  // LÍMITE CONOCIDO, comprobado por mutación: esto NO ejercita el try/catch de
  // pushToUser. sendBatchPushNotifications ya atrapa lo suyo y devuelve [], así
  // que por este camino nunca llega una excepción — quitar ese try/catch no
  // hace fallar esta prueba. El guard sigue ahí como defensa del OTRO riesgo
  // real (que falle la lectura del doc de usuario), y ése no es alcanzable
  // desde el emulador.
  const host = `host_${nextId()}`;
  const token = await tokenFor(host);
  await db.collection("users").doc(host).set({
    pushToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    language: "es",
  });
  const eventId = await seedFreeEvent(host);

  const res = await call("hostCancelEvent", {eventId}, token);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));

  const ev = await db.collection("events").doc(eventId).get();
  assert.strictEqual(ev.data().status, "cancelled");
  assert.ok((await notifsFor(eventId))
    .some((n) => n.type === "host_cancelled_event"));
});

test("KIN-226 la cancelación deja el evento cancelado y con sello", async () => {
  // Guarda de no-regresión: el resumen se agregó DESPUÉS de estas escrituras,
  // así que una excepción ahí dentro se llevaría por delante la cancelación.
  const host = `host_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host);

  await call("hostCancelEvent", {eventId}, token);

  const ev = (await db.collection("events").doc(eventId).get()).data();
  assert.strictEqual(ev.status, "cancelled");
  assert.strictEqual(ev.cancelledBy, host);
  assert.ok(ev.cancelledAt, "falta cancelledAt");
});

test("KIN-226 alguien que no es el host no puede cancelar", async () => {
  // Sanity de autorización: el cambio no debe haber abierto una puerta.
  const host = `host_${nextId()}`;
  const intruder = `nope_${nextId()}`;
  await tokenFor(host);
  const badToken = await tokenFor(intruder);
  const eventId = await seedFreeEvent(host);

  const res = await call("hostCancelEvent", {eventId}, badToken);
  assert.notStrictEqual(res.status, 200);

  const ev = (await db.collection("events").doc(eventId).get()).data();
  assert.strictEqual(ev.status, "active", "el evento no debía cancelarse");
  assert.strictEqual((await notifsFor(eventId)).length, 0);
});

// ---------------------------------------------------------------------------
// KIN-227 — los co-anfitriones tampoco se enteraban
// ---------------------------------------------------------------------------

test("KIN-227 un co-anfitrión recibe su propia burbuja, distinta de la del actor", async () => {
  // "Distinta" se comprueba por el userId de cada documento, no asumiendo que
  // una sola escritura sirve para los dos: son dos destinatarios y dos docs.
  const host = `host_${nextId()}`;
  const cohost = `cohost_${nextId()}`;
  const token = await tokenFor(host);
  await tokenFor(cohost);
  const eventId = await seedFreeEvent(host, [cohost]);

  const res = await call("hostCancelEvent", {eventId}, token);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));

  const summaries = (await notifsFor(eventId))
    .filter((n) => n.type === "host_cancelled_event");
  assert.strictEqual(summaries.length, 2, "debe haber uno por persona");

  const forHost = summaries.find((n) => n.userId === host);
  const forCoHost = summaries.find((n) => n.userId === cohost);
  assert.ok(forHost, "falta el resumen del actor");
  assert.ok(forCoHost, "falta el resumen del co-anfitrión");
  assert.notStrictEqual(forHost.id, forCoHost.id, "deben ser docs distintos");
});

test("KIN-227 el co-anfitrión lo lee en tercera persona, el actor en primera", async () => {
  // El co-host no canceló nada. Decirle "Cancelaste tu evento" sería acusarlo
  // de algo que no hizo.
  const host = `host_${nextId()}`;
  const cohost = `cohost_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host, [cohost]);

  await call("hostCancelEvent", {eventId}, token);
  const summaries = (await notifsFor(eventId))
    .filter((n) => n.type === "host_cancelled_event");

  assert.strictEqual(
    summaries.find((n) => n.userId === host).titleKey,
    "notifications.refund.hostCancelled.title");
  assert.strictEqual(
    summaries.find((n) => n.userId === cohost).titleKey,
    "notifications.refund.hostCancelledCoHost.title");
});

test("KIN-227 ambos resumen la MISMA cancelación", async () => {
  // Los dos textos describen un solo hecho: si las cifras se separan, alguien
  // está leyendo un reembolso que no ocurrió.
  const host = `host_${nextId()}`;
  const cohost = `cohost_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host, [cohost]);

  await call("hostCancelEvent", {eventId}, token);
  const summaries = (await notifsFor(eventId))
    .filter((n) => n.type === "host_cancelled_event");
  const a = summaries.find((n) => n.userId === host);
  const b = summaries.find((n) => n.userId === cohost);

  assert.deepStrictEqual(a.params, b.params);
  assert.deepStrictEqual(a.metadata, b.metadata);
});

test("KIN-227 varios co-anfitriones reciben uno cada uno", async () => {
  const host = `host_${nextId()}`;
  const c1 = `cohost_${nextId()}`;
  const c2 = `cohost_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host, [c1, c2]);

  await call("hostCancelEvent", {eventId}, token);
  const uids = (await notifsFor(eventId))
    .filter((n) => n.type === "host_cancelled_event")
    .map((n) => n.userId).sort();

  assert.deepStrictEqual(uids, [host, c1, c2].sort());
});

test("KIN-227 el creador no recibe dos si además figura como co-host", async () => {
  // Dato viejo plausible: el creador dentro de su propio array de coHosts.
  const host = `host_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host, [host]);

  await call("hostCancelEvent", {eventId}, token);
  const summaries = (await notifsFor(eventId))
    .filter((n) => n.type === "host_cancelled_event");

  assert.strictEqual(summaries.length, 1, "no debe duplicarse");
  assert.strictEqual(
    summaries[0].titleKey, "notifications.refund.hostCancelled.title");
});

test("KIN-227 sin co-anfitriones no se escribe nada de más", async () => {
  const host = `host_${nextId()}`;
  const token = await tokenFor(host);
  const eventId = await seedFreeEvent(host); // sin campo coHosts

  const res = await call("hostCancelEvent", {eventId}, token);
  assert.strictEqual(res.status, 200);

  const summaries = (await notifsFor(eventId))
    .filter((n) => n.type === "host_cancelled_event");
  assert.strictEqual(summaries.length, 1, "sólo el del actor");
  assert.strictEqual(summaries[0].userId, host);
});
