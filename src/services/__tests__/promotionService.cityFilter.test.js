/**
 * KIN-219 — the city filter that made a paid promotion invisible.
 *
 * The two sides of the comparison were never the same kind of string. An event
 * or listing stores `city` as a normalized lowercase slug ("tulum"); the
 * viewer's city comes from HomeScreen as `user?.city || user?.location`, and
 * `location` is free-text profile input ("Tulum"). A strict `===` dropped every
 * result, and did it silently — both functions swallow into console.error and
 * the carousels render null rather than an empty state, so there was nothing on
 * screen to suggest a filter had eaten the data.
 *
 * That is not hypothetical: payment pi_3U3TqARZsYFCeXAc0BxkLiX7 ($99 MXN,
 * succeeded) featured events/OS6Ak2JZJAdVk5pVpeB4 with city "tulum" while the
 * buyer's profile carried location "Tulum". The webhook was correct end to end
 * — payments doc written, featured/featuredTier/featuredUntil all set — and the
 * event still never appeared. The last test here is that exact pair.
 *
 * Every case runs against BOTH functions: they had the same bug written twice,
 * and a fix applied to one is how it comes back.
 */
import { getFeaturedEventsNearby, getFeaturedListings } from "../promotionService";
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

/** An events doc as fetchFeaturedEventDocs receives it (still featured, upcoming). */
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

/** A sessionType doc as the collectionGroup query returns it. */
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

/**
 * Run one city scenario through both functions.
 * @param {Array<string|undefined>} cities city per seeded doc (undefined = no field)
 * @param {string|undefined} userCity the viewer's city
 * @returns {Promise<{events: string[], listings: string[]}>} surviving ids
 */
const bothWith = async (cities, userCity) => {
  getDocs.mockResolvedValueOnce({ docs: cities.map((c, i) => eventDoc(`e${i}`, c)) });
  const events = await getFeaturedEventsNearby({ city: userCity });

  getDocs.mockResolvedValueOnce({ docs: cities.map((c, i) => listingDoc(`e${i}`, c)) });
  const listings = await getFeaturedListings({ city: userCity });

  return { events: events.map((e) => e.id), listings: listings.map((l) => l.id) };
};

beforeEach(() => jest.clearAllMocks());

describe("(a) same city, different capitalization — the bug in this ticket", () => {
  it("matches in both functions", async () => {
    const { events, listings } = await bothWith(["tulum"], "Tulum");
    expect(events).toEqual(["e0"]);
    expect(listings).toEqual(["e0"]);
  });

  it("matches whichever side is the shouty one", async () => {
    // The doc is normally the lowercase side, but nothing guarantees it.
    const { events, listings } = await bothWith(["TULUM"], "tulum");
    expect(events).toEqual(["e0"]);
    expect(listings).toEqual(["e0"]);
  });
});

describe("(b) stray whitespace", () => {
  it("matches with padding on either side, in both functions", async () => {
    const { events, listings } = await bothWith(["  tulum "], "Tulum  ");
    expect(events).toEqual(["e0"]);
    expect(listings).toEqual(["e0"]);
  });
});

describe("(c) the doc has no city", () => {
  it("matches any viewer city, in both functions", async () => {
    // Pre-existing rule, preserved: never hide something for missing data.
    const { events, listings } = await bothWith([undefined], "Tulum");
    expect(events).toEqual(["e0"]);
    expect(listings).toEqual(["e0"]);
  });

  it("an empty-string city is treated as missing, not as a city", async () => {
    const { events, listings } = await bothWith([""], "Tulum");
    expect(events).toEqual(["e0"]);
    expect(listings).toEqual(["e0"]);
  });
});

describe("(d) the viewer passes no city", () => {
  it("does not filter at all, in both functions", async () => {
    const { events, listings } = await bothWith(["tulum", "cancun", undefined], undefined);
    expect(events).toEqual(["e0", "e1", "e2"]);
    expect(listings.sort()).toEqual(["e0", "e1", "e2"]);
  });

  it("a blank city string is not a filter either", async () => {
    // userCity comes from free-text profile input; "   " must not hide the world.
    const { events, listings } = await bothWith(["tulum", "cancun"], "   ");
    expect(events).toEqual(["e0", "e1"]);
    expect(listings.sort()).toEqual(["e0", "e1"]);
  });
});

describe("(e) genuinely different cities", () => {
  it("still does not match, in both functions", async () => {
    const { events, listings } = await bothWith(["cancun"], "Tulum");
    expect(events).toEqual([]);
    expect(listings).toEqual([]);
  });

  it("keeps only the right city out of a mixed set", async () => {
    // The filter must stay a filter — case-insensitivity is not "match anything".
    const { events, listings } = await bothWith(["cancun", "Tulum", "merida"], "tulum");
    expect(events).toEqual(["e1"]);
    expect(listings).toEqual(["e1"]);
  });

  it("does not match on a prefix or substring", async () => {
    const { events, listings } = await bothWith(["tulum norte"], "Tulum");
    expect(events).toEqual([]);
    expect(listings).toEqual([]);
  });

  it("accents still matter — deliberately not folded", async () => {
    // Documented non-goal: there's no evidence yet that slugs carry accents,
    // and folding them would be a guess. If this ever flips, it flips here.
    const { events, listings } = await bothWith(["cancun"], "Cancún");
    expect(events).toEqual([]);
    expect(listings).toEqual([]);
  });
});

describe("the real case from KIN-219", () => {
  it("events/OS6Ak2JZJAdVk5pVpeB4 now reaches a viewer whose profile says 'Tulum'", async () => {
    // Exactly the pair from production: the doc's normalized slug vs the
    // free-text location on the buyer's profile.
    getDocs.mockResolvedValueOnce({
      docs: [eventDoc("OS6Ak2JZJAdVk5pVpeB4", "tulum")],
    });
    const out = await getFeaturedEventsNearby({ city: "Tulum" });
    expect(out.map((e) => e.id)).toEqual(["OS6Ak2JZJAdVk5pVpeB4"]);
  });
});
