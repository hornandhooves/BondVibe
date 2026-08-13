/**
 * KIN-185 — the shared featured catalog + Featured Services listing.
 *
 * The catalog tests care about ONE thing: a bad or absent config/featuredPricing
 * must never produce a free or nonsensical promotion. The listing tests pin the
 * two rules that aren't obvious from reading the query — publicListing has to be
 * in the Firestore query (the collectionGroup rule authorizes exactly that
 * predicate, so dropping it denies the whole read), and featuredUntil/city are
 * filtered client-side.
 */
import { getFeaturedPlans, getFeaturedListings, PROMOTION_PLANS } from "../promotionService";
import { getDoc, getDocs, where } from "firebase/firestore";

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

const ts = (ms) => ({ toMillis: () => ms });
const DAY = 24 * 60 * 60 * 1000;

/** A sessionType doc as the collectionGroup query returns it. */
const listingDoc = (id, bizId, data) => ({
  id,
  ref: { parent: { parent: { id: bizId } } },
  data: () => data,
});

beforeEach(() => jest.clearAllMocks());

describe("getFeaturedPlans — the shared catalog", () => {
  it("falls back to the bundled ladder when config/featuredPricing is missing", async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    const plans = await getFeaturedPlans();
    expect(plans.map((p) => p.priceCentavos)).toEqual([9900, 17900, 29900]);
    expect(plans.map((p) => p.days)).toEqual([7, 14, 30]);
  });

  it("applies admin overrides from config/featuredPricing", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ feat_7: { priceCentavos: 12900 }, feat_30: { days: 45 } }),
    });
    const plans = await getFeaturedPlans();
    expect(plans.find((p) => p.id === "feat_7").priceCentavos).toBe(12900);
    // Untouched fields keep the default — an override is per-field, not per-plan.
    expect(plans.find((p) => p.id === "feat_7").days).toBe(7);
    const feat30 = plans.find((p) => p.id === "feat_30");
    expect(feat30.days).toBe(45);
    // The label is derived from days, so it can't contradict it.
    expect(feat30.label).toBe("45 days");
  });

  it("ignores unusable overrides instead of charging 0 or NaN", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        feat_7: { priceCentavos: 0 },
        feat_14: { priceCentavos: -500 },
        feat_30: { priceCentavos: "gratis", days: null },
      }),
    });
    const plans = await getFeaturedPlans();
    expect(plans.map((p) => p.priceCentavos)).toEqual([9900, 17900, 29900]);
    expect(plans.map((p) => p.days)).toEqual([7, 14, 30]);
  });

  it("degrades to the defaults when the config read throws", async () => {
    getDoc.mockRejectedValue(new Error("offline"));
    const plans = await getFeaturedPlans();
    expect(plans).toEqual(PROMOTION_PLANS);
  });
});

describe("getFeaturedListings", () => {
  it("constrains the query to publicListing==true (the collectionGroup rule needs it)", async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await getFeaturedListings({});
    expect(where).toHaveBeenCalledWith("publicListing", "==", true);
  });

  it("keeps only listings whose featured window is still open", async () => {
    getDocs.mockResolvedValue({
      docs: [
        listingDoc("live", "biz1", { name: "Live", publicListing: true, featuredUntil: ts(Date.now() + DAY) }),
        listingDoc("expired", "biz1", { name: "Expired", publicListing: true, featuredUntil: ts(Date.now() - DAY) }),
        listingDoc("never", "biz1", { name: "Never", publicListing: true }),
      ],
    });
    const rows = await getFeaturedListings({});
    expect(rows.map((r) => r.id)).toEqual(["live"]);
  });

  it("matches a listing with no city against any city, and filters the rest", async () => {
    getDocs.mockResolvedValue({
      docs: [
        listingDoc("here", "biz1", { name: "Here", publicListing: true, city: "oaxaca", featuredUntil: ts(Date.now() + DAY) }),
        listingDoc("elsewhere", "biz1", { name: "Elsewhere", publicListing: true, city: "tulum", featuredUntil: ts(Date.now() + DAY) }),
        listingDoc("nocity", "biz2", { name: "No city", publicListing: true, featuredUntil: ts(Date.now() + DAY) }),
      ],
    });
    const rows = await getFeaturedListings({ city: "oaxaca" });
    expect(rows.map((r) => r.id).sort()).toEqual(["here", "nocity"]);
  });

  it("drops a doc with no resolvable bizId rather than emitting an unopenable card", async () => {
    getDocs.mockResolvedValue({
      docs: [
        { id: "orphan", ref: { parent: { parent: null } }, data: () => ({ name: "Orphan", publicListing: true, featuredUntil: ts(Date.now() + DAY) }) },
      ],
    });
    expect(await getFeaturedListings({})).toEqual([]);
  });

  // KIN-221 flipped this expectation on purpose — see the note in
  // promotionService.invariant.test.js. A swallowed error is indistinguishable
  // from an empty catalog, and that is the bug, not the safety net.
  it("propagates a failed query instead of hiding it as []", async () => {
    getDocs.mockRejectedValue(new Error("permission-denied"));
    await expect(getFeaturedListings({})).rejects.toThrow("permission-denied");
  });

  it("caps at max AFTER the featured filter, not before", async () => {
    const docs = [];
    for (let i = 0; i < 5; i++) {
      docs.push(listingDoc(`exp${i}`, "biz1", { name: `x${i}`, publicListing: true, featuredUntil: ts(Date.now() - DAY) }));
    }
    docs.push(listingDoc("live1", "biz1", { name: "L1", publicListing: true, featuredUntil: ts(Date.now() + DAY) }));
    docs.push(listingDoc("live2", "biz1", { name: "L2", publicListing: true, featuredUntil: ts(Date.now() + 2 * DAY) }));
    getDocs.mockResolvedValue({ docs });
    const rows = await getFeaturedListings({ max: 2 });
    // Both live ones survive; the expired ones never consumed a slot.
    expect(rows.map((r) => r.id)).toEqual(["live2", "live1"]);
  });
});
