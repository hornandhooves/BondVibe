/**
 * KIN-201 — the `music` field on createPost.
 *
 * Two things are worth pinning down: that the attached song reaches the doc
 * intact, and that a post WITHOUT one writes an explicit null. The second is
 * the one that bites — Firestore rejects `undefined` outright (CLAUDE.md §4),
 * so an omitted parameter must not travel as undefined into addDoc.
 */
import { addDoc } from "firebase/firestore";
import { createPost } from "../postService";

jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "me" } } }));
jest.mock("../followService", () => ({ getFollowing: () => Promise.resolve([]) }));
jest.mock("../blockService", () => ({ getBlockedIds: () => Promise.resolve([]) }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  addDoc: jest.fn(() => Promise.resolve({ id: "p1" })),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => "ts"),
  onSnapshot: jest.fn(),
}));

const SONG = {
  trackId: 258618600,
  trackName: "Test",
  artistName: "Little Dragon",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  artworkUrl100: "https://is1-ssl.mzstatic.com/art100x100.jpg",
  trackViewUrl: "https://music.apple.com/us/album/test/258615649?i=258618600&uo=4",
};

const writtenDoc = () => addDoc.mock.calls[0][1];

beforeEach(() => jest.clearAllMocks());

describe("createPost — attached song", () => {
  it("writes the song metadata verbatim", async () => {
    const r = await createPost({ text: "listening to this", music: SONG });
    expect(r.success).toBe(true);
    expect(writtenDoc().music).toEqual(SONG);
  });

  it("writes music: null when no song was attached — never undefined", async () => {
    await createPost({ text: "plain post" });
    const doc = writtenDoc();
    expect(doc.music).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(doc, "music")).toBe(true);
    expect(JSON.stringify(doc)).not.toContain("undefined");
  });

  it("stores previewUrl as a plain URL — no audio is fetched anywhere", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(() => {
      throw new Error("createPost must never download audio (Apple ToS)");
    });
    await createPost({ text: "x", music: SONG });
    expect(writtenDoc().music.previewUrl).toBe(SONG.previewUrl);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
