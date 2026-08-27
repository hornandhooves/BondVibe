/**
 * KIN-240 — un co-anfitrión participa del evento sin estar en el roster.
 *
 *   npm run test:rules
 *
 * `isEventParticipant()` sólo reconocía al creador y a quien tuviera doc de
 * roster, así que un co-anfitrión que nunca se inscribió quedaba fuera del chat
 * de un evento que él mismo gestiona.
 *
 * Este archivo cubre las OCHO colecciones que la función gatea, no sólo el
 * chat, y esa amplitud es deliberada: la lección del ticket es justamente que
 * un helper compartido mueve permisos en sitios que nadie estaba mirando. Si
 * alguien vuelve a tocarlo, aquí se ve de golpe todo lo que cambia — incluida
 * `private`, que guarda la DIRECCIÓN EXACTA del evento y es el permiso más
 * sensible del conjunto.
 *
 * Y en la otra dirección: el gate sigue siendo un gate. Un desconocido no entra
 * a ninguna de las ocho.
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {doc, getDoc, setDoc} = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-cohost-participant",
    firestore: {rules: read("firestore.rules"), host: "127.0.0.1", port: 8080},
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const EVENT = "evt1";

/** cohost1 es co-anfitrión y NO tiene doc de roster: el caso del ticket. */
const seedEvent = () =>
  seed(async (db) => {
    await setDoc(doc(db, "events", EVENT), {
      creatorId: "host1",
      coHosts: ["cohost1"],
      title: "Evento con co-anfitrión",
      participantCount: 1,
    });
    await setDoc(doc(db, "events", EVENT, "roster", "alice"),
      {uid: "alice", status: "active"});
    await setDoc(doc(db, "events", EVENT, "private", "location"),
      {address: "Calle Secreta 123"});
    await setDoc(doc(db, "events", EVENT, "messages", "m1"),
      {senderId: "alice", text: "hola"});
    await setDoc(doc(db, "events", EVENT, "checkins", "alice"), {at: "x"});
    await setDoc(doc(db, "events", EVENT, "polls", "p1"),
      {createdBy: "host1", question: "¿?"});
    await setDoc(doc(db, "events", EVENT, "carpools", "c1"), {driverId: "alice"});
  });

describe("KIN-240 — el co-anfitrión SIN roster cuenta como participante", () => {
  test("lee los mensajes del chat", async () => {
    await seedEvent();
    await assertSucceeds(
      getDoc(doc(asUser("cohost1"), "events", EVENT, "messages", "m1")));
  });

  test("escribe en el chat", async () => {
    await seedEvent();
    await assertSucceeds(
      setDoc(doc(asUser("cohost1"), "events", EVENT, "messages", "m2"),
        {senderId: "cohost1", text: "soy co-anfitrión"}));
  });

  test("NO puede escribir un mensaje a nombre de otro", async () => {
    // El gate de suplantación es independiente del de participación y sigue
    // en pie: ampliar uno no puede aflojar el otro.
    await seedEvent();
    await assertFails(
      setDoc(doc(asUser("cohost1"), "events", EVENT, "messages", "m3"),
        {senderId: "alice", text: "no soy alice"}));
  });

  test("lee la dirección exacta del evento (private)", async () => {
    // El permiso más sensible que mueve este cambio, y el que faltaba en el
    // planteamiento original del ticket.
    await seedEvent();
    await assertSucceeds(
      getDoc(doc(asUser("cohost1"), "events", EVENT, "private", "location")));
  });

  test("lee los check-ins", async () => {
    await seedEvent();
    await assertSucceeds(
      getDoc(doc(asUser("cohost1"), "events", EVENT, "checkins", "alice")));
  });

  test("lee y vota una encuesta", async () => {
    await seedEvent();
    await assertSucceeds(
      getDoc(doc(asUser("cohost1"), "events", EVENT, "polls", "p1")));
    await assertSucceeds(
      setDoc(doc(asUser("cohost1"), "events", EVENT, "polls", "p1", "votes", "cohost1"),
        {choice: 0}));
  });

  test("lee los car pools", async () => {
    await seedEvent();
    await assertSucceeds(
      getDoc(doc(asUser("cohost1"), "events", EVENT, "carpools", "c1")));
  });

  test("escribe en typing", async () => {
    await seedEvent();
    await assertSucceeds(
      setDoc(doc(asUser("cohost1"), "events", EVENT, "typing", "cohost1"), {at: 1}));
  });
});

describe("KIN-240 — el gate sigue siendo un gate", () => {
  test("un desconocido NO lee los mensajes", async () => {
    await seedEvent();
    await assertFails(
      getDoc(doc(asUser("mallory"), "events", EVENT, "messages", "m1")));
  });

  test("un desconocido NO lee la dirección exacta", async () => {
    await seedEvent();
    await assertFails(
      getDoc(doc(asUser("mallory"), "events", EVENT, "private", "location")));
  });

  test("un desconocido NO lee los check-ins ni vota", async () => {
    await seedEvent();
    await assertFails(
      getDoc(doc(asUser("mallory"), "events", EVENT, "checkins", "alice")));
    await assertFails(
      setDoc(doc(asUser("mallory"), "events", EVENT, "polls", "p1", "votes", "mallory"),
        {choice: 0}));
  });

  test("estar en coHosts de OTRO evento no sirve", async () => {
    // El reconocimiento es por evento, no una credencial global.
    await seedEvent();
    await seed(async (db) => {
      await setDoc(doc(db, "events", "evt2"), {creatorId: "host2", coHosts: ["mallory"]});
    });
    await assertFails(
      getDoc(doc(asUser("mallory"), "events", EVENT, "messages", "m1")));
  });
});

describe("KIN-240 — sin regresión para quienes ya entraban", () => {
  test("el creador sigue entrando", async () => {
    await seedEvent();
    await assertSucceeds(
      getDoc(doc(asUser("host1"), "events", EVENT, "messages", "m1")));
  });

  test("un asistente del roster sigue entrando", async () => {
    await seedEvent();
    await assertSucceeds(
      getDoc(doc(asUser("alice"), "events", EVENT, "messages", "m1")));
  });

  test("un evento SIN coHosts se comporta igual que antes", async () => {
    // coHosts == null es el caso de la inmensa mayoría de documentos.
    //
    // LÍMITE CONOCIDO, comprobado por mutación: esto NO demuestra que el guard
    // `coHosts != null` de la regla haga falta — quitarlo no rompe ninguna
    // prueba. El `||` cortocircuita, así que el creador pasa por la primera
    // cláusula y nunca llega al `in`, y para un desconocido un error de
    // evaluación deniega igual que un `false` limpio. El guard se mantiene
    // porque es el mismo que ya usa isEventHost y porque un error-denegación no
    // es lo mismo que una condición falsa: si algún día se reordenan las
    // cláusulas, sin él un usuario legítimo quedaría fuera.
    await seed(async (db) => {
      await setDoc(doc(db, "events", "evt3"), {creatorId: "host1", title: "Sin co"});
      await setDoc(doc(db, "events", "evt3", "messages", "m1"),
        {senderId: "host1", text: "hola"});
    });
    await assertSucceeds(
      getDoc(doc(asUser("host1"), "events", "evt3", "messages", "m1")));
    await assertFails(
      getDoc(doc(asUser("mallory"), "events", "evt3", "messages", "m1")));
  });
});
