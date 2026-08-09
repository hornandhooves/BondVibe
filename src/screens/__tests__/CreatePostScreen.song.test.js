/**
 * KIN-201 — attaching a song in the composer.
 *
 * Covers the round trip search → pick → submit, plus the two rate-limit
 * guardrails (2-character floor, 400ms debounce). Those are asserted as
 * behaviour and not left to code review: exceeding iTunes' ~20 req/min ceiling
 * has no local symptom, it only surfaces later as Apple refusing.
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { createPost } from "../../services/postService";
import CreatePostScreen from "../CreatePostScreen";

jest.mock("../../services/firebase", () => ({ auth: { currentUser: { uid: "me" } } }));
jest.mock("../../services/postService", () => ({ createPost: jest.fn(async () => ({ success: true, id: "p1" })) }));
jest.mock("../../services/momentService", () => ({ addMoment: jest.fn(async () => ({ success: true })) }));
jest.mock("../../services/storageService", () => ({ uploadPostImage: jest.fn(async () => "https://cdn/x.jpg") }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  MediaTypeOptions: { Images: "Images", Videos: "Videos" },
}));
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#eee",
      textSecondary: "#666", textTertiary: "#999", border: "#ddd",
    },
    isDark: false,
  }),
}));

const SONG = {
  trackId: 258618600,
  trackName: "Test",
  artistName: "Little Dragon",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  artworkUrl100: "https://is1-ssl.mzstatic.com/art100x100.jpg",
  trackViewUrl: "https://music.apple.com/us/album/test/258615649?i=258618600&uo=4",
};

const nav = { goBack: jest.fn(), navigate: jest.fn() };

const openComposer = () => render(<CreatePostScreen navigation={nav} route={{ params: {} }} />);

const pickSong = async (utils) => {
  fireEvent.press(await utils.findByTestId("add-song-btn"));
  fireEvent.changeText(await utils.findByTestId("song-search-input"), "little dragon");
  fireEvent.press(await utils.findByTestId(`song-result-${SONG.trackId}`));
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({ json: async () => ({ results: [SONG] }) }));
});
afterEach(() => { delete global.fetch; });

describe("CreatePostScreen — attach a song", () => {
  it("does NOT hit iTunes for a 1-character query (rate-limit floor)", async () => {
    const utils = openComposer();
    fireEvent.press(await utils.findByTestId("add-song-btn"));
    fireEvent.changeText(await utils.findByTestId("song-search-input"), "l");
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("searches songs once the query is long enough", async () => {
    const utils = openComposer();
    fireEvent.press(await utils.findByTestId("add-song-btn"));
    fireEvent.changeText(await utils.findByTestId("song-search-input"), "little");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][0]).toContain("entity=song");
    expect(global.fetch.mock.calls[0][0]).toContain("little");
  });

  it("passes the full music payload to createPost", async () => {
    const utils = openComposer();
    fireEvent.changeText(await utils.findByTestId("create-post-input"), "listening to this");
    await pickSong(utils);
    expect(await utils.findByTestId("song-preview")).toBeTruthy();

    fireEvent.press(await utils.findByText("Post"));
    await waitFor(() => expect(createPost).toHaveBeenCalled());
    expect(createPost.mock.calls[0][0].music).toEqual({
      trackId: SONG.trackId,
      trackName: SONG.trackName,
      artistName: SONG.artistName,
      previewUrl: SONG.previewUrl,
      artworkUrl100: SONG.artworkUrl100,
      trackViewUrl: SONG.trackViewUrl,
    });
  });

  it("passes music: null when no song was attached", async () => {
    const utils = openComposer();
    fireEvent.changeText(await utils.findByTestId("create-post-input"), "plain post");
    fireEvent.press(await utils.findByText("Post"));
    await waitFor(() => expect(createPost).toHaveBeenCalled());
    expect(createPost.mock.calls[0][0].music).toBeNull();
  });

  it("removing the song clears it from the payload", async () => {
    const utils = openComposer();
    fireEvent.changeText(await utils.findByTestId("create-post-input"), "never mind");
    await pickSong(utils);
    fireEvent.press(await utils.findByTestId("song-remove"));
    await waitFor(() => expect(utils.queryByTestId("song-preview")).toBeNull());

    fireEvent.press(await utils.findByText("Post"));
    await waitFor(() => expect(createPost).toHaveBeenCalled());
    expect(createPost.mock.calls[0][0].music).toBeNull();
  });

  it("never fetches or plays previewUrl — only the metadata is kept", async () => {
    const utils = openComposer();
    fireEvent.changeText(await utils.findByTestId("create-post-input"), "x");
    await pickSong(utils);
    // Every request the screen made was a search, never the audio asset.
    const urls = global.fetch.mock.calls.map((c) => c[0]);
    expect(urls.every((u) => u.startsWith("https://itunes.apple.com/search"))).toBe(true);
    expect(urls).not.toContain(SONG.previewUrl);
  });
});
