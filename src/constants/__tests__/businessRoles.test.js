/**
 * fix/post-deploy-closures — roleAllows must treat `finance` as DEFAULT-DENY so
 * the client matches the #59 server rule (perms.finance == true). Other areas
 * keep the permissive default (missing key → allowed).
 */
import { roleAllows } from "../businessRoles";

describe("roleAllows — finance is default-deny", () => {
  it("denies finance when the key is missing (undefined)", () => {
    expect(roleAllows({}, "finance")).toBe(false);
    expect(roleAllows({ dashboard: true }, "finance")).toBe(false);
  });

  it("denies finance when explicitly false", () => {
    expect(roleAllows({ finance: false }, "finance")).toBe(false);
  });

  it("allows finance ONLY when explicitly true", () => {
    expect(roleAllows({ finance: true }, "finance")).toBe(true);
  });

  it("keeps the permissive default for non-finance areas", () => {
    expect(roleAllows({}, "classes")).toBe(true); // missing → allowed
    expect(roleAllows({ classes: false }, "classes")).toBe(false);
    expect(roleAllows({ classes: true }, "classes")).toBe(true);
  });

  it("null perms (owner/unknown) → allowed everywhere", () => {
    expect(roleAllows(null, "finance")).toBe(true);
    expect(roleAllows(undefined, "classes")).toBe(true);
  });
});
