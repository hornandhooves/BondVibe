/**
 * KIN-231 / KIN-233 / KIN-232 — Edit Event tenía sus propios controles.
 *
 * Los tres tickets son el mismo defecto en tres campos: Edit se construyó con
 * listas y widgets locales en vez de los de Create, y con el tiempo divergieron
 * hasta escribir datos que el resto de la app no reconoce.
 *
 *   - categoría: 6 chips locales con el LABEL como valor ("Social"), mientras
 *     Create guarda el id ("social") de una lista de 15. Editar un evento le
 *     cambiaba la categoría a un valor que los filtros no encuentran, y 9
 *     categorías eran inalcanzables desde Edit.
 *   - duración: SelectDropdown de 8 valores fijos vs. la rueda de Create.
 *   - idioma: `language` (string) vs. `languages` (array). SearchEvents filtra
 *     por el array, así que un evento editado desaparecía del filtro.
 *
 * Lo que se prueba aquí es lo que de verdad importa: qué VALOR queda guardado,
 * no qué componente se dibuja. Un test que sólo comprobara que existe un
 * dropdown pasaría igual con el valor equivocado dentro.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { updateDoc, getDoc } from "firebase/firestore";
import { Alert } from "react-native";
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
jest.mock("../../services/businessService", () => ({ getMyBizId: jest.fn(() => null) }));
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
jest.mock("../../components/business/InstructorPicker", () => "InstructorPicker");
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
const save = async (utils) => {
  fireEvent.press(await utils.findByText("Save Changes"));
  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  return updateDoc.mock.calls[0][1];
};

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => Alert.alert.mockRestore());

// ---------------------------------------------------------------------------
// KIN-231 — categoría
// ---------------------------------------------------------------------------

describe("KIN-231 — categoría", () => {
  it("ofrece las 15 de EVENT_CATEGORIES, no 6", async () => {
    // Las 9 que faltaban eran inalcanzables desde Edit: un host no podía poner
    // su evento en Wellness, Music, Games...
    const utils = await open();
    expect(await utils.findByText(/opts=15/)).toBeTruthy();
  });

  it("un evento guardado con el LABEL capitalizado se abre normalizado", async () => {
    // El caso que deja el bug actual: Edit escribía "Social" donde Create
    // escribe "social". Al reabrirlo tiene que entenderse como la misma
    // categoría, no como una desconocida.
    seed({ category: "Social" });
    const utils = await open();
    expect(await utils.findByText(/^category:"social":/)).toBeTruthy();
  });

  it("un evento guardado con el id se abre igual", async () => {
    seed({ category: "sports" });
    const utils = await open();
    expect(await utils.findByText(/^category:"sports":/)).toBeTruthy();
  });

  it("sin categoría cae en el id 'social', no en el label", async () => {
    seed({ category: undefined });
    const utils = await open();
    expect(await utils.findByText(/^category:"social":/)).toBeTruthy();
  });

  it("guarda el id, nunca el label", async () => {
    seed({ category: "Social" });
    const utils = await open();
    expect((await save(utils)).category).toBe("social");
  });

  it("reabrir y guardar sin tocar nada ya no corrompe la categoría", async () => {
    // El daño real del bug: abrir Edit por cualquier otro motivo reescribía la
    // categoría a un valor que los filtros de búsqueda no reconocen.
    seed({ category: "adventure" });
    const utils = await open();
    expect((await save(utils)).category).toBe("adventure");
  });
});

// ---------------------------------------------------------------------------
// KIN-233 — duración
// ---------------------------------------------------------------------------

describe("KIN-233 — duración", () => {
  it("muestra la duración actual con formatDuration, no un dropdown", async () => {
    seed({ durationMinutes: 90 });
    const utils = await open();
    expect(await utils.findByText("90min")).toBeTruthy();
  });

  it("respeta una duración que el dropdown viejo no podía representar", async () => {
    // El motivo del ticket: la rueda de Create permite 1h45, el dropdown de
    // Edit sólo tenía 8 valores fijos. Abrir Edit no debe forzarla a otro valor.
    seed({ durationMinutes: 105 });
    const utils = await open();
    expect(await utils.findByText("105min")).toBeTruthy();
    expect((await save(utils)).durationMinutes).toBe(105);
  });

  it("la rueda se abre al tocar el campo y guarda lo que devuelve", async () => {
    const utils = await open();
    expect(utils.queryByTestId("duration-wheel")).toBeNull(); // cerrada al inicio
    fireEvent.press(await utils.findByTestId("edit-duration-trigger"));
    fireEvent.press(await utils.findByTestId("duration-wheel")); // devuelve 135
    expect((await save(utils)).durationMinutes).toBe(135);
  });

  it("el campo del modelo no cambia de nombre", async () => {
    // durationMinutes lo leen escrow, los recordatorios y isEventPast: un
    // rename aquí rompería el cálculo de fin de evento en media app.
    seed({ durationMinutes: 60 });
    const utils = await open();
    expect(await save(utils)).toHaveProperty("durationMinutes");
  });
});
