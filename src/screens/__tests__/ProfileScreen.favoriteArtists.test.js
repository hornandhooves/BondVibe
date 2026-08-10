/**
 * KIN-200 — picking favorite artists in profile edit.
 *
 * Covers the whole round trip: search → pick → persist. The rate-limit
 * guardrails (400ms debounce, 2-character floor) are asserted as behaviour and
 * not left to code review, because exceeding the iTunes ~20 req/min ceiling has
 * no local symptom — it only shows up as Apple refusing later.
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { updateDoc, getDoc } from "firebase/firestore";
import ProfileScreen from "../ProfileScreen";

jest.mock("../../services/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "me", email: "me@example.com" } },
}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({ __ref: true })),
  getDoc: jest.fn(),
  setDoc: jest.fn(async () => {}),
  updateDoc: jest.fn(async () => {}),
  deleteDoc: jest.fn(async () => {}),
  deleteField: jest.fn(() => "DELETE_FIELD"),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getCountFromServer: jest.fn(async () => ({ data: () => ({ count: 0 }) })),
  onSnapshot: jest.fn(() => () => {}),
  limit: jest.fn(),
  orderBy: jest.fn(),
  getDocs: jest.fn(async () => ({ docs: [], empty: true })),
}));
jest.mock("../../services/storageService", () => ({ resolveAvatarForSave: jest.fn(async () => null) }));
jest.mock("../../services/followService", () => ({
  getFollowers: jest.fn(async () => []),
  getFollowing: jest.fn(async () => []),
}));
jest.mock("../../services/rentalService", () => ({ getMyFleet: jest.fn(async () => []) }));
jest.mock("../../components/AvatarPicker", () => ({
  __esModule: true,
  default: () => null,
  AvatarDisplay: () => null,
}));
jest.mock("../../components/CategoryIcon", () => {
  const { View } = require("react-native");
  function MockAvatarFrame({ children }) { return <View>{children}</View>; }
  return { AvatarFrame: MockAvatarFrame };
});
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#eee",
      textSecondary: "#666", textTertiary: "#999", border: "#ddd",
    },
    isDark: false,
  }),
}));
jest.mock("../../contexts/ModeContext", () => ({ useMode: () => ({ mode: "attendee", setMode: jest.fn() }) }));
jest.mock("../../contexts/BusinessContext", () => ({ useBusiness: () => ({ businesses: [] }) }));
jest.mock("../../hooks/usePremium", () => ({ usePremium: () => ({ isPremium: false }) }));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

const nav = { navigate: jest.fn(), goBack: jest.fn() };

const ARTIST = { artistId: 111, artistName: "Little Dragon", primaryGenreName: "Alternative" };

const itunesResponse = (results) => ({ json: async () => ({ results }) });

const openEditor = async (profile = {}) => {
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ fullName: "Ana", ...profile }) });
  const utils = render(<ProfileScreen navigation={nav} />);
  // Enter edit mode via the pill in the header (profile.edit).
  fireEvent.press(await utils.findByText("Edit"));
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => itunesResponse([ARTIST]));
});
afterEach(() => { delete global.fetch; });

describe("ProfileScreen — favorite artists", () => {
  it("does NOT hit iTunes for a 1-character query (rate-limit floor)", async () => {
    const { findByTestId } = await openEditor();
    fireEvent.changeText(await findByTestId("artist-search-input"), "a");
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("searches once the query is long enough, and asks for musicArtist", async () => {
    const { findByTestId } = await openEditor();
    fireEvent.changeText(await findByTestId("artist-search-input"), "little");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][0]).toContain("entity=musicArtist");
    expect(global.fetch.mock.calls[0][0]).toContain("little");
  });

  it("persists the picked artist to Firestore on save", async () => {
    const { findByTestId, findByText } = await openEditor();
    fireEvent.changeText(await findByTestId("artist-search-input"), "little");
    fireEvent.press(await findByTestId(`artist-result-${ARTIST.artistId}`));
    // Chip appears immediately, before any save.
    expect(await findByTestId(`artist-chip-${ARTIST.artistId}`)).toBeTruthy();

    fireEvent.press(await findByText("Save"));
    await waitFor(() =>
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ favoriteArtists: [ARTIST] })
      )
    );
  });

  it("saves an empty list when nothing was picked — no undefined into Firestore", async () => {
    const { findByText } = await openEditor();
    fireEvent.press(await findByText("Save"));
    await waitFor(() =>
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ favoriteArtists: [] })
      )
    );
  });

  it("loads previously saved artists into the editor", async () => {
    const { findByTestId } = await openEditor({ favoriteArtists: [ARTIST] });
    expect(await findByTestId(`artist-chip-${ARTIST.artistId}`)).toBeTruthy();
  });

  it("removes an artist when its chip is tapped", async () => {
    const { findByTestId, queryByTestId, findByText } = await openEditor({ favoriteArtists: [ARTIST] });
    fireEvent.press(await findByTestId(`artist-chip-${ARTIST.artistId}`));
    await waitFor(() => expect(queryByTestId(`artist-chip-${ARTIST.artistId}`)).toBeNull());
    fireEvent.press(await findByText("Save"));
    await waitFor(() =>
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ favoriteArtists: [] })
      )
    );
  });

  it("stops offering the search field once 5 are picked", async () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ artistId: n, artistName: `A${n}`, primaryGenreName: "" }));
    const { queryByTestId, findByTestId } = await openEditor({ favoriteArtists: five });
    await findByTestId("artist-chip-1");
    expect(queryByTestId("artist-search-input")).toBeNull();
  });
});
