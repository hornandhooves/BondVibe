/**
 * businessSessionsService — marketplace field shaping (Services).
 *
 * A "service" is a public SessionType. These tests pin how createSessionType /
 * updateSessionType SHAPE the persisted doc, with the focus on the quote/price
 * fix: a quote-mode listing must NEVER persist a stale priceCents — the price
 * input is hidden for quotes, so any leftover value from a slot draft has to be
 * zeroed at the service layer (the server is the guarantee, not the screen).
 * Also covers the enum sanitizers and per-vertical intake schema.
 */

// Importing the service pulls in ./firebase (Expo/Firebase init) + a web of
// sibling services — stub them all so the module loads in isolation under jest.
jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));
jest.mock("../businessService", () => ({ getMyBizId: () => "biz1" }));
jest.mock("../businessMembersService", () => ({ getMember: jest.fn() }));
jest.mock("../businessPackagesService", () => ({ adjustCredits: jest.fn() }));
jest.mock("../businessPaymentsService", () => ({ createPayment: jest.fn() }));
jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn()),
}));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  addDoc: jest.fn(() => Promise.resolve({ id: "st1" })),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => "ts"),
}));

import {
  createSessionType,
  updateSessionType,
  cleanBookingMode,
  cleanLocationMode,
  fieldsSchemaFor,
  capacityKind,
} from "../businessSessionsService";
import { updateDoc } from "firebase/firestore";

beforeEach(() => jest.clearAllMocks());

// ── The fix: quote listings never persist a stale priceCents ─────────────────
describe("createSessionType — quote/price shaping", () => {
  it("a QUOTE listing zeroes priceCents even when a price is supplied", async () => {
    const r = await createSessionType({ name: "Deep-tissue", bookingMode: "quote", price: "900", vertical: "wellness", publicListing: true });
    expect(r.priceCents).toBe(0);
    expect(r.bookingMode).toBe("quote");
  });

  it("a SLOT listing keeps the price (dollars → centavos)", async () => {
    const r = await createSessionType({ name: "Massage", bookingMode: "slot", price: "900" });
    expect(r.priceCents).toBe(90000);
    expect(r.bookingMode).toBe("slot");
  });

  it("a SLOT listing with no price is 0 (not NaN)", async () => {
    const r = await createSessionType({ name: "Consult", bookingMode: "slot", price: "" });
    expect(r.priceCents).toBe(0);
  });

  it("an unspecified bookingMode defaults to slot and keeps the price", async () => {
    const r = await createSessionType({ name: "Class", price: "50" });
    expect(r.bookingMode).toBe("slot");
    expect(r.priceCents).toBe(5000);
  });
});

describe("updateSessionType — quote/price shaping", () => {
  it("patching to QUOTE zeroes priceCents even alongside a price", async () => {
    await updateSessionType("st1", { bookingMode: "quote", price: "900" });
    expect(updateDoc.mock.calls[0][1].priceCents).toBe(0);
    expect(updateDoc.mock.calls[0][1].bookingMode).toBe("quote");
    expect(updateDoc.mock.calls[0][1].price).toBeUndefined();
  });

  it("patching to SLOT with a price computes centavos", async () => {
    await updateSessionType("st1", { bookingMode: "slot", price: "380" });
    expect(updateDoc.mock.calls[0][1].priceCents).toBe(38000);
  });

  it("patching price alone (no bookingMode) computes centavos and drops price", async () => {
    await updateSessionType("st1", { price: "30" });
    const clean = updateDoc.mock.calls[0][1];
    expect(clean.priceCents).toBe(3000);
    expect(clean.price).toBeUndefined();
  });
});

// ── Public-listing + enum + intake shaping ───────────────────────────────────
describe("createSessionType — publicListing + fields", () => {
  it("publishing sets publicListing:true and carries the vertical", async () => {
    const r = await createSessionType({ name: "Nails", vertical: "beauty", publicListing: true, bookingMode: "slot", price: "10" });
    expect(r.publicListing).toBe(true);
    expect(r.vertical).toBe("beauty");
  });

  it("publicListing coerces to false for a private session (not === true)", async () => {
    const r = await createSessionType({ name: "1:1" });
    expect(r.publicListing).toBe(false);
    expect(r.vertical).toBeNull();
  });

  it("an invalid locationMode falls back to at_business", async () => {
    const r = await createSessionType({ name: "x", locationMode: "on_mars" });
    expect(r.locationMode).toBe("at_business");
  });

  it("home listings carry the home intake schema; wellness carries none", async () => {
    const home = await createSessionType({ name: "Plumb", vertical: "home" });
    expect(home.fieldsSchema).toEqual(["address", "photos", "window"]);
    const wellness = await createSessionType({ name: "Yoga", vertical: "wellness" });
    expect(wellness.fieldsSchema).toEqual([]);
  });

  it("photos default to an empty array; capacityMax is at least 1", async () => {
    const r = await createSessionType({ name: "x", capacityMax: 0, photos: "nope" });
    expect(r.photos).toEqual([]);
    expect(r.capacityMax).toBe(1);
  });

  it("an empty city persists as null (never an empty string)", async () => {
    const r = await createSessionType({ name: "x", city: "   " });
    expect(r.city).toBeNull();
  });
});

// ── Pure sanitizers / helpers ────────────────────────────────────────────────
describe("field sanitizers", () => {
  it("cleanBookingMode only allows slot|quote", () => {
    expect(cleanBookingMode("quote")).toBe("quote");
    expect(cleanBookingMode("slot")).toBe("slot");
    expect(cleanBookingMode("weird")).toBe("slot");
    expect(cleanBookingMode(undefined)).toBe("slot");
  });

  it("cleanLocationMode only allows the three known modes", () => {
    expect(cleanLocationMode("at_customer")).toBe("at_customer");
    expect(cleanLocationMode("online")).toBe("online");
    expect(cleanLocationMode("bogus")).toBe("at_business");
  });

  it("fieldsSchemaFor is per-vertical", () => {
    expect(fieldsSchemaFor("home")).toEqual(["address", "photos", "window"]);
    expect(fieldsSchemaFor("auto")).toEqual(["vehicle", "symptom"]);
    expect(fieldsSchemaFor("beauty")).toEqual([]);
  });

  it("capacityKind maps 1/2/3+ to one/couple/group", () => {
    expect(capacityKind(1)).toBe("one");
    expect(capacityKind(2)).toBe("couple");
    expect(capacityKind(8)).toBe("group");
  });
});
