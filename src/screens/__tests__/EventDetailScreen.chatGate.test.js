/**
 * KIN-240 — el co-anfitrión entra al chat sin estar inscrito (capa 3).
 *
 * Los controles de manejo estaban gateados con `isCreator` a secas, así que un
 * co-anfitrión no veía el roster, ni el check-in, ni podía cancelar o promover
 * el evento del que es responsable. `isManager = isCreator || isCoHost` ya
 * existía y estaba bien calculado: sólo no se usaba en esos sitios.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { onSnapshot, getDoc } from "firebase/firestore";
import { auth } from "../../services/firebase";
import EventDetailScreen from "../EventDetailScreen";

const FUTURE = new Date(Date.now() + 5 * 864e5).toISOString();

/** El evento, con quien lo mira definido por el uid del mock de auth. */
let eventData = {};
const seedEvent = (over = {}) => {
  eventData = {
    id: "evt1",
    title: "Clase de yoga",
    description: "Una clase",
    creatorId: "creator1",
    coHosts: [],
    price: 0,
    date: FUTURE,
    status: "active",
    durationMinutes: 60,
    maxAttendees: 10,
    participantCount: 0,
    languages: ["es"],
    location: "Playa Paraiso",
    ...over,
  };
};

// auth mutable: quién mira la pantalla es el eje de todo este archivo, así que
// se cambia por test mutando el objeto que el módulo ya capturó.
jest.mock("../../services/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "creator1" } },
}));
jest.mock("firebase/firestore", () => ({
  // La ruta viaja en el ref: getDoc sirve tanto el doc del evento como el del
  // usuario, y devolver {} para todo borraba el creatorId — con lo que hasta el
  // creador dejaba de serlo y la prueba medía otra cosa.
  doc: jest.fn((_db, col, id) => ({ __col: col, __id: id })),
  getDoc: jest.fn(),
  updateDoc: jest.fn(async () => {}),
  arrayUnion: jest.fn(),
  arrayRemove: jest.fn(),
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  getDocs: jest.fn(async () => ({ docs: [], empty: true })),
  onSnapshot: jest.fn(),
}));
jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn(async () => ({ data: {} }))),
}));
jest.mock("@react-navigation/native", () => ({
  // Tiene que EJECUTAR el callback: ahí es donde la pantalla carga y sale del
  // estado de loading. Con un no-op sólo se renderiza el spinner, y entonces
  // cualquier aserción de "no veo X" pasa en falso porque no hay nada que ver.
  useFocusEffect: (cb) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#fff",
      surfaceGlass: "#eee", textSecondary: "#666", textTertiary: "#999",
      border: "#ddd", borderStrong: "#ccc", error: "#f00", sunken: "#eee",
      success: "#0a0", warning: "#fa0", brandSoft: "#eee",
    },
    isDark: false,
  }),
}));
jest.mock("../../hooks/usePremium", () => ({ usePremium: () => ({ isPremium: false }) }));
jest.mock("../../services/membershipService", () => ({
  getHostMembershipPlans: jest.fn(async () => []),
  getUsableMembershipForHost: jest.fn(async () => null),
  getUserReservationForEvent: jest.fn(async () => null),
  releaseMembershipReservation: jest.fn(async () => {}),
}));
jest.mock("../../services/businessMembersService", () => ({
  getMyPricingTierForHost: jest.fn(async () => null),
}));
jest.mock("../../services/rosterService", () => ({
  leaveEvent: jest.fn(async () => {}),
  isOnRoster: jest.fn(async () => false),
  getEventRosterUids: jest.fn(async () => []),
  getEventCoAttendees: jest.fn(async () => []),
}));
jest.mock("../../services/eventJoinService", () => ({ joinFreeEvent: jest.fn() }));
// Devuelve {} y no null: la pantalla lee .personality sobre el resultado sin
// guardarlo, y el propio comentario del código documenta {} como el vacío real.
jest.mock("../../services/matchingService", () => ({ getMatchDataFor: jest.fn(async () => ({})) }));
jest.mock("../../services/followService", () => ({ getFollowing: jest.fn(async () => []) }));
jest.mock("../../services/checkinService", () => ({ buildCheckinPayload: jest.fn(() => "qr") }));
jest.mock("../../services/stripeService", () => ({ pesosTocentavos: (n) => n * 100 }));
jest.mock("../../utils/notificationService", () => ({ createNotification: jest.fn() }));
jest.mock("../../utils/personalityScoring", () => ({ getMatchInsight: jest.fn(() => null) }));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../components/TranslateButton", () => "TranslateButton");
jest.mock("../../components/AvatarPicker", () => ({ AvatarDisplay: "AvatarDisplay" }));
jest.mock("../../components/CancelEventModal", () => "CancelEventModal");
jest.mock("../../components/MatchingEntryCard", () => "MatchingEntryCard");
jest.mock("../../components/EventImageGallery", () => "EventImageGallery");
jest.mock("../../components/EventRatings", () => "EventRatings");
jest.mock("../../components/EventLocationBlock", () => "EventLocationBlock");
jest.mock("react-native-qrcode-svg", () => "QRCode");

const nav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };

/** Renderiza la pantalla con `uid` mirándola. */
const openAs = async (uid) => {
  auth.currentUser = { uid };
  getDoc.mockImplementation(async (ref) =>
    ref?.__col === "events" ?
      { exists: () => true, id: "evt1", data: () => eventData } :
      { exists: () => true, id: ref?.__id || "u", data: () => ({}) });
  onSnapshot.mockImplementation((ref, cb) => {
    cb({ exists: () => true, id: "evt1", data: () => eventData });
    return () => {};
  });
  const utils = render(
    <EventDetailScreen route={{ params: { eventId: "evt1" } }} navigation={nav} />,
  );
  await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  seedEvent();
});

describe("KIN-240 — acceso al chat desde el detalle del evento", () => {
  it("un CO-ANFITRIÓN sin inscribirse ve el acceso al chat", async () => {
    // El hueco: gestiona el evento pero nunca se unió, así que `isJoined` es
    // falso y el gate lo dejaba fuera de su propio chat.
    seedEvent({ coHosts: ["cohost1"] });
    const utils = await openAs("cohost1");
    expect(await utils.findByTestId("event-chat-btn")).toBeTruthy();
    expect(await utils.findByTestId("event-chat-section")).toBeTruthy();
  });

  it("el creador lo ve (sin cambio)", async () => {
    seedEvent({ coHosts: ["cohost1"] });
    const utils = await openAs("creator1");
    expect(await utils.findByTestId("event-chat-btn")).toBeTruthy();
  });

  it("un desconocido NO inscrito no lo ve — sigue siendo un gate", async () => {
    seedEvent({ coHosts: ["cohost1"] });
    const utils = await openAs("randoms");
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(utils.queryByTestId("event-chat-btn")).toBeNull();
    expect(utils.queryByTestId("event-chat-section")).toBeNull();
  });

  it("estar en coHosts de otro evento no abre este chat", async () => {
    seedEvent({ coHosts: ["otro1"] });
    const utils = await openAs("cohost1");
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(utils.queryByTestId("event-chat-btn")).toBeNull();
  });
});
