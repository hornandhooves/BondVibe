/**
 * KIN-242 — un co-anfitrión no aparecía en ninguna de las cuatro listas de
 * gestión porque todas filtraban sólo `creatorId == uid`. Este helper une esa
 * consulta con `coHosts array-contains uid`, dedupe por id y marca el rol.
 */
import { getDocs } from "firebase/firestore";
import { getManagedEvents } from "../managedEventsService";

jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn((_db, name) => ({ __name: name })),
  query: jest.fn((ref, ...clauses) => ({ __ref: ref, __clauses: clauses })),
  where: jest.fn((field, op, value) => ({ field, op, value })),
  getDocs: jest.fn(),
}));

const snap = (docs) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });

/** Responde a getDocs según la cláusula `where` de la query, sin importar el orden. */
const mockQueries = ({ created = [], coHosted = [] } = {}) => {
  getDocs.mockImplementation((q) => {
    const clause = q.__clauses[0];
    if (clause.field === "creatorId") return Promise.resolve(snap(created));
    if (clause.field === "coHosts") return Promise.resolve(snap(coHosted));
    throw new Error(`unexpected query clause: ${clause.field}`);
  });
};

describe("getManagedEvents", () => {
  beforeEach(() => jest.clearAllMocks());

  it("devuelve [] sin consultar nada si no hay uid", async () => {
    const events = await getManagedEvents(undefined);
    expect(events).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("un usuario que sólo creó eventos: isCreator true, isCoHost false", async () => {
    mockQueries({ created: [{ id: "e1", data: { title: "Creado" } }] });
    const events = await getManagedEvents("alice");
    expect(events).toEqual([
      { id: "e1", title: "Creado", isCreator: true, isCoHost: false },
    ]);
  });

  it("un usuario que sólo co-anfitriona: isCreator false, isCoHost true", async () => {
    mockQueries({ coHosted: [{ id: "e2", data: { title: "Co-anfitrionado" } }] });
    const events = await getManagedEvents("bob");
    expect(events).toEqual([
      { id: "e2", title: "Co-anfitrionado", isCreator: false, isCoHost: true },
    ]);
  });

  it("un usuario que es ambas cosas en el mismo evento aparece una sola vez", async () => {
    // El creador quedó además listado en su propio coHosts (caso de borde real).
    mockQueries({
      created: [{ id: "e3", data: { title: "Mixto" } }],
      coHosted: [{ id: "e3", data: { title: "Mixto" } }],
    });
    const events = await getManagedEvents("carol");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: "e3", isCreator: true, isCoHost: true });
  });

  it("une creados + co-anfitrionados distintos sin duplicar ni perder ninguno", async () => {
    mockQueries({
      created: [{ id: "e1", data: { title: "A" } }],
      coHosted: [{ id: "e2", data: { title: "B" } }],
    });
    const events = await getManagedEvents("dave");
    expect(events.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("si la consulta de coHosts falla, igual devuelve los creados (no revienta)", async () => {
    getDocs.mockImplementation((q) => {
      const clause = q.__clauses[0];
      if (clause.field === "creatorId") return Promise.resolve(snap([{ id: "e1", data: { title: "A" } }]));
      return Promise.reject(new Error("permission-denied"));
    });
    const events = await getManagedEvents("eve");
    expect(events).toEqual([
      { id: "e1", title: "A", isCreator: true, isCoHost: false },
    ]);
  });

  it("si ambas consultas fallan, devuelve [] sin lanzar", async () => {
    getDocs.mockRejectedValue(new Error("permission-denied"));
    await expect(getManagedEvents("mallory")).resolves.toEqual([]);
  });
});
