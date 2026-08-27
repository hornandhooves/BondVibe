/**
 * KIN-240 — el co-anfitrión entraba al chat y lo echaban (capa 2).
 *
 * Las reglas de Firestore y el botón del detalle son necesarias pero no
 * suficientes: al abrir la pantalla, `EventChatScreen` vuelve a comprobar la
 * participación por su cuenta y, si falla, muestra "necesitas unirte" y hace
 * goBack(). Con `!isCreator && !isAttendee` un co-anfitrión que nunca se
 * inscribió quedaba fuera aunque el servidor ya se lo permitiera.
 *
 * Por eso el ticket son tres capas y no una: cada una puede cerrarle la puerta
 * sola.
 *
 * Lo que se asierta es la EXPULSIÓN — el Alert de acceso restringido y el
 * goBack — porque es el síntoma que veía el usuario, no un estado interno.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { getDoc } from "firebase/firestore";
import { isOnRoster } from "../../services/rosterService";
import EventChatScreen from "../EventChatScreen";

let eventData = {};
const seedEvent = (over = {}) => {
  eventData = { creatorId: "creator1", coHosts: [], title: "Clase", ...over };
};

jest.mock("../../services/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "creator1" } },
}));
jest.mock("firebase/firestore", () => ({
  // La colección viaja en el ref para poder contar SÓLO las lecturas del doc
  // del evento — la pantalla también lee el doc del creador, y eso es previo.
  doc: jest.fn((_db, col, id) => ({ __col: col, __id: id })),
  getDoc: jest.fn(),
}));
jest.mock("../../services/rosterService", () => ({
  isOnRoster: jest.fn(async () => false),
  getEventCoAttendees: jest.fn(async () => []),
}));
// Devuelven promesas: la pantalla encadena .catch() sobre varias de ellas en el
// cleanup, y un jest.fn() pelado devuelve undefined.
jest.mock("../../utils/messageService", () => ({
  sendMessage: jest.fn(async () => {}),
  sendLocationMessage: jest.fn(async () => {}),
  subscribeToMessages: jest.fn(() => () => {}),
  ensureEventConversation: jest.fn(async () => {}),
  setTypingStatus: jest.fn(async () => {}),
  subscribeToTypingStatus: jest.fn(() => () => {}),
  markMessagesAsRead: jest.fn(async () => {}),
  markMessagesAsDelivered: jest.fn(async () => {}),
}));
jest.mock("../../services/pollService", () => ({ createPoll: jest.fn() }));
jest.mock("../../services/carpoolService", () => ({ createCarpool: jest.fn() }));
jest.mock("../../services/reportService", () => ({ reportProhibitedContent: jest.fn() }));
jest.mock("../../services/userService", () => ({ notifyMentions: jest.fn() }));
jest.mock("../../utils/contentGuard", () => ({
  detectProhibitedContent: jest.fn(() => null), PROHIBITED_MESSAGE: "x",
}));
jest.mock("expo-location", () => ({}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#fff",
      surfaceGlass: "#eee", textSecondary: "#666", textTertiary: "#999",
      border: "#ddd", borderStrong: "#ccc", error: "#f00", sunken: "#eee",
    },
    isDark: false,
  }),
}));
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../components/PollCard", () => "PollCard");
jest.mock("../../components/CarpoolCard", () => "CarpoolCard");
jest.mock("../../components/PlaceAutocomplete", () => "PlaceAutocomplete");
jest.mock("../../components/MentionText", () => "MentionText");
jest.mock("../../components/MentionSuggestions", () => "MentionSuggestions");
jest.mock("../../components/AvatarPicker", () => ({ AvatarDisplay: "AvatarDisplay" }));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

const nav = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };

/** Abre el chat como `uid` y devuelve si lo echaron. */
const openChatAs = async (uid) => {
  const { auth } = require("../../services/firebase");
  auth.currentUser = { uid };
  getDoc.mockResolvedValue({ exists: () => true, data: () => eventData });
  render(<EventChatScreen route={{ params: { eventId: "evt1" } }} navigation={nav} />);
  await waitFor(() => expect(getDoc).toHaveBeenCalled());
  // Un tick más: el chequeo de roster es asíncrono.
  await waitFor(() => {});
  return Alert.alert.mock.calls.length > 0;
};

beforeEach(() => {
  jest.clearAllMocks();
  seedEvent();
  isOnRoster.mockResolvedValue(false);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => Alert.alert.mockRestore());

describe("KIN-240 — quién puede abrir el chat del evento", () => {
  it("un CO-ANFITRIÓN sin roster NO es expulsado", async () => {
    // El bug: gestionaba el evento y la pantalla le decía "necesitas unirte".
    seedEvent({ coHosts: ["cohost1"] });
    const expulsado = await openChatAs("cohost1");
    expect(expulsado).toBe(false);
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  it("el creador sigue entrando (sin cambio)", async () => {
    seedEvent({ coHosts: ["cohost1"] });
    expect(await openChatAs("creator1")).toBe(false);
  });

  it("un asistente del roster sigue entrando (sin cambio)", async () => {
    isOnRoster.mockResolvedValue(true);
    expect(await openChatAs("alice")).toBe(false);
  });

  it("un desconocido SÍ es expulsado — sigue siendo un gate", async () => {
    seedEvent({ coHosts: ["cohost1"] });
    expect(await openChatAs("mallory")).toBe(true);
  });

  it("estar en coHosts de otro evento no sirve", async () => {
    seedEvent({ coHosts: ["otro1"] });
    expect(await openChatAs("cohost1")).toBe(true);
  });

  it("un evento sin campo coHosts no revienta", async () => {
    // La inmensa mayoría de los documentos no tienen el campo.
    seedEvent({ coHosts: undefined });
    expect(await openChatAs("creator1")).toBe(false);
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    expect(await openChatAs("mallory")).toBe(true);
  });

  it("NO hace una lectura extra del evento para saber si es co-host", async () => {
    // Sale del eventData que la pantalla ya cargó. Una segunda lectura del
    // mismo documento sería un round-trip por cada apertura del chat.
    //
    // Se cuentan sólo las lecturas de `events`: la pantalla también lee el doc
    // del creador para la cabecera, y eso ya existía.
    seedEvent({ coHosts: ["cohost1"] });
    await openChatAs("cohost1");
    const lecturasDelEvento = getDoc.mock.calls
      .filter(([ref]) => ref?.__col === "events");
    expect(lecturasDelEvento).toHaveLength(1);
  });
});
