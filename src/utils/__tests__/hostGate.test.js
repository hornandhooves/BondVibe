import { isApprovedHost } from "../hostGate";

describe("isApprovedHost — unified host gate (mirrors firestore.rules)", () => {
  it("denies a plain user", () => {
    expect(isApprovedHost({ role: "user", hostApproved: false })).toBe(false);
    expect(isApprovedHost({ role: "user" })).toBe(false);
  });

  it("grants a user with the admin-granted hostApproved right (before picking a type)", () => {
    expect(isApprovedHost({ role: "user", hostApproved: true })).toBe(true);
  });

  it("grants a user whose role is already 'host'", () => {
    expect(isApprovedHost({ role: "host", hostApproved: false })).toBe(true);
  });

  it("does NOT grant admins by role alone (matches the rule — no vehicle-create for admins)", () => {
    expect(isApprovedHost({ role: "admin", hostApproved: false })).toBe(false);
  });

  it("is safe on missing/empty input", () => {
    expect(isApprovedHost()).toBe(false);
    expect(isApprovedHost(null)).toBe(false);
    expect(isApprovedHost({})).toBe(false);
  });

  it("treats only strict true as approved (no truthy coercion of hostApproved)", () => {
    expect(isApprovedHost({ hostApproved: "yes" })).toBe(false);
    expect(isApprovedHost({ hostApproved: 1 })).toBe(false);
  });
});
