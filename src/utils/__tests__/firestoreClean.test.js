import { arr, stripUndefined } from "../firestoreClean";

describe("arr", () => {
  it("coerces non-arrays to []", () => {
    expect(arr(undefined)).toEqual([]);
    expect(arr(null)).toEqual([]);
    expect(arr("x")).toEqual([]);
    expect(arr(["a"])).toEqual(["a"]);
  });
});

describe("stripUndefined", () => {
  it("drops undefined object keys, keeps null", () => {
    expect(stripUndefined({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
  });

  it("recurses into nested objects", () => {
    expect(stripUndefined({ pro: { role: "x", industry: undefined } })).toEqual({ pro: { role: "x" } });
  });

  it("keeps arrays but nulls undefined items", () => {
    expect(stripUndefined({ tags: ["a", undefined, "b"] })).toEqual({ tags: ["a", null, "b"] });
  });

  it("leaves an empty array as-is (never undefined)", () => {
    expect(stripUndefined({ interests: [] })).toEqual({ interests: [] });
  });

  it("passes Firestore-sentinel-like class instances through untouched", () => {
    class Sentinel {}
    const s = new Sentinel();
    const out = stripUndefined({ ts: s, n: 1 });
    expect(out.ts).toBe(s); // same instance, not cloned/emptied
    expect(out.n).toBe(1);
  });

  it("handles a realistic match-profile payload with missing arrays", () => {
    const payload = {
      interests: undefined,
      funnyTags: ["coffee_addict"],
      energy: { adventure: 50, social: undefined },
      pro: null,
    };
    // arrays coerced by the caller; stripUndefined cleans the rest
    const cleaned = stripUndefined({ ...payload, interests: arr(payload.interests) });
    expect(cleaned).toEqual({
      interests: [],
      funnyTags: ["coffee_addict"],
      energy: { adventure: 50 },
      pro: null,
    });
  });
});
