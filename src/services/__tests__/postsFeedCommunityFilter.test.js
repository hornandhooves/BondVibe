/**
 * fix/posts-query-community-compat — the feed + profile-grid queries must carry
 * where("communityId","==",null) so they stay compatible with the #59 rule
 * (community posts are readable only by members; an unfiltered query would be
 * rejected whole the moment a followed author has a private-community post).
 *
 * We stub the Firestore SDK and assert the query is BUILT with that clause, and
 * that the functions return the personal posts the mock backend yields (no throw)
 * — i.e. a followed author's community post doesn't blow up the feed.
 */
import { getFeed, getUserPosts } from "../postService";

jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "me" } } }));
jest.mock("../followService", () => ({ getFollowing: () => Promise.resolve(["friend"]) }));
jest.mock("../blockService", () => ({ getBlockedIds: () => Promise.resolve([]) }));
jest.mock("../../utils/firestoreClean", () => ({ stripUndefined: (x) => x }));

const whereCalls = [];
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  addDoc: jest.fn(() => Promise.resolve({ id: "p" })),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: jest.fn(() =>
    // The backend only ever returns readable (personal) posts.
    Promise.resolve({ docs: [{ id: "personal1", data: () => ({ authorId: "friend", communityId: null }) }] })
  ),
  query: jest.fn((...args) => ({ args })),
  where: jest.fn((field, op, value) => { whereCalls.push([field, op, value]); return { field, op, value }; }),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => "ts"),
  onSnapshot: jest.fn(),
}));

beforeEach(() => { whereCalls.length = 0; });

const hasCommunityNullClause = () =>
  whereCalls.some(([f, op, v]) => f === "communityId" && op === "==" && v === null);

describe("feed/profile queries are #59-rule compatible", () => {
  it("getFeed filters to personal posts (communityId==null) and doesn't throw", async () => {
    const posts = await getFeed();
    expect(hasCommunityNullClause()).toBe(true);
    // A followed author's private-community post never reaches this list.
    expect(posts.every((p) => p.communityId == null)).toBe(true);
  });

  it("getUserPosts filters the profile grid to personal posts", async () => {
    const posts = await getUserPosts("friend");
    expect(hasCommunityNullClause()).toBe(true);
    expect(posts.every((p) => p.communityId == null)).toBe(true);
  });
});
