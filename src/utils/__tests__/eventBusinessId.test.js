/**
 * KIN-236 — de qué negocio es un evento.
 *
 * El bug: `InstructorPicker` listaba el personal del negocio ACTIVO de quien
 * miraba la pantalla. Host y co-anfitrión abriendo el MISMO evento veían listas
 * distintas, y un co-anfitrión con su propio negocio podía asignar como
 * instructor a alguien que no tiene nada que ver con el evento.
 *
 * La fórmula no se reescribió: se delega en `getHostIdForPayout`, que ya existe
 * y ya es idéntica a la del servidor (functions/utils/eventHelpers.js). El
 * último test de este archivo fija esa equivalencia — si alguien toca una y no
 * la otra, el cliente y el servidor discreparían sobre a qué negocio pertenece
 * un evento, y el síntoma sería un cobro al dueño equivocado.
 */
import { getEventBusinessId, getHostIdForPayout } from "../eventHelpers";

describe("getEventBusinessId", () => {
  it("prefiere businessOwnerUid cuando el evento nació dentro de un negocio", () => {
    // Staff creando dentro del negocio de otro: el dueño es ese otro.
    expect(getEventBusinessId({ businessOwnerUid: "owner1", creatorId: "staff1" }))
      .toBe("owner1");
  });

  it("cae al creador cuando no hay negocio (evento personal)", () => {
    expect(getEventBusinessId({ businessOwnerUid: null, creatorId: "host1" }))
      .toBe("host1");
    expect(getEventBusinessId({ creatorId: "host1" })).toBe("host1");
  });

  it("respeta la cadena histórica de autoría del creador", () => {
    // creatorId → createdBy → hostId: documentos viejos usan las tres.
    expect(getEventBusinessId({ createdBy: "old1" })).toBe("old1");
    expect(getEventBusinessId({ hostId: "older1" })).toBe("older1");
  });

  it("no revienta con un evento vacío o ausente", () => {
    expect(getEventBusinessId(null)).toBeUndefined();
    expect(getEventBusinessId({})).toBeUndefined();
  });

  it("es EXACTAMENTE el mismo valor que la fórmula de pagos", () => {
    // No es redundante: es la guarda contra que alguien "arregle" una de las
    // dos por separado. Si divergen, el cliente lista el personal de un negocio
    // y el servidor le cobra a otro.
    const casos = [
      { businessOwnerUid: "owner1", creatorId: "staff1" },
      { creatorId: "host1" },
      { createdBy: "old1" },
      { hostId: "older1" },
      { businessOwnerUid: null, creatorId: "host1" },
      {},
      null,
    ];
    casos.forEach((c) => {
      expect(getEventBusinessId(c)).toBe(getHostIdForPayout(c));
    });
  });
});
