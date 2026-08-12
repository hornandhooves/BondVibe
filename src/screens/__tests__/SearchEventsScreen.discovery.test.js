/**
 * KIN-158 + hostName on the search card.
 *
 * Two independent changes that happen to land on the same screen, tested apart:
 *
 *   1. A finished or cancelled event must not appear in results. The Firestore
 *      query bounds by DAY — a deliberate over-fetch — so the client filter is
 *      the only thing standing between a dead event and someone tapping it. A
 *      QA payment reached checkout on exactly that.
 *   2. The card names the host, matching EventCard's copy.
 *
 * The events are rendered through the real filter, not stubbed, so a regression
 * in eventFilters surfaces here too.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import SearchEventsScreen from "../SearchEventsScreen";

const MIN = 60000;
const at = (offsetMin) => new Date(Date.now() + offsetMin * MIN).toISOString();

/** Events the fake Firestore hands back — the over-fetch the screen must trim. */
const mockDocs = [
  {
    id: "finished",
    title: "Ya terminó",
    date: at(-180), durationMinutes: 60, status: "active",
    category: "sports", city: "tulum", hostName: "Ana Torres", listedPublicly: true,
  },
  {
    id: "running",
    title: "En curso ahora",
    date: at(-30), durationMinutes: 60, status: "active",
    category: "sports", city: "tulum", hostName: "Beto Ruiz", listedPublicly: true,
  },
  {
    id: "future",
    title: "Mañana",
    date: at(1440), durationMinutes: 60, status: "active",
    category: "sports", city: "tulum", hostName: "Carla Díaz", listedPublicly: true,
  },
  {
    id: "cancelled",
    title: "Cancelado pero futuro",
    date: at(1440), durationMinutes: 60, status: "cancelled",
    category: "sports", city: "tulum", hostName: "Dani Lopez", listedPublicly: true,
  },
  {
    id: "nohost",
    title: "Sin anfitrión",
    date: at(2880), durationMinutes: 60, status: "active",
    category: "sports", city: "tulum", listedPublicly: true, // hostName absent
  },
];

jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "me" } } }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  startAfter: jest.fn(() => ({})),
  getDocs: jest.fn(async () => ({
    docs: mockDocsRef.map((d) => ({ id: d.id, data: () => d })),
    empty: false,
  })),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(async () => ({ exists: () => false })),
}));

// Referenced from inside the mock factory, so it needs the mock* prefix.
const mockDocsRef = mockDocs;

jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#fff",
      textSecondary: "#666", textTertiary: "#999", border: "#ddd",
      borderStrong: "#ccc", brandSoft: "#eee", error: "#f00", sunken: "#eee",
    },
    isDark: false,
  }),
}));
jest.mock("../../hooks/useCities", () => ({
  __esModule: true,
  default: () => ({ cities: [{ id: "tulum", label: "Tulum" }] }),
}));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => ({
  __esModule: true,
  default: "Icon",
  getCategoryIcon: () => "Icon",
  getLocationIcon: () => "Icon",
}));
jest.mock("../../components/SelectDropdown", () => "SelectDropdown");
jest.mock("../../components/DateField", () => "DateField");
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

const nav = { navigate: jest.fn(), goBack: jest.fn() };
const renderScreen = () => render(<SearchEventsScreen navigation={nav} route={{ params: {} }} />);

beforeEach(() => jest.clearAllMocks());

describe("KIN-158 — finished and cancelled events don't reach the results", () => {
  it("hides an event that ended, even though it is still today", async () => {
    const { queryByText, findByText } = renderScreen();
    await findByText("Mañana"); // results rendered
    expect(queryByText("Ya terminó")).toBeNull();
  });

  it("keeps an event that is still in progress", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("En curso ahora")).toBeTruthy();
  });

  it("keeps a future event", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("Mañana")).toBeTruthy();
  });

  it("hides a cancelled event that hasn't happened yet", async () => {
    const { queryByText, findByText } = renderScreen();
    await findByText("Mañana");
    expect(queryByText("Cancelado pero futuro")).toBeNull();
  });

  it("the count reflects only what survived the filter", async () => {
    // 5 fetched, 2 dropped (finished + cancelled), 3 shown.
    const { findAllByTestId } = renderScreen();
    const cards = await findAllByTestId("event-search-result");
    expect(cards).toHaveLength(3);
  });
});

describe("hostName on the search card", () => {
  it("names the host when the event has one", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("Hosted by Carla Díaz")).toBeTruthy();
  });

  it("uses the same copy key as EventCard", async () => {
    // Not "Host: X" or a bare name — the shared eventCard.hostedBy string.
    const { findByText } = renderScreen();
    expect(await findByText("Hosted by Beto Ruiz")).toBeTruthy();
  });

  it("omits the line entirely when hostName is missing", async () => {
    // An older doc without the denormalised field must not render "Hosted by "
    // or a placeholder.
    const { findByText, queryByText } = renderScreen();
    await findByText("Sin anfitrión"); // the card itself is there
    expect(queryByText(/Hosted by\s*$/)).toBeNull();
    expect(queryByText("Hosted by undefined")).toBeNull();
    expect(queryByText("Hosted by Host")).toBeNull();
  });
});
