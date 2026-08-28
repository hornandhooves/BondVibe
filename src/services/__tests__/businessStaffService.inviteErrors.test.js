/**
 * KIN-243 (authorized follow-up): `inviteBusinessStaff` throws "already-exists"
 * for two different reasons — inviting the owner ("self") and inviting a uid
 * that's already an ACTIVE staff member ("already_active") — both server throw
 * sites now use a stable message code rather than English prose, and the
 * client maps each to its own error tag instead of collapsing them.
 */
import { httpsCallable } from "firebase/functions";
import { inviteStaff, inviteStaffByHandle } from "../businessStaffService";

jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "owner1" } } }));
jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));

const rejectWith = (code, message) =>
  httpsCallable.mockReturnValue(() => Promise.reject({ code, message }));

describe("inviteStaff / inviteStaffByHandle — already-exists error mapping", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps the self-invite throw to error: 'self'", async () => {
    rejectWith("functions/already-exists", "self");
    const r = await inviteStaff("me@kinlo.test", "reception");
    expect(r).toEqual({ ok: false, error: "self" });
  });

  it("maps the already-active throw to error: 'already_active', distinct from self", async () => {
    rejectWith("functions/already-exists", "already_active");
    const r = await inviteStaffByHandle("alice", "reception");
    expect(r).toEqual({ ok: false, error: "already_active" });
  });

  it("not-found still maps independently of the already-exists cases", async () => {
    rejectWith("functions/not-found", "No user with that handle.");
    const r = await inviteStaffByHandle("ghost", "reception");
    expect(r).toEqual({ ok: false, error: "not_found" });
  });
});
