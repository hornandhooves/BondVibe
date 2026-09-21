/**
 * SearchEventsScreen — city filter chips (KIN-295 baja lógica).
 *
 * events.city stores the dropdown ID (CreateEventScreen.js:1445 wires
 * onValueChange straight to setSelectedCity; :968 writes that id as `city`)
 * — unlike sessionTypes.city, which stores the LABEL. An inactive city's
 * chip must still show up when its id shows up on a published, still-live
 * event, and must NOT show up for an inactive city nothing uses.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import SearchEventsScreen from "../SearchEventsScreen";

const MIN = 60000;
const at = (offsetMin) => new Date(Date.now() + offsetMin * MIN).toISOString();

const mockDocs = [
  {
    id: "future-oaxaca",
    title: "Retiro en Oaxaca",
    date: at(1440), durationMinutes: 60, status: "active",
    category: "sports", city: "oaxaca", hostName: "Ana Torres", listedPublicly: true,
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
      surfaceGlass: "#fff",
    },
    isDark: false,
  }),
}));
// One active city + two inactive ones: "oaxaca" has a live event (its id
// shows up on mockDocs above), "cdmx" has none.
jest.mock("../../hooks/useCities", () => ({
  __esModule: true,
  default: () => ({
    cities: [{ id: "tulum", label: "Tulum" }],
    allCities: [
      { id: "tulum", label: "Tulum" },
      { id: "oaxaca", label: "Oaxaca", inactive: true },
      { id: "cdmx", label: "Ciudad de México", inactive: true },
    ],
  }),
}));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => {
  const actual = jest.requireActual("../../components/Icon");
  return {
    __esModule: true,
    default: "Icon",
    getCategoryIcon: actual.getCategoryIcon,
    getLocationIcon: actual.getLocationIcon,
  };
});
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

describe("SearchEventsScreen — city chips (KIN-295)", () => {
  it("shows an inactive city's chip when its id appears on a live event", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("Oaxaca")).toBeTruthy();
  });

  it("does not show an inactive city's chip when no event uses it", async () => {
    const { findByText, queryByText } = renderScreen();
    await findByText("Oaxaca"); // results/chips settled
    expect(queryByText("Ciudad de México")).toBeNull();
  });
});
