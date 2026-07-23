/**
 * feat/admin-payouts-ui — the client acts ONLY through the 3 live admin callables
 * (no direct ledger access). These lock the callable names + payloads.
 */
const mockFn = jest.fn(() => Promise.resolve({ data: { ok: true } }));
const mockHttpsCallable = jest.fn(() => mockFn);

jest.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: (...a) => mockHttpsCallable(...a),
}));

import { listPayouts, releasePayout, refundPayout } from "../adminPayoutsService";

beforeEach(() => { mockHttpsCallable.mockClear(); mockFn.mockClear(); });

describe("adminPayoutsService — only the live callables", () => {
  it("listPayouts calls adminListPayouts with filters", async () => {
    mockFn.mockResolvedValueOnce({ data: { payouts: [], nextCursor: null } });
    const out = await listPayouts({ status: "held", type: "event", limit: 25 });
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), "adminListPayouts");
    expect(mockFn).toHaveBeenCalledWith({ status: "held", type: "event", cursor: undefined, limit: 25 });
    expect(out.payouts).toEqual([]);
  });

  it("releasePayout calls adminReleasePayout with the PI id", async () => {
    await releasePayout("pi_1");
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), "adminReleasePayout");
    expect(mockFn).toHaveBeenCalledWith({ paymentIntentId: "pi_1" });
  });

  it("refundPayout calls adminRefundPayout with the PI id + reason", async () => {
    await refundPayout("pi_2", "admin_refund");
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), "adminRefundPayout");
    expect(mockFn).toHaveBeenCalledWith({ paymentIntentId: "pi_2", reason: "admin_refund" });
  });

  it("does NOT touch Firestore directly (callables only, ledger is deny-all)", () => {
    const src = require("fs").readFileSync(require.resolve("../adminPayoutsService"), "utf8");
    expect(src).not.toMatch(/from ["']firebase\/firestore["']/);
    expect(src).not.toMatch(/getDocs|collection\(|onSnapshot/);
  });
});
