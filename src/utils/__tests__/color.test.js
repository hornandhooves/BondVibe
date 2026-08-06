import { darkenHex } from "../color";

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
