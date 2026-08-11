import { darkenHex, toAndroidColor } from "../color";

describe("darkenHex", () => {
  it("shades each channel down by the given amount", () => {
    expect(darkenHex("#C86D4A", 0.2)).toBe("#a0573b");
  });

  it("defaults to a 20% shade", () => {
    expect(darkenHex("#C86D4A")).toBe(darkenHex("#C86D4A", 0.2));
  });

  it("clamps toward black at amount 1", () => {
    expect(darkenHex("#FFFFFF", 1)).toBe("#000000");
  });

  it("is a no-op at amount 0", () => {
    expect(darkenHex("#7C3AED", 0)).toBe("#7c3aed");
  });
});

/**
 * KIN-210 — toAndroidColor is the boundary between RN's colour parsing and
 * Android's, which is much stricter. The crash it prevents is a hard app kill
 * while the CardField is being constructed.
 *
 * The alpha-first ordering matters more than it looks: Android wants ARGB and
 * CSS writes RGBA. Getting that backwards yields a colour that parses fine and
 * is simply wrong — a silent bug instead of a loud one.
 */
describe("toAndroidColor", () => {
  it("converts the real theme tokens that crashed Android", () => {
    // WARMTH (light) and AURORA (dark) textTertiary — the two values that
    // actually reached CardField.
    expect(toAndroidColor("rgba(43, 43, 43, 0.42)")).toBe("#6b2b2b2b");
    expect(toAndroidColor("rgba(244, 240, 232, 0.42)")).toBe("#6bf4f0e8");
  });

  it("puts alpha FIRST, not last", () => {
    // Fully opaque red. RGBA order would give #ff0000ff and look plausible.
    expect(toAndroidColor("rgba(255, 0, 0, 1)")).toBe("#ffff0000");
  });

  it("treats a missing alpha as opaque", () => {
    expect(toAndroidColor("rgb(255, 0, 0)")).toBe("#ffff0000");
  });

  it("handles transparent and mid alphas", () => {
    expect(toAndroidColor("rgba(0, 0, 0, 0)")).toBe("#00000000");
    expect(toAndroidColor("rgba(0, 0, 0, 0.5)")).toBe("#80000000");
  });

  it("leaves anything Android already accepts untouched", () => {
    expect(toAndroidColor("#2b2b2b")).toBe("#2b2b2b");
    expect(toAndroidColor("#ff2b2b2b")).toBe("#ff2b2b2b");
    expect(toAndroidColor("red")).toBe("red");
  });

  it("never invents a colour from junk — passes it through", () => {
    // Returning input keeps the failure where it already was instead of
    // silently substituting black.
    expect(toAndroidColor("not-a-color")).toBe("not-a-color");
    expect(toAndroidColor("rgba(1, 2)")).toBe("rgba(1, 2)");
  });

  it("survives non-string input", () => {
    expect(toAndroidColor(undefined)).toBeUndefined();
    expect(toAndroidColor(null)).toBeNull();
    expect(toAndroidColor(0xff0000)).toBe(0xff0000);
  });

  it("clamps channels that are in-format but out of range", () => {
    // A 1-char channel would produce a string parseColor rejects.
    expect(toAndroidColor("rgba(300, 999, 0, 2)")).toBe("#ffffff00");
  });

  it("passes through malformed input rather than guessing", () => {
    // A negative channel isn't valid CSS; leaving it alone keeps the failure
    // visible instead of silently substituting a colour.
    expect(toAndroidColor("rgba(300, -20, 0, 2)")).toBe("rgba(300, -20, 0, 2)");
  });

  it("every output is a length parseColor accepts", () => {
    const inputs = [
      "rgba(43, 43, 43, 0.42)", "rgb(1,2,3)", "rgba(0,0,0,0)",
      "rgba(244, 240, 232, 0.62)",
    ];
    for (const i of inputs) {
      expect(toAndroidColor(i)).toMatch(/^#[0-9a-f]{8}$/);
    }
  });
});
