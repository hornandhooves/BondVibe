import {
  bandFor,
  interpretBigFive,
  isInterpretable,
  clampScore,
  BIG_FIVE_KEYS,
  BAND_LOW_MAX,
  BAND_MID_MAX,
} from "../personalityInterpret";
import en from "../../i18n/locales/en.json";
import es from "../../i18n/locales/es.json";

const FULL = {
  OPENNESS: 80,
  CONSCIENTIOUSNESS: 50,
  EXTRAVERSION: 20,
  AGREEABLENESS: 65,
  NEUROTICISM: 39,
};

describe("bandFor — thresholds (low <40 · mid 40-60 · high >60)", () => {
  it("classifies the boundaries exactly", () => {
    expect(bandFor(0)).toBe("low");
    expect(bandFor(39)).toBe("low");
    expect(bandFor(BAND_LOW_MAX)).toBe("mid"); // 40 is mid
    expect(bandFor(50)).toBe("mid");
    expect(bandFor(BAND_MID_MAX)).toBe("mid"); // 60 is mid
    expect(bandFor(61)).toBe("high");
    expect(bandFor(100)).toBe("high");
  });
  it("returns null for non-numbers", () => {
    expect(bandFor(undefined)).toBeNull();
    expect(bandFor(null)).toBeNull();
    expect(bandFor("70")).toBeNull();
    expect(bandFor(NaN)).toBeNull();
  });
});

describe("interpretBigFive — always the five dimensions", () => {
  it("returns all 5 in order, never a partial list", () => {
    const r = interpretBigFive(FULL);
    expect(r).toHaveLength(5);
    expect(r.map((x) => x.key)).toEqual(BIG_FIVE_KEYS);
    expect(BIG_FIVE_KEYS).toHaveLength(5);
  });

  it("still returns all 5 for an empty/partial profile (scores 0, no band)", () => {
    const r = interpretBigFive({ OPENNESS: 70 });
    expect(r).toHaveLength(5);
    expect(r[0].band).toBe("high");
    const missing = r.find((x) => x.key === "NEUROTICISM");
    expect(missing.band).toBeNull();
    expect(missing.textKey).toBeNull();
    expect(missing.score).toBe(0);
  });

  it("exposes a SHORT label key for the compact bar row", () => {
    const r = interpretBigFive(FULL);
    expect(r[0].shortLabelKey).toBe("personalityQuiz.dimensions.OPENNESS.short");
  });

  it("maps each dimension to its band + i18n keys", () => {
    const r = interpretBigFive(FULL);
    const byKey = Object.fromEntries(r.map((x) => [x.key, x]));
    expect(byKey.OPENNESS.band).toBe("high");
    expect(byKey.CONSCIENTIOUSNESS.band).toBe("mid");
    expect(byKey.EXTRAVERSION.band).toBe("low");
    expect(byKey.AGREEABLENESS.band).toBe("high");
    expect(byKey.NEUROTICISM.band).toBe("low");
    expect(byKey.OPENNESS.textKey).toBe("personalityQuiz.interpret.OPENNESS.high");
    expect(byKey.OPENNESS.labelKey).toBe("personalityQuiz.dimensions.OPENNESS.title");
  });

  it("clamps scores into 0-100", () => {
    expect(clampScore(140)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(66.6)).toBe(67);
    expect(clampScore("x")).toBe(0);
  });
});

describe("isInterpretable — a partial quiz is not a reading", () => {
  it("true only when all five are numbers", () => {
    expect(isInterpretable(FULL)).toBe(true);
    expect(isInterpretable({ ...FULL, NEUROTICISM: undefined })).toBe(false);
    expect(isInterpretable({})).toBe(false);
    expect(isInterpretable(null)).toBe(false);
  });
});

describe("i18n — every (dimension × band) phrase exists in EN and ES", () => {
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

  // The bar row renders `short`; a missing one would render the raw key.
  it.each(BIG_FIVE_KEYS)("%s has a short name in both locales", (dim) => {
    const path = `personalityQuiz.dimensions.${dim}.short`;
    expect(typeof get(en, path)).toBe("string");
    expect(typeof get(es, path)).toBe("string");
    expect(get(en, path).length).toBeGreaterThan(0);
    expect(get(es, path).length).toBeGreaterThan(0);
  });

  it.each(BIG_FIVE_KEYS)("%s has low/mid/high copy in both locales", (dim) => {
    for (const band of ["low", "mid", "high"]) {
      const path = `personalityQuiz.interpret.${dim}.${band}`;
      expect(typeof get(en, path)).toBe("string");
      expect(typeof get(es, path)).toBe("string");
      expect(get(en, path).length).toBeGreaterThan(0);
      expect(get(es, path).length).toBeGreaterThan(0);
    }
  });

  it("has the 15 phrases (5 dims × 3 bands) and band labels", () => {
    const count = (loc) =>
      BIG_FIVE_KEYS.reduce(
        (n, d) => n + ["low", "mid", "high"].filter((b) => get(loc, `personalityQuiz.interpret.${d}.${b}`)).length,
        0
      );
    expect(count(en)).toBe(15);
    expect(count(es)).toBe(15);
    for (const band of ["low", "mid", "high"]) {
      expect(typeof get(en, `personalityQuiz.band.${band}`)).toBe("string");
      expect(typeof get(es, `personalityQuiz.band.${band}`)).toBe("string");
    }
  });
});
