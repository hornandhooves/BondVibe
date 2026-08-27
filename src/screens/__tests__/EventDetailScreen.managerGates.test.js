/**
 * KIN-237 — un co-anfitrión gestiona el evento igual que el creador.
 *
 * Los controles de manejo estaban gateados con `isCreator` a secas, así que un
 * co-anfitrión no veía el roster, ni el check-in, ni podía cancelar o promover
 * el evento del que es responsable. `isManager = isCreator || isCoHost` ya
 * existía y estaba bien calculado: sólo no se usaba en esos sitios.
 *
 * El caso que da sentido a todo el ticket es el ÚLTIMO de este archivo: el
 * co-anfitrión tampoco debe ver la barra de Join/Pay. Ese gate es una negación
 * (`!isManager`), y es justo el que se rompe si alguien cambia los otros siete
 * a ciegas con buscar-y-reemplazar — quedaría un co-anfitrión al que se le
 * ofrece pagar por su propio evento.
 *
 * Se asierta por testID, no por texto: el copy cambia y estos gates no deberían
 * volver a quedar sin cobertura por una traducción.
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

/** Los cuatro controles de manejo + la barra que NO debe ver quien gestiona. */
const GESTION = ["event-roster-section", "event-checkin-section", "event-promote-section", "event-cancel-btn"];

beforeEach(() => {
  jest.clearAllMocks();
  seedEvent();
});

describe("KIN-237 — el co-anfitrión gestiona igual que el creador", () => {
  it("el creador ve los cuatro controles de manejo (sin cambio)", async () => {
    const utils = await openAs("creator1");
    for (const id of GESTION) {
      expect(await utils.findByTestId(id)).toBeTruthy();
    }
  });

  it("un CO-ANFITRIÓN ve los cuatro — antes no veía ninguno", async () => {
    seedEvent({ coHosts: ["cohost1"] });
    const utils = await openAs("cohost1");
    for (const id of GESTION) {
      expect(await utils.findByTestId(id)).toBeTruthy();
    }
  });

  it("un asistente cualquiera NO ve ninguno", async () => {
    // El gate sigue siendo un gate: ampliarlo a co-anfitriones no puede
    // abrírselo a todo el mundo.
    seedEvent({ coHosts: ["cohost1"] });
    const utils = await openAs("randoms");
    for (const id of GESTION) {
      expect(utils.queryByTestId(id)).toBeNull();
    }
  });

  it("el co-anfitrión NO ve la barra de Join/Pay", async () => {
    // El caso que da sentido al ticket: es una negación (!isManager), justo la
    // que se rompe con un buscar-y-reemplazar a ciegas. Quedaría un
    // co-anfitrión al que se le ofrece pagar por su propio evento.
    seedEvent({ coHosts: ["cohost1"], price: 200 });
    const utils = await openAs("cohost1");
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(utils.queryByTestId("event-join-bar")).toBeNull();
  });

  it("el creador tampoco la ve (sin cambio)", async () => {
    seedEvent({ price: 200 });
    const utils = await openAs("creator1");
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(utils.queryByTestId("event-join-bar")).toBeNull();
  });

  it("un asistente SÍ la ve — la barra sigue existiendo para quien debe", async () => {
    seedEvent({ coHosts: ["cohost1"], price: 200 });
    const utils = await openAs("randoms");
    expect(await utils.findByTestId("event-join-bar")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// KIN-237 gate 9 — regalar el evento
// ---------------------------------------------------------------------------

describe("KIN-237 — regalar el evento", () => {
  it("un asistente SÍ ve el botón en un evento pagado", async () => {
    // Existe para quien debe: regalar es comprarle la entrada a otra persona.
    seedEvent({ coHosts: ["cohost1"], price: 200 });
    const utils = await openAs("randoms");
    expect(await utils.findByTestId("event-gift-btn")).toBeTruthy();
  });

  it("el CO-ANFITRIÓN no lo ve", async () => {
    // El gate 9. Quien gestiona el evento no compra su propio evento, igual que
    // no ve la barra de Join/Pay.
    seedEvent({ coHosts: ["cohost1"], price: 200 });
    const utils = await openAs("cohost1");
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(utils.queryByTestId("event-gift-btn")).toBeNull();
  });

  it("el creador tampoco lo ve (sin cambio)", async () => {
    seedEvent({ coHosts: ["cohost1"], price: 200 });
    const utils = await openAs("creator1");
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(utils.queryByTestId("event-gift-btn")).toBeNull();
  });

  it("no aparece en un evento gratis, para nadie", async () => {
    // El precio > 0 sigue siendo parte del gate: ampliarlo a co-anfitriones no
    // debe hacer que un evento gratis se pueda "regalar".
    seedEvent({ coHosts: ["cohost1"], price: 0 });
    const utils = await openAs("randoms");
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(utils.queryByTestId("event-gift-btn")).toBeNull();
  });
});
