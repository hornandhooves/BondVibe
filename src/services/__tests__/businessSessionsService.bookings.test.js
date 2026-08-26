/**
 * KIN-239 — un permission-denied en bookings tumbaba el guardado del evento.
 *
 * El modelo de permisos es correcto y no se toca: un co-anfitrión que NO es
 * staff del negocio dueño del evento no puede leer sus bookings, y las reglas
 * hacen bien en negárselo. Lo que estaba mal era el manejo del error.
 *
 * La cadena que lo convertía en un bug de guardado:
 *
 *   saveEvent → checkInstructorAvailability → getDayItems
 *             → Promise.all([... listBookings(bizId) ...])
 *
 * Un rechazo en cualquier miembro de ese Promise.all rechaza el conjunto, y en
 * EditEventScreen ese await vive FUERA del try de saveEvent. El síntoma no era
 * un botón girando —setSaving(true) viene después— sino algo más difícil de
 * diagnosticar: el guardado no ocurría, sin alerta, sin error y sin nada en
 * pantalla que lo explicara.
 *
 * Lo que se prueba es que la promesa RESUELVE con el vacío del tipo esperado,
 * no que se registre un console.error: el log es diagnóstico, el valor de
 * retorno es el contrato del que dependen los llamantes.
 */
import { getDocs, getDoc } from "firebase/firestore";
import { listBookings, getBooking } from "../businessSessionsService";

jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "me" } } }));
jest.mock("../businessService", () => ({ getMyBizId: () => "biz1" }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(() => "TS"),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  increment: jest.fn(),
  writeBatch: jest.fn(),
  arrayUnion: jest.fn(),
  arrayRemove: jest.fn(),
  getCountFromServer: jest.fn(),
}));

/** El error exacto que devuelve Firestore cuando las reglas niegan la lectura. */
const permissionDenied = () => {
  const e = new Error("Missing or insufficient permissions.");
  e.code = "permission-denied";
  return e;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe("listBookings — KIN-239", () => {
  it("devuelve [] ante permission-denied en vez de propagar", async () => {
    getDocs.mockRejectedValue(permissionDenied());
    await expect(listBookings("otroBiz")).resolves.toEqual([]);
  });

  it("no deja una promesa rechazada suelta", async () => {
    // Es lo que rompía saveEvent: el await vive fuera de su try, así que un
    // rechazo aquí abortaba el guardado sin dejar rastro en pantalla.
    getDocs.mockRejectedValue(permissionDenied());
    let threw = false;
    try {
      await listBookings("otroBiz");
    } catch (_e) {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("sobrevive a un Promise.all como el de getDayItems", async () => {
    // La forma real del llamante: si listBookings rechaza, se lleva por delante
    // a los otros tres aunque hayan resuelto bien.
    getDocs.mockRejectedValue(permissionDenied());
    const [ok, bookings] = await Promise.all([
      Promise.resolve(["evento"]),
      listBookings("otroBiz"),
    ]);
    expect(ok).toEqual(["evento"]);
    expect(bookings).toEqual([]);
  });

  it("registra el fallo para que no sea invisible", async () => {
    // El valor de retorno es el contrato; el log es lo que evita que un
    // permission-denied real se vuelva un misterio silencioso.
    getDocs.mockRejectedValue(permissionDenied());
    await listBookings("otroBiz");
    expect(console.error).toHaveBeenCalledWith(
      "listBookings failed:", "Missing or insufficient permissions.");
  });

  it("sigue devolviendo y ordenando los bookings cuando SÍ hay permiso", async () => {
    // Guarda de no-regresión: el try/catch no debe alterar el camino feliz.
    getDocs.mockResolvedValue({
      docs: [
        { id: "b2", data: () => ({ start: "2026-09-02T10:00:00.000Z" }) },
        { id: "b1", data: () => ({ start: "2026-09-01T10:00:00.000Z" }) },
      ],
    });
    expect((await listBookings("biz1")).map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("sin bizId devuelve [] sin tocar Firestore", async () => {
    expect(await listBookings(null)).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });
});

describe("getBooking — KIN-239", () => {
  it("devuelve null ante permission-denied en vez de propagar", async () => {
    // Su llamante hace `setB(await getBooking(id)); setLoading(false);` — una
    // excepción dejaba la pantalla girando para siempre (KIN-92/94/95).
    getDoc.mockRejectedValue(permissionDenied());
    await expect(getBooking("bk1", "otroBiz")).resolves.toBeNull();
  });

  it("null ya era su respuesta para 'no existe': no inventa un caso nuevo", async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    expect(await getBooking("bk1", "biz1")).toBeNull();
  });

  it("sigue devolviendo el booking cuando SÍ hay permiso", async () => {
    getDoc.mockResolvedValue({
      exists: () => true, id: "bk1", data: () => ({ start: "x" }),
    });
    expect(await getBooking("bk1", "biz1")).toEqual({ id: "bk1", start: "x" });
  });
});
