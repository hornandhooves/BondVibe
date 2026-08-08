/**
 * KIN-199 — the playlist picker component.
 *
 * The contract worth pinning is the boundary: this component hands the caller a
 * plain playlist URL and knows nothing about Firestore. If someone later has it
 * write the group doc itself, `onSelect` stops being the single seam and the
 * "paste manually" fallback and the picker stop sharing one save path.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockPromptAsync = jest.fn();
let mockResponse = null;

jest.mock("expo-auth-session", () => ({
  useAuthRequest: () => [{ codeVerifier: "verifier" }, mockResponse, mockPromptAsync],
  exchangeCodeAsync: jest.fn(async () => ({ accessToken: "tok" })),
  makeRedirectUri: () => "kinlo://spotify-auth",
}));
jest.mock("../../services/spotifyService", () => ({
  SPOTIFY_CLIENT_ID: "cid",
  SPOTIFY_DISCOVERY: {},
  SPOTIFY_GROUP_SCOPES: ["playlist-read-private"],
  SPOTIFY_REDIRECT_URI: "kinlo://spotify-auth",
  isSpotifyConfigured: jest.fn(() => true),
  fetchUserPlaylists: jest.fn(),
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999",
      background: "#fff", border: "#ddd", surfaceGlass: "#eee",
    },
  }),
}));
jest.mock("../Icon", () => "Icon");

const { fetchUserPlaylists, isSpotifyConfigured } = require("../../services/spotifyService");
const ConnectSpotifyPlaylistButton = require("../ConnectSpotifyPlaylistButton").default;

const PLAYLISTS = [
  { id: "p1", name: "Sunset Sessions", imageUrl: null, tracksTotal: 12, externalUrl: "https://open.spotify.com/playlist/p1" },
  { id: "p2", name: "Morning Flow", imageUrl: null, tracksTotal: 30, externalUrl: "https://open.spotify.com/playlist/p2" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockResponse = null;
  isSpotifyConfigured.mockReturnValue(true);
});

describe("ConnectSpotifyPlaylistButton", () => {
  it("renders the connect CTA and starts OAuth when tapped", async () => {
    const { getByTestId } = render(<ConnectSpotifyPlaylistButton onSelect={jest.fn()} />);
    fireEvent.press(getByTestId("spotify-pick-playlist"));
    await waitFor(() => expect(mockPromptAsync).toHaveBeenCalled());
  });

  it("does NOT start OAuth when Spotify isn't configured — it explains instead", async () => {
    isSpotifyConfigured.mockReturnValue(false);
    const { getByTestId, findByText } = render(<ConnectSpotifyPlaylistButton onSelect={jest.fn()} />);
    fireEvent.press(getByTestId("spotify-pick-playlist"));
    expect(mockPromptAsync).not.toHaveBeenCalled();
    expect(await findByText(/isn't set up/i)).toBeTruthy();
  });

  it("lists the playlists after a successful redirect", async () => {
    fetchUserPlaylists.mockResolvedValue(PLAYLISTS);
    mockResponse = { type: "success", params: { code: "abc" } };
    const { findByText } = render(<ConnectSpotifyPlaylistButton onSelect={jest.fn()} />);
    expect(await findByText("Sunset Sessions")).toBeTruthy();
    expect(await findByText("Morning Flow")).toBeTruthy();
  });

  it("hands the chosen playlist's URL to onSelect — and nothing else", async () => {
    fetchUserPlaylists.mockResolvedValue(PLAYLISTS);
    mockResponse = { type: "success", params: { code: "abc" } };
    const onSelect = jest.fn();
    const { findByTestId } = render(<ConnectSpotifyPlaylistButton onSelect={onSelect} />);
    fireEvent.press(await findByTestId("spotify-playlist-p2"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("https://open.spotify.com/playlist/p2");
  });

  it("shows the real failure reason instead of silently doing nothing", async () => {
    fetchUserPlaylists.mockRejectedValue(new Error("Spotify playlists failed: 403"));
    mockResponse = { type: "success", params: { code: "abc" } };
    const { findByText } = render(<ConnectSpotifyPlaylistButton onSelect={jest.fn()} />);
    expect(await findByText(/403/)).toBeTruthy();
  });

  it("says so when the account has no playlists", async () => {
    fetchUserPlaylists.mockResolvedValue([]);
    mockResponse = { type: "success", params: { code: "abc" } };
    const { findByText } = render(<ConnectSpotifyPlaylistButton onSelect={jest.fn()} />);
    expect(await findByText(/No playlists/i)).toBeTruthy();
  });
});
