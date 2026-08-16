/**
 * KIN-236 — a qué negocio le pide el personal el picker.
 *
 * `bizId` se agregó como prop OPCIONAL, y esa opcionalidad es el contrato que
 * este archivo protege. Create debe seguir usando el negocio ACTIVO de quien
 * está creando —ahí el host está decidiendo en qué negocio nace el evento— y
 * Edit debe usar el del evento, que ya es un hecho.
 *
 * Si alguien hiciera `bizId` obligatorio, o pasara `undefined` a `listStaff`
 * en vez de omitir el argumento, Create se rompería en silencio: `listStaff`
 * resuelve su default por parámetro, y un `undefined` explícito lo activa
 * igual — pero un `null` NO, y ésa es la diferencia que aquí se fija.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { listStaff } from "../../../services/businessStaffService";
import InstructorPicker from "../InstructorPicker";

jest.mock("../../../services/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "me" } },
}));
jest.mock("../../../services/businessStaffService", () => ({
  listStaff: jest.fn(async () => []),
  getWorkingHours: jest.fn(async () => null),
  // El módulo lee STAFF_ROLES al cargar, no dentro de una función.
  STAFF_ROLES: ["owner", "instructor", "reception"],
  staffDisplayName: (s) => s?.name || s?.id || "",
  addPlaceholderStaff: jest.fn(async () => ({ id: "new1" })),
}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(async () => ({ exists: () => false })),
}));
jest.mock("../../SelectDropdown", () => "SelectDropdown");
jest.mock("../../../services/businessService", () => ({
  getMyBizId: jest.fn(() => "activeBiz"),
  getOwnBizId: jest.fn(() => "me"),
}));
jest.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999",
      primary: "#7C3AED", surface: "#fff", surfaceGlass: "#eee",
      border: "#ddd", error: "#f00", background: "#fff",
    },
    isDark: false,
  }),
}));

const renderPicker = (props) =>
  render(<InstructorPicker value="" onChange={jest.fn()} {...props} />);

beforeEach(() => jest.clearAllMocks());

describe("InstructorPicker — KIN-236", () => {
  it("SIN bizId no le pasa argumento a listStaff (comportamiento de Create)", async () => {
    // El default por parámetro de listStaff es lo que resuelve el negocio
    // activo. Pasarle undefined explícito funcionaría, pero omitirlo es lo que
    // había antes y lo que este test fija.
    renderPicker();
    await waitFor(() => expect(listStaff).toHaveBeenCalled());
    expect(listStaff).toHaveBeenCalledWith();
  });

  it("CON bizId pide el personal de ese negocio (comportamiento de Edit)", async () => {
    renderPicker({ bizId: "owner1" });
    await waitFor(() => expect(listStaff).toHaveBeenCalled());
    expect(listStaff).toHaveBeenCalledWith("owner1");
  });

  it("un bizId nulo no se cuela como argumento", async () => {
    // En Edit el bizId llega DESPUÉS del primer render, así que el primer
    // valor es null. Pasarlo tal cual haría que listStaff devolviera [] en vez
    // de caer a su default, y el picker aparecería vacío.
    renderPicker({ bizId: null });
    await waitFor(() => expect(listStaff).toHaveBeenCalled());
    expect(listStaff).toHaveBeenCalledWith();
  });

  it("vuelve a pedir la lista cuando el bizId llega tarde", async () => {
    // El caso real de Edit: primer render sin negocio, luego el evento carga.
    const { rerender } = renderPicker({ bizId: null });
    await waitFor(() => expect(listStaff).toHaveBeenCalledWith());
    rerender(<InstructorPicker value="" onChange={jest.fn()} bizId="owner1" />);
    await waitFor(() => expect(listStaff).toHaveBeenCalledWith("owner1"));
  });
});
