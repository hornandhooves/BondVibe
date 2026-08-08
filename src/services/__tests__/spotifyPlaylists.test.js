/**
 * KIN-199 — fetchUserPlaylists.
 *
 * The pagination test is the point of this file: a host with more than 50
 * playlists who can't find theirs in the picker has no way to tell that from a
 * broken feature, so "follows `next`" has to be pinned. The shape test exists
 * because the picker renders these fields directly — a rename in the mapping
 * would render blank rows, not throw.
 */
jest.mock("expo-constants", () => ({
  expoConfig: { extra: { EXPO_PUBLIC_SPOTIFY_CLIENT_ID: "test_client_id" } },
}));
jest.mock("expo-auth-session", () => ({
  makeRedirectUri: () => "kinlo://spotify-auth",
}));
jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: () => "SERVER_TS",
}));

const { fetchUserPlaylists } = require("../spotifyService");

const playlist = (id, over = {}) => ({
  id,
  name: `Playlist ${id}`,
  images: [{ url: `https://big/${id}` }, { url: `https://small/${id}` }],
  tracks: { total: 7 },
  external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
  ...over,
});

const okResponse = (body) => ({ ok: true, json: async () => body });

afterEach(() => { delete global.fetch; });

describe("fetchUserPlaylists", () => {
  it("maps only the fields the picker renders", async () => {
    global.fetch = jest.fn(async () => okResponse({ items: [playlist("abc")], next: null }));
    const [p] = await fetchUserPlaylists("tok");
    expect(p).toEqual({
      id: "abc",
      name: "Playlist abc",
      // Last image = smallest; cheapest thumbnail for a list row.
      imageUrl: "https://small/abc",
      tracksTotal: 7,
      externalUrl: "https://open.spotify.com/playlist/abc",
    });
  });

  it("sends the bearer token", async () => {
    global.fetch = jest.fn(async () => okResponse({ items: [], next: null }));
    await fetchUserPlaylists("tok123");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/me/playlists"),
      { headers: { Authorization: "Bearer tok123" } }
    );
  });

  it("FOLLOWS next until it's null — a host's 60th playlist must still appear", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(okResponse({ items: [playlist("p1")], next: "https://api.spotify.com/page2" }))
      .mockResolvedValueOnce(okResponse({ items: [playlist("p2")], next: null }));
    const rows = await fetchUserPlaylists("tok");
    expect(rows.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenLastCalledWith("https://api.spotify.com/page2", expect.anything());
  });

  it("stops at the page cap instead of looping forever on a bad `next`", async () => {
    global.fetch = jest.fn(async () => okResponse({ items: [playlist("x")], next: "https://api.spotify.com/again" }));
    const rows = await fetchUserPlaylists("tok");
    expect(global.fetch).toHaveBeenCalledTimes(10); // MAX_PLAYLIST_PAGES
    expect(rows).toHaveLength(10);
  });

  it("survives nulls and missing images/tracks rather than crashing the picker", async () => {
    global.fetch = jest.fn(async () =>
      okResponse({
        items: [null, { id: "bare", name: "Bare", external_urls: {} }],
        next: null,
      })
    );
    const rows = await fetchUserPlaylists("tok");
    expect(rows).toEqual([
      { id: "bare", name: "Bare", imageUrl: null, tracksTotal: 0, externalUrl: "" },
    ]);
  });

  it("throws with the HTTP status so the caller can show the real reason", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, text: async () => "" }));
    await expect(fetchUserPlaylists("tok")).rejects.toThrow("Spotify playlists failed: 403");
  });

  it("includes Spotify's own message — a bare 403 hides WHY it was refused", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { status: 403, message: "User not registered in the Developer Dashboard" } }),
    }));
    await expect(fetchUserPlaylists("tok")).rejects.toThrow(
      "Spotify playlists failed: 403 — User not registered in the Developer Dashboard"
    );
  });
});
