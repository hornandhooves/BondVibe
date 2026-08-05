/**
 * KIN-151 — the table from the ticket: every input that used to sneak a NaN
 * (or worse) past `parseFloat(v) <= 0` / `parseInt(v, 10) <= 0` because a
 * comparison against NaN is always false.
 */
import { parsePositiveNumber, isValidNumberInProgress } from "../validation";

describe("parsePositiveNumber", () => {
  const cases = [
    ["", null],
    [".", null],
    ["..", null],
    ["0", null],
    ["-1", null],
    ["abc", null],
    ["1.9", 1.9],
    ["1e5", 100000],
    [" 5 ", 5],
    ["Infinity", null],
    ["-Infinity", null],
    [null, null],
    [undefined, null],
  ];

  it.each(cases)("parsePositiveNumber(%j) === %p", (input, expected) => {
    expect(parsePositiveNumber(input)).toBe(expected);
  });

  it("never returns NaN — always a finite number or null", () => {
    for (const [input] of cases) {
      const result = parsePositiveNumber(input);
      expect(result === null || Number.isFinite(result)).toBe(true);
    }
  });
});

describe("isValidNumberInProgress", () => {
  const valid = ["", "0", "1", "1.9", "12.", "0.5", ".5", "100"];
  const invalid = [".", "..", "abc", "-1", "1e5", " 5 ", "Infinity", "1.2.3", "1,5"];

  it.each(valid)("%j is a valid in-progress number", (text) => {
    expect(isValidNumberInProgress(text)).toBe(true);
  });

  it.each(invalid)("%j is rejected", (text) => {
    expect(isValidNumberInProgress(text)).toBe(false);
  });
});
