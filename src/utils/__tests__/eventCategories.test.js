import {
  EVENT_CATEGORIES,
  CATEGORY_NAMES,
  CATEGORIES,
  EVENT_LANGUAGES,
  normalizeCategory,
  isValidCategory,
  getCategoryById,
  getCategoryEmoji,
  getCategoryLabel,
  getCategoryId,
} from "../eventCategories";

describe("eventCategories", () => {
  describe("EVENT_CATEGORIES", () => {
    it("is a non-empty list of {id, emoji, label} objects", () => {
      expect(Array.isArray(EVENT_CATEGORIES)).toBe(true);
      expect(EVENT_CATEGORIES.length).toBeGreaterThan(0);
      EVENT_CATEGORIES.forEach((cat) => {
        expect(typeof cat.id).toBe("string");
        expect(typeof cat.emoji).toBe("string");
        expect(typeof cat.label).toBe("string");
        expect(cat.id).toBe(cat.id.toLowerCase());
      });
    });

    it("has unique ids", () => {
      const ids = EVENT_CATEGORIES.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("includes the core categories", () => {
      const ids = EVENT_CATEGORIES.map((c) => c.id);
      expect(ids).toEqual(
        expect.arrayContaining(["social", "sports", "food", "arts", "learning"])
      );
    });

    it("exposes string-name aliases for backwards compatibility", () => {
      expect(CATEGORY_NAMES).toHaveLength(EVENT_CATEGORIES.length);
      expect(CATEGORY_NAMES).toContain("Social");
      expect(CATEGORIES).toEqual(CATEGORY_NAMES);
    });
  });

  describe("normalizeCategory", () => {
    it("normalizes to lowercase canonical ids", () => {
      expect(normalizeCategory("Social")).toBe("social");
      expect(normalizeCategory("SPORTS")).toBe("sports");
      expect(normalizeCategory("food")).toBe("food");
    });

    it("maps common variations to a canonical id", () => {
      expect(normalizeCategory("party")).toBe("social");
      expect(normalizeCategory("Food & Drink")).toBe("food");
      expect(normalizeCategory("food and drink")).toBe("food");
      expect(normalizeCategory("sport")).toBe("sports");
      expect(normalizeCategory("education")).toBe("learning");
      expect(normalizeCategory("yoga")).toBe("wellness");
    });

    it("trims whitespace", () => {
      expect(normalizeCategory("  social  ")).toBe("social");
    });

    it("returns null for null/undefined/empty", () => {
      expect(normalizeCategory(null)).toBe(null);
      expect(normalizeCategory(undefined)).toBe(null);
      expect(normalizeCategory("")).toBe(null);
    });

    it("returns the lowercased original for unknown categories", () => {
      expect(normalizeCategory("Unknown")).toBe("unknown");
    });
  });

  describe("isValidCategory", () => {
    it("accepts canonical ids (lowercase) and labels (capitalized)", () => {
      expect(isValidCategory("social")).toBe(true);
      expect(isValidCategory("Social")).toBe(true);
      expect(isValidCategory("sports")).toBe(true);
    });

    it("rejects unknown categories and null", () => {
      expect(isValidCategory("Unknown")).toBe(false);
      expect(isValidCategory(null)).toBe(false);
    });
  });

  describe("category lookup helpers", () => {
    it("getCategoryById resolves by id or label", () => {
      expect(getCategoryById("social")?.label).toBe("Social");
      expect(getCategoryById("Social")?.id).toBe("social");
      expect(getCategoryById("nope")).toBeUndefined();
    });

    it("getCategoryEmoji returns the emoji, with a default fallback", () => {
      expect(getCategoryEmoji("food")).toBe("🍕");
      expect(getCategoryEmoji("does-not-exist")).toBe("🎉");
    });

    it("getCategoryLabel and getCategoryId round-trip", () => {
      expect(getCategoryLabel("social")).toBe("Social");
      expect(getCategoryId("Social")).toBe("social");
    });
  });

  describe("EVENT_LANGUAGES", () => {
    it("is a list of {id, label} options including Spanish and English", () => {
      const ids = EVENT_LANGUAGES.map((l) => l.id);
      expect(ids).toEqual(expect.arrayContaining(["es", "en"]));
      EVENT_LANGUAGES.forEach((l) => {
        expect(typeof l.id).toBe("string");
        expect(typeof l.label).toBe("string");
      });
    });
  });
});
