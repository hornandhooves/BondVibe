/**
 * Entitlement resolution matrix — the pure resolver must be exhaustive:
 * every tier × subscription combination, plus kill-switch and unknown keys.
 */
import { FEATURES, resolveEntitlement } from "../entitlements";

const none = { isPro: false, isPlus: false };
const pro = { isPro: true, isPlus: false };
const plus = { isPro: false, isPlus: true };

describe("resolveEntitlement", () => {
  test("unknown feature → denied with reason 'unknown'", () => {
    expect(resolveEntitlement("nope", none)).toMatchObject({
      allowed: false,
      reason: "unknown",
    });
  });

  test("kill-switch (on:false) → denied with reason 'off'", () => {
    const key = "__test_off";
    FEATURES[key] = { tier: "pro", audience: "host", on: false };
    expect(resolveEntitlement(key, pro)).toMatchObject({ allowed: false, reason: "off" });
    delete FEATURES[key];
  });

  test("free tier → always allowed", () => {
    const key = "__test_free";
    FEATURES[key] = { tier: "free", audience: "attendee", on: true };
    expect(resolveEntitlement(key, none)).toMatchObject({ allowed: true, reason: "ok" });
    delete FEATURES[key];
  });

  test("pro feature: denied without Pro (needs_pro + freeTaste), allowed with Pro", () => {
    const r = resolveEntitlement("host_copilot", none);
    expect(r).toMatchObject({ allowed: false, tier: "pro", reason: "needs_pro" });
    expect(r.freeTaste).toBeTruthy();
    expect(resolveEntitlement("host_copilot", pro)).toMatchObject({
      allowed: true,
      reason: "ok",
    });
    // Plus does NOT unlock a Pro feature
    expect(resolveEntitlement("host_copilot", plus).allowed).toBe(false);
  });

  test("plus feature: denied without Plus (needs_plus), allowed with Plus", () => {
    expect(resolveEntitlement("ask_kinlo", none)).toMatchObject({
      allowed: false,
      tier: "plus",
      reason: "needs_plus",
    });
    expect(resolveEntitlement("ask_kinlo", plus)).toMatchObject({
      allowed: true,
      reason: "ok",
    });
    // Pro does NOT unlock a Plus (attendee) feature
    expect(resolveEntitlement("ask_kinlo", pro).allowed).toBe(false);
  });

  test("existing features keep their contracted tiers (spec §1.8)", () => {
    expect(FEATURES.community_matching_host).toMatchObject({ tier: "pro", on: true });
    expect(FEATURES.ratings_ai_coaching).toMatchObject({ tier: "pro", on: true });
    expect(FEATURES.matching_unlimited_likes).toMatchObject({ tier: "plus", on: true });
  });

  test("every feature entry is well-formed", () => {
    for (const [key, f] of Object.entries(FEATURES)) {
      expect(["free", "pro", "plus"]).toContain(f.tier);
      expect(["host", "attendee"]).toContain(f.audience);
      expect(typeof f.on).toBe("boolean");
      if (f.freeTaste !== undefined) expect(typeof f.freeTaste).toBe("string");
    }
  });
});
