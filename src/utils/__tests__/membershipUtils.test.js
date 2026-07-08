import {
  MEMBERSHIP_PLAN_TYPES,
  MEMBERSHIP_AUDIENCE,
  audienceAllows,
  toMillis,
  validatePlanInput,
  getMembershipState,
  getMembershipExpiryDate,
  formatPlanPrice,
  describePlan,
} from "../membershipUtils";

const future = Date.now() + 10 * 86400000;
const past = Date.now() - 10 * 86400000;
const tsFromMs = (ms) => ({ toMillis: () => ms });

describe("toMillis", () => {
  it("reads Firestore Timestamp, {seconds}, Date and ISO strings", () => {
    expect(toMillis(tsFromMs(1000))).toBe(1000);
    expect(toMillis({ seconds: 2 })).toBe(2000);
    const d = new Date("2026-01-01T00:00:00Z");
    expect(toMillis(d)).toBe(d.getTime());
    expect(toMillis("2026-01-01T00:00:00Z")).toBe(d.getTime());
    expect(toMillis(null)).toBe(0);
    expect(toMillis("garbage")).toBe(0);
  });
});

describe("validatePlanInput", () => {
  const base = {
    name: "10 Classes",
    type: MEMBERSHIP_PLAN_TYPES.CREDITS,
    creditsIncluded: 10,
    validityDays: 60,
    priceCentavos: 120000,
  };
  it("accepts a valid credit pack", () => {
    expect(validatePlanInput(base)).toBeNull();
  });
  it("rejects a plan without credits (no unlimited)", () => {
    expect(validatePlanInput({ ...base, creditsIncluded: null })).toMatch(/credit/i);
  });
  it("rejects missing name, price, validity", () => {
    expect(validatePlanInput({ ...base, name: "  " })).toMatch(/name/i);
    expect(validatePlanInput({ ...base, priceCentavos: 0 })).toMatch(/price/i);
    expect(validatePlanInput({ ...base, validityDays: 0 })).toMatch(/validity/i);
  });
  it("requires at least one credit", () => {
    expect(validatePlanInput({ ...base, creditsIncluded: 0 })).toMatch(/credit/i);
  });
  it("accepts a valid audience tier and rejects an invalid one", () => {
    expect(validatePlanInput({ ...base, audienceTier: MEMBERSHIP_AUDIENCE.LOCAL })).toBeNull();
    expect(validatePlanInput({ ...base, audienceTier: "weird" })).toMatch(/audience/i);
  });
});

describe("audienceAllows", () => {
  it("both allows everyone; local/general match the member tier", () => {
    expect(audienceAllows(MEMBERSHIP_AUDIENCE.BOTH, "local")).toBe(true);
    expect(audienceAllows(MEMBERSHIP_AUDIENCE.BOTH, "general")).toBe(true);
    expect(audienceAllows(MEMBERSHIP_AUDIENCE.LOCAL, "local")).toBe(true);
    expect(audienceAllows(MEMBERSHIP_AUDIENCE.LOCAL, "general")).toBe(false);
    expect(audienceAllows(MEMBERSHIP_AUDIENCE.GENERAL, "general")).toBe(true);
    expect(audienceAllows(MEMBERSHIP_AUDIENCE.GENERAL, "local")).toBe(false);
  });
  it("defaults: undefined audience → both; undefined member → general", () => {
    expect(audienceAllows(undefined, "local")).toBe(true);
    expect(audienceAllows(MEMBERSHIP_AUDIENCE.GENERAL, undefined)).toBe(true);
    expect(audienceAllows(MEMBERSHIP_AUDIENCE.LOCAL, undefined)).toBe(false);
  });
});

describe("getMembershipState", () => {
  it("is expired when past expiry regardless of credits", () => {
    const m = { type: "credits", creditsRemaining: 5, expiresAt: tsFromMs(past) };
    expect(getMembershipState(m)).toBe("expired");
  });
  it("is depleted when a credit pack has no credits left", () => {
    const m = { type: "credits", creditsRemaining: 0, expiresAt: tsFromMs(future) };
    expect(getMembershipState(m)).toBe("depleted");
  });
  it("is active with credits remaining and not expired", () => {
    const m = { type: "credits", creditsRemaining: 3, expiresAt: tsFromMs(future) };
    expect(getMembershipState(m)).toBe("active");
  });
  it("treats a legacy membership with null credits as active until expiry", () => {
    const m = { creditsRemaining: null, expiresAt: tsFromMs(future) };
    expect(getMembershipState(m)).toBe("active");
  });
  it("accepts an injected now for deterministic tests", () => {
    const m = { type: "credits", creditsRemaining: 1, expiresAt: tsFromMs(1000) };
    expect(getMembershipState(m, 500)).toBe("active");
    expect(getMembershipState(m, 2000)).toBe("expired");
  });
  it("handles null membership", () => {
    expect(getMembershipState(null)).toBe("expired");
  });
});

describe("getMembershipExpiryDate", () => {
  it("returns a Date for a valid expiry and null otherwise", () => {
    expect(getMembershipExpiryDate({ expiresAt: tsFromMs(1000) })).toEqual(
      new Date(1000)
    );
    expect(getMembershipExpiryDate({})).toBeNull();
    expect(getMembershipExpiryDate(null)).toBeNull();
  });
});

describe("describePlan", () => {
  it("describes credit packs with pluralization", () => {
    expect(describePlan({ type: "credits", creditsIncluded: 10, validityDays: 60 })).toBe(
      "10 classes · valid 60 days"
    );
    expect(describePlan({ type: "credits", creditsIncluded: 1, validityDays: 30 })).toBe(
      "1 class · valid 30 days"
    );
  });
  it("describes a legacy plan without credits neutrally", () => {
    expect(describePlan({ validityDays: 30 })).toBe("Membership · valid 30 days");
  });
});

describe("formatPlanPrice", () => {
  it("formats centavos as MXN", () => {
    expect(formatPlanPrice(120000)).toContain("1,200.00");
    expect(formatPlanPrice(120000)).toContain("MXN");
  });
});
