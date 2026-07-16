import { gateFor, curatedSetState, toMillis } from "../curatedGate";

const NOW = 1_700_000_000_000;
const activeMm = { consentAt: NOW - 1000, profileComplete: true, enabled: true };

describe("curatedGate — freemium gate (client mirror of the server)", () => {
  it("Kinlo Plus is always unlocked (even with no trial)", () => {
    expect(gateFor({}, "kinlo_plus", NOW)).toEqual({ unlocked: true, tier: "plus" });
  });

  it("inside the trial week → unlocked (free_trial)", () => {
    const mm = { freeTrialEndsAt: NOW + 86_400_000 };
    expect(gateFor(mm, "free", NOW)).toEqual({ unlocked: true, tier: "free_trial" });
  });

  it("after the trial week, not Plus → 100% locked", () => {
    const mm = { freeTrialEndsAt: NOW - 1 };
    expect(gateFor(mm, "free", NOW)).toEqual({ unlocked: false, tier: "locked" });
  });

  it("no trial recorded, not Plus → locked", () => {
    expect(gateFor({}, "free", NOW)).toEqual({ unlocked: false, tier: "locked" });
  });

  it("toMillis handles ms, ISO, Firestore Timestamp, seconds", () => {
    expect(toMillis(NOW)).toBe(NOW);
    expect(toMillis({ toMillis: () => NOW })).toBe(NOW);
    expect(toMillis({ seconds: NOW / 1000 })).toBe(NOW);
    expect(toMillis(null)).toBeNull();
  });
});

describe("curatedSetState — what the client renders", () => {
  it("not opted in / incomplete → inactive", () => {
    expect(curatedSetState({}, { consentAt: null })).toBe("inactive");
    expect(curatedSetState({}, { consentAt: NOW, profileComplete: false })).toBe("inactive");
  });

  it("locked set (server withheld members) → locked", () => {
    expect(curatedSetState({ locked: true, members: [] }, activeMm)).toBe("locked");
  });

  it("active but empty pool → honest empty (never fabricated)", () => {
    expect(curatedSetState(null, activeMm)).toBe("empty");
    expect(curatedSetState({ locked: false, members: [] }, activeMm)).toBe("empty");
  });

  it("active + unlocked + members → ready", () => {
    expect(curatedSetState({ locked: false, members: [{ uid: "x", score: 80 }] }, activeMm)).toBe("ready");
  });

  it("a locked set NEVER renders as ready even if members leaked", () => {
    // Defense in depth: locked wins regardless of members.
    expect(curatedSetState({ locked: true, members: [{ uid: "x" }] }, activeMm)).toBe("locked");
  });
});
