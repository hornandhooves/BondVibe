/**
 * KIN-114 — reportUserOrEvent is the ONLY writer ReportScreen is allowed to
 * use. It must go through the shared `report()` helper (same one
 * reportProhibitedContent/reportUserBlock already use) so reporterId/status/
 * createdAt can never be forgotten again — that omission is exactly what
 * made every user-initiated report rejected by firestore.rules in production.
 */
jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "reporter1" } } }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  addDoc: jest.fn(() => Promise.resolve({ id: "report1" })),
  serverTimestamp: jest.fn(() => "ts"),
}));

import { reportUserOrEvent } from "../reportService";
import { addDoc } from "firebase/firestore";

beforeEach(() => {
  addDoc.mockClear();
});

describe("reportUserOrEvent", () => {
  it("targetUserId -> reporterId, type:user, status:open, targetEventId:null", async () => {
    const out = await reportUserOrEvent({
      targetUserId: "victim1", targetName: "Victim", reason: "harassmentOrBullying",
    });
    expect(out.success).toBe(true);
    const payload = addDoc.mock.calls[0][1];
    expect(payload.reporterId).toBe("reporter1");
    expect(payload.status).toBe("open");
    expect(payload.type).toBe("user");
    expect(payload.targetUserId).toBe("victim1");
    expect(payload.targetEventId).toBe(null);
    expect(payload.targetName).toBe("Victim");
  });

  it("targetEventId -> type:event, targetUserId:null", async () => {
    await reportUserOrEvent({ targetEventId: "evt1", reason: "spamOrScam" });
    const payload = addDoc.mock.calls[0][1];
    expect(payload.type).toBe("event");
    expect(payload.targetEventId).toBe("evt1");
    expect(payload.targetUserId).toBe(null);
  });

  it("no target at all -> type:general (SafetyCenterScreen entry point)", async () => {
    await reportUserOrEvent({ reason: "other" });
    const payload = addDoc.mock.calls[0][1];
    expect(payload.type).toBe("general");
    expect(payload.targetUserId).toBe(null);
    expect(payload.targetEventId).toBe(null);
  });

  it("details over 2000 chars is truncated BEFORE addDoc (or RP6 rejects it silently)", async () => {
    const longDetails = "x".repeat(3000);
    await reportUserOrEvent({ targetUserId: "victim1", reason: "other", details: longDetails });
    const payload = addDoc.mock.calls[0][1];
    expect(payload.details.length).toBe(2000);
  });
});
