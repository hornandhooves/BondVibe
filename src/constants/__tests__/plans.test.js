/**
 * The plans model's guarantees. These aren't ceremony: an empty paymentModes
 * makes a plan unsellable through every channel while looking fine in the list,
 * and undefined is rejected by Firestore outright — both are crashes or silent
 * dead products, not style issues.
 */
import {
  PAYMENT_MODE,
  sanitizePaymentModes,
  sanitizeLoyaltyReward,
  isSellableOnline,
  isAssignableManually,
  LOYALTY_DEFAULTS,
} from "../plans";

describe("sanitizePaymentModes", () => {
  it("keeps valid modes", () => {
    expect(sanitizePaymentModes(["online"])).toEqual(["online"]);
    expect(sanitizePaymentModes(["manual"])).toEqual(["manual"]);
    expect(sanitizePaymentModes(["online", "manual"])).toEqual(["online", "manual"]);
  });

  it("returns a stable order regardless of input order", () => {
    // Two plans with the same modes must not differ by array order.
    expect(sanitizePaymentModes(["manual", "online"])).toEqual(["online", "manual"]);
  });

  it("drops unknown modes", () => {
    expect(sanitizePaymentModes(["online", "carrier-pigeon"])).toEqual(["online"]);
  });

  it("never yields an empty array — that would be a plan nobody can buy", () => {
    [[], undefined, null, "online", 42, {}, ["nonsense"]].forEach((bad) => {
      expect(sanitizePaymentModes(bad).length).toBeGreaterThan(0);
    });
  });

  it("falls back to manual, never online", () => {
    // Online implies a connected Stripe account. Guessing 'online' from a bad
    // value would advertise a plan we can't actually take money for.
    expect(sanitizePaymentModes(null)).toEqual([PAYMENT_MODE.MANUAL]);
  });

  it("never returns undefined — Firestore rejects it", () => {
    expect(sanitizePaymentModes(undefined)).toBeDefined();
  });
});

describe("sanitizeLoyaltyReward", () => {
  it("is null when off — an explicit null, not undefined", () => {
    expect(sanitizeLoyaltyReward(undefined)).toBeNull();
    expect(sanitizeLoyaltyReward({ enabled: false, stampsNeeded: 10 })).toBeNull();
  });

  it("keeps a valid reward", () => {
    expect(sanitizeLoyaltyReward({ enabled: true, stampsNeeded: 5, rewardLabel: " Free class " }))
      .toEqual({ enabled: true, stampsNeeded: 5, rewardLabel: "Free class" });
  });

  it("defaults a nonsensical threshold rather than storing it", () => {
    // 0 or negative stamps would mean "reward on every visit" — free forever.
    [0, -3, "abc", undefined].forEach((bad) => {
      expect(sanitizeLoyaltyReward({ enabled: true, stampsNeeded: bad }).stampsNeeded)
        .toBe(LOYALTY_DEFAULTS.stampsNeeded);
    });
  });
});

describe("channel predicates", () => {
  it("read the sanitised value, so a broken plan still answers safely", () => {
    expect(isSellableOnline({ paymentModes: undefined })).toBe(false);
    expect(isAssignableManually({ paymentModes: undefined })).toBe(true);
    expect(isSellableOnline({})).toBe(false);
    expect(isSellableOnline(null)).toBe(false);
  });

  it("agree with the stored modes", () => {
    const both = { paymentModes: ["online", "manual"] };
    expect(isSellableOnline(both)).toBe(true);
    expect(isAssignableManually(both)).toBe(true);
    expect(isSellableOnline({ paymentModes: ["manual"] })).toBe(false);
  });
});
