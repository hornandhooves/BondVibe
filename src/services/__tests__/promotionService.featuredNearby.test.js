/**
 * KIN-184 — getFeaturedEventsNearby: same eligibility as the existing
 * getFeaturedEvents (used unmodified by MyEventsScreen's "Popular" row),
 * plus a client-side city filter matching getMarketplaceListings's rule —
 * an event with no city matches any city, never hidden just for missing
 * data. No city passed → no filter, same result as getFeaturedEvents.
 */
jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

let mockDocs = [];
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  Timestamp: { now: () => "NOW" },
  getDocs: jest.fn(() =>
    Promise.resolve({ docs: mockDocs.map((d) => ({ id: d.id, data: () => d })) }),
  ),
}));

const { getFeaturedEvents, getFeaturedEventsNearby } = require("../promotionService");

const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  mockDocs = [
    { id: "e1", title: "Tulum Party", city: "tulum", status: "active", date: FUTURE_ISO },
    { id: "e2", title: "CDMX Mixer", city: "cdmx", status: "active", date: FUTURE_ISO },
    { id: "e3", title: "No City Set", city: null, status: "active", date: FUTURE_ISO },
    { id: "e4", title: "Cancelled Tulum Event", city: "tulum", status: "cancelled", date: FUTURE_ISO },
  ];
});

describe("getFeaturedEventsNearby", () => {
  it("with no city, returns everything getFeaturedEvents would (no filter)", async () => {
    const [withCity, noCity] = await Promise.all([
      getFeaturedEventsNearby({}),
      getFeaturedEvents(),
    ]);
    expect(withCity.map((e) => e.id).sort()).toEqual(noCity.map((e) => e.id).sort());
  });

  it("filters to the requested city, but keeps events with no city set", async () => {
    const result = await getFeaturedEventsNearby({ city: "tulum" });
    const ids = result.map((e) => e.id).sort();
    // e1 (tulum) and e3 (no city — matches any city) survive; e2 (cdmx) and
    // e4 (cancelled) do not.
    expect(ids).toEqual(["e1", "e3"]);
  });

  it("drops cancelled events regardless of city filter", async () => {
    const result = await getFeaturedEventsNearby({ city: "tulum" });
    expect(result.some((e) => e.id === "e4")).toBe(false);
  });

  it("respects max after filtering", async () => {
    const result = await getFeaturedEventsNearby({ city: "tulum", max: 1 });
    expect(result.length).toBe(1);
  });

  it("a city with zero explicit matches still surfaces the no-city event (matches any city)", async () => {
    const result = await getFeaturedEventsNearby({ city: "oaxaca" });
    expect(result.map((e) => e.id)).toEqual(["e3"]);
  });
});
