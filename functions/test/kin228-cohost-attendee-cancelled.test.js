/**
 * KIN-228 — un asistente se da de baja y los co-anfitriones tampoco se
 * enteraban.
 *
 *   npm run test:payments
 *
 * Sólo se avisaba al creador. Un co-anfitrión también gestiona el evento y
 * también necesita saber que se liberó un lugar.
 *
 * POR QUÉ SE PRUEBA LA FUNCIÓN Y NO EL CALLABLE
 * Este aviso vive dentro de cancelEventAttendance, y ese camino no es
 * alcanzable desde el emulador: para un evento gratis la función retorna antes
 * de llegar aquí, y para uno pagado haría falta un reembolso REAL de Stripe.
 * Por eso el loop se extrajo a notifyCoHostsOfAttendeeCancellation — lo que
 * tiene reglas propias (no duplicar al creador, un id por destinatario, aislar
 * fallos) se prueba sin cobrarle a nadie.
 *
 * El push en sí no es observable desde este proceso (sale por pushService, que
 * se traga sus errores); lo que sí se comprueba es todo el lado Firestore, que
 * es donde vive el id que el push transporta.
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();

const {
  notifyCoHostsOfAttendeeCancellation,
} = require("../stripe/refunds");

let uniq = 0;
/** @return {string} sufijo único (el emulador es compartido) */
const nextId = () => `k228_${Date.now()}_${uniq++}`;

/**
 * Los argumentos que arma el bloque del creador.
 * @param {object} eventData el evento
 * @param {string} eventId su id
 * @return {object} el payload de la función
 */
const args = (eventData, eventId) => ({
  eventId,
  eventData,
  params: {name: "Ana", event: eventData.title || "Evento", pct: 100},
  bodyKey: "notifications.refund.attendeeCancelled.bodyRefund",
  pct: 100,
});

/** @param {string} eventId el evento @return {Promise<Array>} sus burbujas */
const notifsFor = async (eventId) => {
  const snap = await db.collection("notifications")
    .where("type", "==", "attendee_cancelled").get();
  return snap.docs.map((d) => ({id: d.id, ...d.data()}))
    .filter((n) => n.metadata && n.metadata.eventId === eventId);
};

test("KIN-228 un co-anfitrión recibe su aviso", async () => {
  const eventId = `evt_${nextId()}`;
  const ev = {title: "Clase", creatorId: "host1", coHosts: ["co1"]};

  const avisados = await notifyCoHostsOfAttendeeCancellation(args(ev, eventId));
  assert.deepStrictEqual(avisados, ["co1"]);

  const notifs = await notifsFor(eventId);
  assert.strictEqual(notifs.length, 1);
  assert.strictEqual(notifs[0].userId, "co1");
  assert.strictEqual(notifs[0].titleKey,
    "notifications.refund.attendeeCancelled.title");
});

test("KIN-228 el creador que además figura como co-host no se duplica", async () => {
  // Dato viejo plausible: el creador dentro de su propio array de coHosts. Ya
  // recibió el suyo en el bloque anterior.
  const eventId = `evt_${nextId()}`;
  const ev = {title: "Clase", creatorId: "host1", coHosts: ["host1", "co1"]};

  const avisados = await notifyCoHostsOfAttendeeCancellation(args(ev, eventId));
  assert.deepStrictEqual(avisados, ["co1"]);
  assert.deepStrictEqual((await notifsFor(eventId)).map((n) => n.userId), ["co1"]);
});

test("KIN-228 varios co-anfitriones reciben uno cada uno, con id propio", async () => {
  // El id compartido es el bug que cerró KIN-224: un tap marcaría leída la
  // burbuja de otra persona.
  const eventId = `evt_${nextId()}`;
  const ev = {title: "Clase", creatorId: "host1", coHosts: ["co1", "co2", "co3"]};

  const avisados = await notifyCoHostsOfAttendeeCancellation(args(ev, eventId));
  assert.deepStrictEqual(avisados.sort(), ["co1", "co2", "co3"]);

  const notifs = await notifsFor(eventId);
  assert.strictEqual(notifs.length, 3);
  assert.strictEqual(new Set(notifs.map((n) => n.id)).size, 3, "ids distintos");
  assert.deepStrictEqual(notifs.map((n) => n.userId).sort(), ["co1", "co2", "co3"]);
});

test("KIN-228 que uno falle no deja sin avisar a los demás", async () => {
  // Provocar un fallo REAL en una sola iteración cuesta encontrar algo que
  // Firestore rechace por destinatario: un uid con barras no sirve (el uid es
  // un valor de campo, no una ruta, y .add() genera su propio id), y una
  // cadena de 2000 chars tampoco. Lo que sí rechaza es superar el máximo de un
  // valor de propiedad — y como el uid es el único campo que varía por
  // destinatario, revienta ESA escritura y ninguna otra. El try/catch por
  // iteración es lo que impide que se lleve por delante a los demás.
  const eventId = `evt_${nextId()}`;
  const ev = {
    title: "Clase",
    creatorId: "host1",
    coHosts: ["co1", "z".repeat(1100000), "co2"],
  };

  const avisados = await notifyCoHostsOfAttendeeCancellation(args(ev, eventId));
  assert.deepStrictEqual(avisados.sort(), ["co1", "co2"]);
  assert.deepStrictEqual(
    (await notifsFor(eventId)).map((n) => n.userId).sort(), ["co1", "co2"]);
});

test("KIN-228 sin co-anfitriones no escribe nada", async () => {
  const eventId = `evt_${nextId()}`;
  const avisados = await notifyCoHostsOfAttendeeCancellation(
    args({title: "Clase", creatorId: "host1"}, eventId));
  assert.deepStrictEqual(avisados, []);
  assert.strictEqual((await notifsFor(eventId)).length, 0);
});

test("KIN-228 un uid repetido en el array avisa una sola vez", async () => {
  const eventId = `evt_${nextId()}`;
  const ev = {title: "Clase", creatorId: "host1", coHosts: ["co1", "co1"]};

  const avisados = await notifyCoHostsOfAttendeeCancellation(args(ev, eventId));
  assert.deepStrictEqual(avisados, ["co1"]);
  assert.strictEqual((await notifsFor(eventId)).length, 1);
});

test("KIN-228 la burbuja lleva la copy del creador, no una propia", async () => {
  // Decisión de alcance: misma copy que ya recibe el creador. Si alguien
  // introdujera llaves nuevas aquí, habría que agregarlas a los 4 catálogos y
  // este test lo haría notar.
  const eventId = `evt_${nextId()}`;
  const ev = {title: "Clase", creatorId: "host1", coHosts: ["co1"]};

  await notifyCoHostsOfAttendeeCancellation(args(ev, eventId));
  const [n] = await notifsFor(eventId);
  assert.strictEqual(n.bodyKey, "notifications.refund.attendeeCancelled.bodyRefund");
  assert.strictEqual(n.params.name, "Ana");
  assert.strictEqual(n.metadata.refundPercentage, 100);
  assert.strictEqual(n.read, false);
});
