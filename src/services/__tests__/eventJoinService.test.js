import { httpsCallable } from "firebase/functions";
import { joinFreeEvent } from "../eventJoinService";

jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));

const mockCallable = (impl) => httpsCallable.mockReturnValue(impl);

describe("joinFreeEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns success and spreads the function payload", async () => {
    mockCallable(() => Promise.resolve({ data: { success: true, already: false } }));
    const r = await joinFreeEvent("evt1");
    expect(r.success).toBe(true);
    expect(r.already).toBe(false);
  });

  it("maps event_full to a friendly message", async () => {
    mockCallable(() => Promise.reject(new Error("event_full")));
    const r = await joinFreeEvent("evt1");
    expect(r).toMatchObject({ success: false, error: "This event is full." });
  });

  it("maps paid_event to the checkout hint", async () => {
    mockCallable(() => Promise.reject(new Error("paid_event")));
    const r = await joinFreeEvent("evt1");
    expect(r.error).toBe("This is a paid event — please use checkout.");
  });

  it("falls back to a generic message on unknown errors", async () => {
    mockCallable(() => Promise.reject(new Error("boom")));
    const r = await joinFreeEvent("evt1");
    expect(r).toMatchObject({ success: false, error: "Could not join. Please try again." });
  });
});
