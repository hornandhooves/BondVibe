/**
 * payoutSettingsService — the retention window (settings/payouts.retentionHours, §7).
 * Unlike the ledger (callables only), this reads/writes settings/payouts directly;
 * the Firestore rule is the server gate. These lock: default fallback, the client
 * ">= 0 or reject" guard (§7), and the merge write.
 */
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn(() => Promise.resolve());
const mockDoc = jest.fn((...a) => ({ __path: a.slice(1).join("/") }));

jest.mock("firebase/firestore", () => ({
  doc: (...a) => mockDoc(...a),
  getDoc: (...a) => mockGetDoc(...a),
  setDoc: (...a) => mockSetDoc(...a),
}));
jest.mock("../firebase", () => ({ db: {} }));

import { getRetentionHours, setRetentionHours, DEFAULT_RETENTION_HOURS } from "../payoutSettingsService";

beforeEach(() => { mockGetDoc.mockClear(); mockSetDoc.mockClear(); mockDoc.mockClear(); });

describe("payoutSettingsService — retention window (§7)", () => {
  it("defaults to 24h when the doc is absent", async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    expect(await getRetentionHours()).toBe(DEFAULT_RETENTION_HOURS);
  });

  it("defaults when the field is missing / non-numeric", async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({}) });
    expect(await getRetentionHours()).toBe(24);
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ retentionHours: "x" }) });
    expect(await getRetentionHours()).toBe(24);
  });

  it("returns a stored positive value and floors a negative one at 0", async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ retentionHours: 48 }) });
    expect(await getRetentionHours()).toBe(48);
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ retentionHours: -5 }) });
    expect(await getRetentionHours()).toBe(0);
  });

  it("rejects a negative / non-number on write (client guard, §7) — no setDoc", async () => {
    await expect(setRetentionHours(-1)).rejects.toThrow(/invalid_retention_hours/);
    await expect(setRetentionHours("abc")).rejects.toThrow(/invalid_retention_hours/);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("writes a valid value with merge", async () => {
    const out = await setRetentionHours(36);
    expect(out).toBe(36);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, payload, opts] = mockSetDoc.mock.calls[0];
    expect(payload).toEqual({ retentionHours: 36 });
    expect(opts).toEqual({ merge: true });
  });
});
