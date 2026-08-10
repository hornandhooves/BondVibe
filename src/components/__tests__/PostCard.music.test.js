/**
 * KIN-201 — the song chip on a feed card.
 *
 * The tap MUST leave the app: there is no embedded player, by design (an audio
 * library is a native dependency, and Apple's terms forbid caching the preview).
 * So "openURL is called with trackViewUrl" is the behavioural contract, and the
 * absence of any playback attempt is asserted rather than assumed.
 *
 * Backcompat matters as much: every post written before this field exists has no
 * `music` at all, and must render exactly as it did.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import PostCard from "../PostCard";

jest.mock("../../services/firebase", () => ({ auth: { currentUser: { uid: "me" } } }));
jest.mock("../../services/postService", () => ({
  hasLiked: jest.fn(async () => false),
  likePost: jest.fn(),
  unlikePost: jest.fn(),
  deletePost: jest.fn(),
  recordPostEvent: jest.fn(),
  getPostStats: jest.fn(async () => null),
}));
jest.mock("../../services/blockService", () => ({ blockUser: jest.fn() }));
jest.mock("../../hooks/useEntitlement", () => ({ useSubscriptions: () => ({ isPro: false }) }));
jest.mock("../AvatarPicker", () => ({ AvatarDisplay: () => null }));
jest.mock("../MentionText", () => "MentionText");
jest.mock("../Icon", () => "Icon");
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#eee",
      textSecondary: "#666", textTertiary: "#999", border: "#ddd", card: "#fff",
    },
    isDark: false,
  }),
}));

const MUSIC = {
  trackId: 258618600,
  trackName: "Test",
  artistName: "Little Dragon",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  artworkUrl100: "https://is1-ssl.mzstatic.com/art100x100.jpg",
  trackViewUrl: "https://music.apple.com/us/album/test/258615649?i=258618600&uo=4",
};

const basePost = { id: "p1", authorId: "friend", authorName: "Ana", text: "listen", likeCount: 0, commentCount: 0 };

const renderCard = (post) => render(<PostCard post={post} navigation={{ navigate: jest.fn() }} />);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});
afterEach(() => Linking.openURL.mockRestore());

describe("PostCard — attached song", () => {
  it("shows the track, the artist and the required iTunes attribution", async () => {
    const { findByText } = renderCard({ ...basePost, music: MUSIC });
    expect(await findByText("Test")).toBeTruthy();
    expect(await findByText("Little Dragon")).toBeTruthy();
    expect(await findByText("Music courtesy of iTunes")).toBeTruthy();
  });

  it("opens Apple Music externally with trackViewUrl on tap", async () => {
    const { findByTestId } = renderCard({ ...basePost, music: MUSIC });
    fireEvent.press(await findByTestId("post-music"));
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith(MUSIC.trackViewUrl);
  });

  it("never opens or fetches previewUrl — the audio is never touched", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ json: async () => ({}) });
    const { findByTestId } = renderCard({ ...basePost, music: MUSIC });
    fireEvent.press(await findByTestId("post-music"));
    expect(Linking.openURL).not.toHaveBeenCalledWith(MUSIC.previewUrl);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("renders nothing musical for an old post with no music field", async () => {
    const { queryByTestId, findByText } = renderCard(basePost);
    await findByText("Ana"); // card rendered
    expect(queryByTestId("post-music")).toBeNull();
  });

  it("shows the song alongside photos, not instead of them", async () => {
    const { findByTestId } = renderCard({
      ...basePost,
      mediaUrls: ["https://example.com/a.jpg"],
      mediaType: "photo",
      music: MUSIC,
    });
    expect(await findByTestId("post-music")).toBeTruthy();
  });
});
