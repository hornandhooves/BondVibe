import {
  FUNNY_TAGS,
  FUNNY_TAG_IDS,
  funnyTag,
  INTERESTS,
  GROUP_PREFS,
  DEFAULT_ENERGY,
  isProfileComplete,
  sanitizeIds,
} from "../matchTags";

describe("matchTags catalog", () => {
  it("every funny tag has an id, a Kinlo icon name, and a match-type accent", () => {
    const types = new Set(["friend", "professional", "romantic", "brand"]);
    FUNNY_TAGS.forEach((t) => {
      expect(typeof t.id).toBe("string");
      expect(typeof t.icon).toBe("string");
      expect(t.icon.length).toBeGreaterThan(0);
      expect(types.has(t.type)).toBe(true);
    });
  });
  it("funny tag ids are unique", () => {
    expect(new Set(FUNNY_TAG_IDS).size).toBe(FUNNY_TAG_IDS.length);
  });
  it("funnyTag() resolves a known id and returns null for unknown", () => {
    expect(funnyTag("coffee_addict")?.icon).toBe("coffee");
    expect(funnyTag("nope")).toBeNull();
  });
});

describe("isProfileComplete (the v2 gate)", () => {
  const BF = { OPENNESS: 50, CONSCIENTIOUSNESS: 50, EXTRAVERSION: 50, AGREEABLENESS: 50, NEUROTICISM: 50 };
  const full = {
    lookingFor: ["friend"],
    interests: ["music", "travel", "food"],
    funnyTags: ["coffee_addict"],
    energy: { ...DEFAULT_ENERGY },
    groupPref: "small_group",
    personality: BF,
  };
  it("accepts a fully-filled profile", () => {
    expect(isProfileComplete(full)).toBe(true);
  });
  it("requires the Big Five personality (now part of the unified profile)", () => {
    expect(isProfileComplete({ ...full, personality: null })).toBe(false);
    expect(isProfileComplete({ ...full, personality: undefined })).toBe(false);
  });
  it("rejects null / empty", () => {
    expect(isProfileComplete()).toBe(false);
    expect(isProfileComplete({})).toBe(false);
  });
  it("requires ≥1 lookingFor", () => {
    expect(isProfileComplete({ ...full, lookingFor: [] })).toBe(false);
  });
  it("requires ≥3 interests", () => {
    expect(isProfileComplete({ ...full, interests: ["music", "travel"] })).toBe(false);
  });
  it("requires ≥1 funny tag", () => {
    expect(isProfileComplete({ ...full, funnyTags: [] })).toBe(false);
  });
  it("requires both energy axes as numbers", () => {
    expect(isProfileComplete({ ...full, energy: { adventure: 50 } })).toBe(false);
    expect(isProfileComplete({ ...full, energy: null })).toBe(false);
  });
  it("requires a valid groupPref", () => {
    expect(isProfileComplete({ ...full, groupPref: "solo" })).toBe(false);
    expect(GROUP_PREFS).toContain(full.groupPref);
  });
});

describe("sanitizeIds", () => {
  it("keeps only catalog ids, unique", () => {
    expect(sanitizeIds(["music", "music", "xx", "food"], INTERESTS)).toEqual(["music", "food"]);
    expect(sanitizeIds(null, INTERESTS)).toEqual([]);
  });
});
