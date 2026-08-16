/**
 * KIN-230 — agregar co-anfitrión por @handle y desde el staff del negocio.
 *
 * Antes sólo se podía por email exacto, lo que obliga a conocer el correo de
 * alguien que quizá sólo conoces por su @handle dentro de la app.
 *
 * Lo que este archivo protege, más allá de que los caminos funcionen:
 *
 *   - los TRES (email, handle, lista de staff) escriben por la MISMA función,
 *     así que el guard de "ya es co-host / es el creador" no puede existir en
 *     dos de ellos y faltar en el tercero;
 *   - la lista sale del negocio DUEÑO del evento, nunca del negocio activo de
 *     quien edita — el default de listStaff es justo el equivocado, y aquí
 *     sería peor que en KIN-236: daría de alta como co-anfitrión a alguien
 *     ajeno al evento;
 *   - los placeholders quedan fuera. Un co-anfitrión tiene que poder recibir
 *     notificaciones y editar; un placeholder no tiene cuenta.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { updateDoc, getDoc } from "firebase/firestore";
import { Alert } from "react-native";
import { findUserByEmail } from "../../services/hostGroupService";
import { findUserByHandle } from "../../services/userService";
import { listStaff } from "../../services/businessStaffService";
import EditEventScreen from "../EditEventScreen";

const FUTURE = new Date(Date.now() + 3 * 864e5).toISOString();

let eventData = {};
const seed = (over = {}) => {
  eventData = {
    title: "Clase de yoga",
    description: "Una clase",
    location: "Playa Paraiso",
    date: FUTURE,
    durationMinutes: 60,
    maxAttendees: 10,
    price: 0,
    creatorId: "me",
    ...over,
  };
};

jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "me" } } }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({ __doc: true })),
  getDoc: jest.fn(),
  updateDoc: jest.fn(async () => {}),
  deleteDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(async () => ({ docs: [], empty: true })),
  writeBatch: jest.fn(() => ({ update: jest.fn(), delete: jest.fn(), set: jest.fn(), commit: jest.fn(async () => {}) })),
  arrayUnion: jest.fn(),
  arrayRemove: jest.fn(),
  serverTimestamp: jest.fn(() => "TS"),
}));
jest.mock("../../services/businessAgendaService", () => ({
  checkInstructorAvailability: jest.fn(async () => ({ conflict: false, outOfHours: false })),
  AGENDA_ITEM_KIND: { EVENT: "event", BLOCKED: "blocked" },
}));
jest.mock("../../services/membershipService", () => ({ getHostMembershipPlans: jest.fn(async () => []) }));
jest.mock("../../services/businessService", () => ({ getMyBizId: jest.fn(() => "ACTIVE_BIZ_DEL_EDITOR") }));
jest.mock("../../services/hostGroupService", () => ({ findUserByEmail: jest.fn() }));
jest.mock("../../services/userService", () => ({ findUserByHandle: jest.fn() }));
jest.mock("../../services/businessStaffService", () => ({
  listStaff: jest.fn(async () => []),
  staffDisplayName: (s, f = "Staff member") =>
    (s && (s.displayName || s.name || s.fullName || s.email)) || f,
}));
jest.mock("../../services/storageService", () => ({
  uploadEventImages: jest.fn(async () => []),
  deleteEventImage: jest.fn(async () => {}),
}));
jest.mock("../../utils/geocode", () => ({ geocodeAddress: jest.fn(async () => null) }));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#fff",
      surfaceGlass: "#eee", textSecondary: "#666", textTertiary: "#999",
      border: "#ddd", error: "#f00",
    },
    isDark: false,
  }),
}));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../components/PlaceAutocomplete", () => "PlaceAutocomplete");
jest.mock("../../components/EventImagePicker", () => "EventImagePicker");
// KIN-236: el mock expone el bizId recibido — es justo el dato bajo prueba.
jest.mock("../../components/business/InstructorPicker", () => {
  const { Text } = require("react-native");
  function MockInstructorPicker({ bizId }) {
    return <Text>{`picker-biz:${bizId === undefined ? "undefined" : String(bizId)}`}</Text>;
  }
  return MockInstructorPicker;
});
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("../../components/RecurrenceModal", () => "RecurrenceModal");

// Los dos componentes compartidos se exponen por su valor y su onChange: lo que
// se prueba es el dato que entra y sale, no cómo se pintan (tienen sus tests).
jest.mock("../../components/SelectDropdown", () => {
  const { Text, TouchableOpacity } = require("react-native");
  function MockSelectDropdown({ label, value, onValueChange, options, type, multiSelect }) {
    return (
      <TouchableOpacity
        testID={`dropdown-${type || "plain"}`}
        accessibilityLabel={label}
        onPress={() => {
          const next = options?.[options.length - 1];
          const id = next?.id ?? next?.value ?? next;
          onValueChange(multiSelect ? [id] : id);
        }}
      >
        <Text>{`${type}:${JSON.stringify(value)}:opts=${options?.length ?? 0}`}</Text>
      </TouchableOpacity>
    );
  }
  return MockSelectDropdown;
});
jest.mock("../../components/DurationWheelModal", () => {
  const { Text, TouchableOpacity } = require("react-native");
  function MockDurationWheelModal({ visible, value, onSelect }) {
    if (!visible) return null;
    return (
      <TouchableOpacity testID="duration-wheel" onPress={() => onSelect(135)}>
        <Text>{`wheel:${value}`}</Text>
      </TouchableOpacity>
    );
  }
  return { __esModule: true, default: MockDurationWheelModal, formatDuration: (m) => `${m}min` };
});
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

const nav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) };

const open = async () => {
  getDoc.mockResolvedValue({ exists: () => true, data: () => eventData });
  const utils = render(<EditEventScreen route={{ params: { eventId: "evt1" } }} navigation={nav} />);
  await utils.findByDisplayValue("Clase de yoga");
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => Alert.alert.mockRestore());


const seedWithCoHosts = (over) => seed({ creatorId: "me", ...over });

describe("KIN-230 — clasificación email vs @handle", () => {
  it("un email va a findUserByEmail", async () => {
    findUserByEmail.mockResolvedValue({ id: "u1", fullName: "Ana" });
    const utils = await open();
    fireEvent.changeText(await utils.findByPlaceholderText(/email or @handle/i), "ana@example.com");
    fireEvent.press(await utils.findByText("Add"));
    await waitFor(() => expect(findUserByEmail).toHaveBeenCalledWith("ana@example.com"));
    expect(findUserByHandle).not.toHaveBeenCalled();
  });

  it("un @handle va a findUserByHandle", async () => {
    findUserByHandle.mockResolvedValue({ uid: "u2", name: "Beto" });
    const utils = await open();
    fireEvent.changeText(await utils.findByPlaceholderText(/email or @handle/i), "@beto");
    fireEvent.press(await utils.findByText("Add"));
    await waitFor(() => expect(findUserByHandle).toHaveBeenCalledWith("@beto"));
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("un handle sin @ también es handle, no email", async () => {
    findUserByHandle.mockResolvedValue({ uid: "u3", name: "Cata" });
    const utils = await open();
    fireEvent.changeText(await utils.findByPlaceholderText(/email or @handle/i), "cata");
    fireEvent.press(await utils.findByText("Add"));
    await waitFor(() => expect(findUserByHandle).toHaveBeenCalled());
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("una @ sin dominio con punto NO es un email", async () => {
    // "ana@local" no es una dirección utilizable; tratarlo como email sólo
    // garantizaría un "no encontrado".
    findUserByHandle.mockResolvedValue(null);
    const utils = await open();
    fireEvent.changeText(await utils.findByPlaceholderText(/email or @handle/i), "ana@local");
    fireEvent.press(await utils.findByText("Add"));
    await waitFor(() => expect(findUserByHandle).toHaveBeenCalled());
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("el email se normaliza a minúsculas, el handle se pasa tal cual", async () => {
    // findUserByHandle ya quita la @ y baja a minúsculas por su cuenta.
    findUserByEmail.mockResolvedValue({ id: "u1", fullName: "Ana" });
    const utils = await open();
    fireEvent.changeText(await utils.findByPlaceholderText(/email or @handle/i), "  ANA@Example.COM ");
    fireEvent.press(await utils.findByText("Add"));
    await waitFor(() => expect(findUserByEmail).toHaveBeenCalledWith("ana@example.com"));
  });
});

describe("KIN-230 — el guard vale para los tres caminos", () => {
  it("por handle, alguien que ya es co-host no se agrega dos veces", async () => {
    seedWithCoHosts({ coHosts: ["dup1"] });
    findUserByHandle.mockResolvedValue({ uid: "dup1", name: "Dup" });
    const utils = await open();
    fireEvent.changeText(await utils.findByPlaceholderText(/email or @handle/i), "@dup");
    fireEvent.press(await utils.findByText("Add"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("por handle, el creador no puede ser su propio co-host", async () => {
    findUserByHandle.mockResolvedValue({ uid: "me", name: "Yo" });
    const utils = await open();
    fireEvent.changeText(await utils.findByPlaceholderText(/email or @handle/i), "@yo");
    fireEvent.press(await utils.findByText("Add"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe("KIN-230 — lista de staff", () => {
  it("pide el staff del negocio DUEÑO, nunca el activo del editor", async () => {
    seedWithCoHosts({ businessOwnerUid: "owner1" });
    await open();
    await waitFor(() => expect(listStaff).toHaveBeenCalled());
    expect(listStaff).toHaveBeenCalledWith("owner1");
    expect(listStaff).not.toHaveBeenCalledWith();
  });

  it("excluye placeholders (docs sin campo uid)", async () => {
    // addPlaceholderStaff omite `uid` a propósito: su ausencia es lo que marca
    // el doc como no autenticable. Un co-anfitrión sin cuenta no sirve.
    seedWithCoHosts({ businessOwnerUid: "owner1" });
    listStaff.mockResolvedValue([
      { uid: "real1", name: "Real" },
      { id: "st_abc123", name: "Placeholder", claimed: false },
    ]);
    const utils = await open();
    expect(await utils.findByTestId("cohost-staff-real1")).toBeTruthy();
    expect(utils.queryByText("Placeholder")).toBeNull();
  });

  it("excluye al creador y a quien ya es co-host", async () => {
    seedWithCoHosts({ businessOwnerUid: "owner1", coHosts: ["ya1"] });
    listStaff.mockResolvedValue([
      { uid: "me", name: "Creador" },
      { uid: "ya1", name: "Ya es co-host" },
      { uid: "libre1", name: "Disponible" },
    ]);
    const utils = await open();
    expect(await utils.findByTestId("cohost-staff-libre1")).toBeTruthy();
    expect(utils.queryByTestId("cohost-staff-me")).toBeNull();
    expect(utils.queryByTestId("cohost-staff-ya1")).toBeNull();
  });

  it("un evento sin negocio no muestra lista", async () => {
    // Fallback a creatorId: el "negocio" es el propio host, sin staff que
    // ofrecer más allá de lo que devuelva listStaff para él.
    seedWithCoHosts({ businessOwnerUid: null });
    listStaff.mockResolvedValue([]);
    const utils = await open();
    await waitFor(() => expect(listStaff).toHaveBeenCalled());
    expect(utils.queryByTestId("cohost-staff-list")).toBeNull();
  });

  it("tocar una fila escribe por la misma función compartida", async () => {
    seedWithCoHosts({ businessOwnerUid: "owner1" });
    listStaff.mockResolvedValue([{ uid: "s1", name: "Staff Uno" }]);
    const utils = await open();
    fireEvent.press(await utils.findByTestId("cohost-staff-s1"));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    // La misma escritura que usan email y handle: arrayUnion sobre coHosts.
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it("no ofrece a nadie si el staff sólo tiene placeholders", async () => {
    seedWithCoHosts({ businessOwnerUid: "owner1" });
    listStaff.mockResolvedValue([{ id: "st_x", name: "Sólo placeholder" }]);
    const utils = await open();
    await waitFor(() => expect(listStaff).toHaveBeenCalled());
    expect(utils.queryByTestId("cohost-staff-list")).toBeNull();
  });
});
