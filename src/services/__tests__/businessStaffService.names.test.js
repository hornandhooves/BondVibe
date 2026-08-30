/**
 * KIN-256 — a staff row's displayed name stopped coming from Firebase Auth.
 *
 * Reproduced on device: `users/{uid}.fullName` was "Ah", but Auth's
 * `displayName` — never touched by this app, since it never calls
 * updateProfile() — was "Carlos Duarte" (a different account's name, left
 * over from a shared test login). The staff row showed "Carlos Duarte" next
 * to that person's real email, and the accept-invite push announced the wrong
 * name to the owner. `s.name` on a staff doc is exactly that frozen Auth
 * displayName the server wrote at invite time — these tests pin that it never
 * wins for a real account (has `uid`), while still winning for a KIN-190
 * placeholder (no `uid`, no account, `name` is its only real name).
 */
import { staffDisplayName, resolveStaffFullNames } from "../businessStaffService";
import { getUserProfiles } from "../hostGroupService";

jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "owner1" } } }));
jest.mock("../businessService", () => ({ getMyBizId: jest.fn(() => "biz1") }));
jest.mock("../hostGroupService", () => ({ getUserProfiles: jest.fn() }));

describe("staffDisplayName", () => {
  it("a real account (has uid) prefers fullName over the poisoned `name` field", () => {
    // `name` is what the reproduction had: someone else's Auth displayName.
    const staffDoc = { uid: "u1", name: "Carlos Duarte", fullName: "Ah", email: "ahronyswow@gmail.com" };
    expect(staffDisplayName(staffDoc)).toBe("Ah");
  });

  it("a real account with no fullName falls to email, never to `name`", () => {
    const staffDoc = { uid: "u1", name: "Carlos Duarte", email: "ahronyswow@gmail.com" };
    expect(staffDisplayName(staffDoc)).toBe("ahronyswow@gmail.com");
  });

  it("a real account's owner-set displayName still wins over fullName (BUG 32.3, unchanged)", () => {
    const staffDoc = { uid: "u1", displayName: "Front desk Ana", name: "Carlos Duarte", fullName: "Ah" };
    expect(staffDisplayName(staffDoc)).toBe("Front desk Ana");
  });

  it("a placeholder (no uid) has no profile to resolve — `name` IS its real name", () => {
    const placeholder = { name: "Diego (guest instructor)" };
    expect(staffDisplayName(placeholder)).toBe("Diego (guest instructor)");
  });

  it("a placeholder's owner-set displayName still wins over `name`", () => {
    const placeholder = { displayName: "Studio B instructor", name: "Diego" };
    expect(staffDisplayName(placeholder)).toBe("Studio B instructor");
  });

  it("falls back when nothing is set, for either shape", () => {
    expect(staffDisplayName({ uid: "u1" }, "Fallback")).toBe("Fallback");
    expect(staffDisplayName({}, "Fallback")).toBe("Fallback");
    expect(staffDisplayName(null, "Fallback")).toBe("Fallback");
  });
});

describe("resolveStaffFullNames", () => {
  beforeEach(() => jest.clearAllMocks());

  it("injects fullName for entries with a uid, from getUserProfiles", async () => {
    getUserProfiles.mockResolvedValue([{ id: "u1", fullName: "Ah" }]);
    const result = await resolveStaffFullNames([{ id: "u1", uid: "u1", name: "Carlos Duarte" }]);
    expect(result).toEqual([{ id: "u1", uid: "u1", name: "Carlos Duarte", fullName: "Ah" }]);
    expect(getUserProfiles).toHaveBeenCalledWith(["u1"]);
  });

  it("a missing profile is dropped, not surfaced — the entry passes through unchanged", async () => {
    getUserProfiles.mockResolvedValue([]); // uid not found / unreadable
    const input = [{ id: "u1", uid: "u1", email: "a@kinlo.test" }];
    const result = await resolveStaffFullNames(input);
    expect(result).toEqual(input);
  });

  it("a profile with no fullName does not inject an empty key", async () => {
    getUserProfiles.mockResolvedValue([{ id: "u1" }]); // profile exists, no fullName field
    const input = [{ id: "u1", uid: "u1", email: "a@kinlo.test" }];
    const result = await resolveStaffFullNames(input);
    expect(result).toEqual(input);
    expect(result[0]).not.toHaveProperty("fullName");
  });

  it("never throws — a reader failure returns the input list untouched", async () => {
    getUserProfiles.mockRejectedValue(new Error("boom"));
    const input = [{ id: "u1", uid: "u1", name: "Carlos Duarte" }];
    await expect(resolveStaffFullNames(input)).resolves.toEqual(input);
  });

  it("a placeholder (no uid) is never sent to getUserProfiles", async () => {
    getUserProfiles.mockResolvedValue([]);
    const input = [{ id: "ph1", name: "Diego" }];
    const result = await resolveStaffFullNames(input);
    expect(result).toEqual(input);
    expect(getUserProfiles).not.toHaveBeenCalled();
  });

  it("mixed list: only the uid'd entry is resolved, the placeholder passes through", async () => {
    getUserProfiles.mockResolvedValue([{ id: "u1", fullName: "Ah" }]);
    const input = [
      { id: "u1", uid: "u1", name: "Carlos Duarte" },
      { id: "ph1", name: "Diego" },
    ];
    const result = await resolveStaffFullNames(input);
    expect(result).toEqual([
      { id: "u1", uid: "u1", name: "Carlos Duarte", fullName: "Ah" },
      { id: "ph1", name: "Diego" },
    ]);
  });

  it("an empty or non-array input is returned as-is", async () => {
    expect(await resolveStaffFullNames([])).toEqual([]);
    expect(await resolveStaffFullNames(null)).toBeNull();
    expect(getUserProfiles).not.toHaveBeenCalled();
  });
});
