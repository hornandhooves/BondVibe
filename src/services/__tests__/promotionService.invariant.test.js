/**
 * KIN-221 — two invariants about paid promotions.
 *
 * (a) POSITIVE: a doc that meets every eligibility rule ALWAYS comes back.
 *     Nothing in this codebase tied "the host paid" to "the thing is visible";
 *     KIN-219 was a filter quietly eating eligible docs, and no test noticed
 *     because every test asserted a specific filter rather than the guarantee.
 *
 * (b) NON-SILENT FAILURE: when the read rejects, these functions must REJECT.
 *     They used to catch, console.error into a phone, and return [] — which
 *     made a broken query indistinguishable from "nothing is featured". That
 *     is the reason a $99 promotion (pi_3U3TqARZsYFCeXAc0BxkLiX7) was
 *     invisible for days with no trace anywhere. Silencing the error is now a
 *     test failure, not a style choice.
 *
 * Both invariants run against all three functions. The two carousels had the
 * same swallow written twice; a guarantee that only holds for one of them is
 * how it comes back.
 */
import {
  getFeaturedEvents,
  getFeaturedEventsNearby,
  getFeaturedListings,
} from "../promotionService";
import { getDocs } from "firebase/firestore";

jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  collectionGroup: jest.fn(() => "SESSION_TYPES_CG"),
  query: jest.fn((...args) => ({ __q: args })),
  where: jest.fn((f, op, v) => ({ __w: [f, op, v] })),
  orderBy: jest.fn(),
  limit: jest.fn((n) => ({ __limit: n })),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  doc: jest.fn(),
  Timestamp: { now: jest.fn(() => ({ toMillis: () => Date.now() })) },
}));

const DAY = 24 * 60 * 60 * 1000;
const ts = (ms) => ({ toMillis: () => ms });
const future = () => ts(Date.now() + 7 * DAY);

/**
 * An events doc that meets EVERY eligibility rule: promotion still open,
 * not cancelled, start date ahead. Declared locally on purpose — the ticket
 * asks not to hoist a shared helper out of the cityFilter suite in this PR.
 * @param {string} id doc id
 * @param {string|undefined} city city slug, or undefined for no field
 * @returns {object} a doc snapshot shape
 */
const eventDoc = (id, city) => ({
  id,
  data: () => ({
    title: id,
    status: "active",
    date: new Date(Date.now() + 3 * DAY).toISOString(),
    featuredUntil: future(),
    ...(city === undefined ? {} : { city }),
  }),
});

/**
 * A sessionType doc as the collectionGroup query returns it, eligible.
 * @param {string} id doc id
 * @param {string|undefined} city city slug, or undefined for no field
 * @returns {object} a doc snapshot shape
 */
const listingDoc = (id, city) => ({
  id,
  ref: { parent: { parent: { id: `biz_${id}` } } },
  data: () => ({
    name: id,
    publicListing: true,
    featuredUntil: future(),
    ...(city === undefined ? {} : { city }),
  }),
});

beforeEach(() => jest.clearAllMocks());

describe("(a) an eligible paid promotion is always visible", () => {
  it("getFeaturedEvents returns it", async () => {
    getDocs.mockResolvedValueOnce({ docs: [eventDoc("paid", "tulum")] });
    expect((await getFeaturedEvents(10)).map((e) => e.id)).toEqual(["paid"]);
  });

  it("getFeaturedEventsNearby returns it when the city matches", async () => {
    getDocs.mockResolvedValueOnce({ docs: [eventDoc("paid", "tulum")] });
    const out = await getFeaturedEventsNearby({ city: "tulum" });
    expect(out.map((e) => e.id)).toEqual(["paid"]);
  });

  it("getFeaturedEventsNearby returns it with no city filter at all", async () => {
    getDocs.mockResolvedValueOnce({ docs: [eventDoc("paid", "tulum")] });
    expect((await getFeaturedEventsNearby({})).map((e) => e.id)).toEqual(["paid"]);
  });

  it("getFeaturedListings returns it", async () => {
    getDocs.mockResolvedValueOnce({ docs: [listingDoc("paid", "tulum")] });
    const out = await getFeaturedListings({ city: "tulum" });
    expect(out.map((l) => l.id)).toEqual(["paid"]);
  });

  it("an eligible doc with NO city survives every caller shape", async () => {
    // Missing data must never hide something someone paid for.
    getDocs.mockResolvedValueOnce({ docs: [eventDoc("paid", undefined)] });
    expect((await getFeaturedEventsNearby({ city: "tulum" }))).toHaveLength(1);
    getDocs.mockResolvedValueOnce({ docs: [listingDoc("paid", undefined)] });
    expect((await getFeaturedListings({ city: "tulum" }))).toHaveLength(1);
  });
});

describe("(b) a failed read is never disguised as an empty result", () => {
  // The heart of KIN-221. If any of these ever resolves to [] again, the
  // carousel goes back to rendering nothing while the error dies on the device.
  const boom = () => new Error("permission-denied");

  it("getFeaturedEvents rejects instead of returning []", async () => {
    getDocs.mockRejectedValueOnce(boom());
    await expect(getFeaturedEvents(10)).rejects.toThrow("permission-denied");
  });

  it("getFeaturedEventsNearby rejects instead of returning []", async () => {
    getDocs.mockRejectedValueOnce(boom());
    await expect(getFeaturedEventsNearby({ city: "tulum" })).rejects.toThrow(
      "permission-denied"
    );
  });

  it("getFeaturedListings rejects instead of returning []", async () => {
    getDocs.mockRejectedValueOnce(boom());
    await expect(getFeaturedListings({ city: "tulum" })).rejects.toThrow(
      "permission-denied"
    );
  });

  it("none of them resolves at all on failure", async () => {
    // Stated separately from the rejects assertions above: the failure mode
    // being closed is "resolved successfully with an empty array", which a
    // .rejects matcher alone doesn't spell out.
    for (const call of [
      () => getFeaturedEvents(10),
      () => getFeaturedEventsNearby({ city: "tulum" }),
      () => getFeaturedListings({ city: "tulum" }),
    ]) {
      getDocs.mockRejectedValueOnce(boom());
      let resolvedWith = "DID_NOT_RESOLVE";
      try {
        resolvedWith = await call();
      } catch (_e) {
        // expected — the point is that we never got past the await
      }
      expect(resolvedWith).toBe("DID_NOT_RESOLVE");
    }
  });
});
