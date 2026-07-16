import { computeAffinity, jaccard, AFFINITY_WEIGHTS } from "../computeAffinity";

const BF = (o) => ({ OPENNESS: 50, CONSCIENTIOUSNESS: 50, EXTRAVERSION: 50, AGREEABLENESS: 50, NEUROTICISM: 50, ...o });

const rich = (o = {}) => ({
  interests: ["music", "travel", "coffee"],
  funnyTags: ["coffee_addict", "night_owl"],
  lookingFor: ["friend"],
  personality: BF(),
  energy: { adventure: 60, social: 70 },
  groupPref: "small_group",
  ...o,
});

describe("computeAffinity — weights", () => {
  it("social + professional weight sets each sum to 100", () => {
    for (const m of ["social", "professional"]) {
      const total = Object.values(AFFINITY_WEIGHTS[m]).reduce((s, x) => s + x, 0);
      expect(total).toBe(100);
    }
  });
});

describe("jaccard", () => {
  it("computes overlap / union", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard(["a"], ["a"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });
  it("returns null when neither side has data", () => {
    expect(jaccard([], [])).toBeNull();
    expect(jaccard(null, undefined)).toBeNull();
  });
});

describe("computeAffinity — deterministic score from real signals", () => {
  it("is deterministic (same inputs → identical output)", () => {
    const a = rich(), b = rich({ interests: ["music", "art", "coffee"] });
    expect(computeAffinity(a, b)).toEqual(computeAffinity(a, b));
  });

  it("returns a 0–100 integer score when there is enough signal", () => {
    const r = computeAffinity(rich(), rich());
    expect(r.status).toBe("ok");
    expect(Number.isInteger(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("identical rich profiles score high", () => {
    const r = computeAffinity(rich(), rich());
    expect(r.score).toBeGreaterThan(70);
  });

  it("shared interests raise the interests signal", () => {
    const shared = computeAffinity(rich(), rich());
    const disjoint = computeAffinity(rich(), rich({ interests: ["x", "y", "z"], funnyTags: ["dog_person"] }));
    expect(shared.score).toBeGreaterThan(disjoint.score);
  });

  it("exposes a per-signal breakdown (key/weight/value)", () => {
    const r = computeAffinity(rich(), rich());
    const keys = r.signals.map((s) => s.key).sort();
    expect(keys).toEqual(["bigfive", "context", "format", "interests", "intention"].sort());
    r.signals.forEach((s) => {
      expect(typeof s.weight).toBe("number");
      expect(s.value === null || (s.value >= 0 && s.value <= 1)).toBe(true);
    });
  });
});

describe("computeAffinity — honest 'under construction' (never a fake %)", () => {
  it("returns under_construction + null score when signals are too thin", () => {
    const bare = { interests: [], funnyTags: [], lookingFor: [] };
    const r = computeAffinity(bare, bare);
    expect(r.status).toBe("under_construction");
    expect(r.score).toBeNull();
  });
  it("null/missing profiles → under_construction, not a number", () => {
    expect(computeAffinity(null, rich()).score).toBeNull();
    expect(computeAffinity(rich(), undefined).status).toBe("under_construction");
  });
  it("a single available signal is not enough for a number", () => {
    // only intention overlaps; no personality, energy, groupPref, interests, context
    const a = { lookingFor: ["friend"] };
    const b = { lookingFor: ["friend"] };
    expect(computeAffinity(a, b).status).toBe("under_construction");
  });
});

describe("computeAffinity — professional mode", () => {
  it("re-weights to intention/industry/complement/interests/context", () => {
    const a = rich({ pro: { industry: "tech", offer: "mentoring", seek: "design help" } });
    const b = rich({ pro: { industry: "design", offer: "design help", seek: "mentoring" } });
    const r = computeAffinity(a, b, "professional");
    const keys = r.signals.map((s) => s.key).sort();
    expect(keys).toEqual(["complement", "context", "industry", "interests", "intention"].sort());
  });
  it("rewards complementary (different) industries over identical ones", () => {
    const base = { lookingFor: ["professional"], interests: ["tech"] };
    const complementary = computeAffinity(
      { ...base, pro: { industry: "tech", offer: "code", seek: "design" } },
      { ...base, pro: { industry: "design", offer: "design", seek: "code" } },
      "professional"
    );
    const same = computeAffinity(
      { ...base, pro: { industry: "tech", offer: "code", seek: "design" } },
      { ...base, pro: { industry: "tech", offer: "design", seek: "code" } },
      "professional"
    );
    expect(complementary.score).toBeGreaterThan(same.score);
  });
});
