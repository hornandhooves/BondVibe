/**
 * businessExpensesService — pure P&L / expense math (Finance honest-null).
 *
 * profitLoss() MUST return marginPct: null when there is no revenue — that is
 * the "—" the Finance / Expenses & P&L screen shows instead of a fabricated %
 * or a NaN. These unit tests pin that honest-null behavior, plus the
 * totals/grouping in expenseSummary and the createExpense payload sanitization.
 */

// Importing the service pulls in ./firebase (Expo/Firebase init) — stub it so
// the module loads under jest.
jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));
// getMyBizId is used as a default arg; keep it deterministic and truthy.
jest.mock("../businessService", () => ({ getMyBizId: () => "biz1" }));
// Stub the Firestore SDK so createExpense can run without a real backend.
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  addDoc: jest.fn(() => Promise.resolve({ id: "exp1" })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => "ts"),
}));

import {
  profitLoss,
  expenseSummary,
  createExpense,
} from "../businessExpensesService";
import { addDoc } from "firebase/firestore";

describe("profitLoss — honest-null margin", () => {
  it("returns null margin when there is no revenue (0/0 → '—', never NaN)", () => {
    expect(profitLoss(0, 0)).toEqual({ revenue: 0, expenses: 0, net: 0, marginPct: null });
  });

  it("returns null margin on a loss with zero revenue (a % is not computable)", () => {
    expect(profitLoss(0, 5000)).toEqual({ revenue: 0, expenses: 5000, net: -5000, marginPct: null });
  });

  it("computes net and margin on real revenue", () => {
    expect(profitLoss(10000, 4000)).toEqual({ revenue: 10000, expenses: 4000, net: 6000, marginPct: 60 });
  });

  it("reports a negative margin when expenses exceed revenue", () => {
    expect(profitLoss(5000, 10000)).toEqual({ revenue: 5000, expenses: 10000, net: -5000, marginPct: -100 });
  });

  it("rounds the margin to a whole percent (2000/3000 → 67)", () => {
    expect(profitLoss(3000, 1000).marginPct).toBe(67);
  });

  it("treats missing args as zero without crashing (still honest-null margin)", () => {
    expect(profitLoss()).toEqual({ revenue: 0, expenses: 0, net: 0, marginPct: null });
  });
});

describe("expenseSummary — totals + breakdown", () => {
  it("is all-zero for an empty range", () => {
    expect(expenseSummary([])).toEqual({ total: 0, byCategory: {}, byMethod: {} });
  });

  it("sums the total and groups by category and by method", () => {
    const out = expenseSummary([
      { amountCents: 1000, category: "rent", method: "cash" },
      { amountCents: 500, category: "rent", method: "transfer" },
      { amountCents: 250, category: "supplies", method: "cash" },
    ]);
    expect(out.total).toBe(1750);
    expect(out.byCategory).toEqual({ rent: 1500, supplies: 250 });
    expect(out.byMethod).toEqual({ cash: 1250, transfer: 500 });
  });

  it("treats a missing amountCents as zero", () => {
    const out = expenseSummary([{ category: "other", method: "cash" }]);
    expect(out.total).toBe(0);
    expect(out.byCategory).toEqual({ other: 0 });
  });
});

describe("createExpense — payload sanitization", () => {
  beforeEach(() => jest.clearAllMocks());

  it("converts pesos to centavos, keeps a valid category/method, trims the note", async () => {
    const res = await createExpense({
      amount: "12.50",
      category: "rent",
      method: "stripe",
      note: "  office  ",
      date: "2026-07-17T00:00:00.000Z",
    });
    const payload = addDoc.mock.calls[0][1];
    expect(payload.amountCents).toBe(1250);
    expect(payload.category).toBe("rent");
    expect(payload.method).toBe("stripe");
    expect(payload.note).toBe("office");
    expect(payload.date).toBe("2026-07-17T00:00:00.000Z");
    expect(res.id).toBe("exp1");
  });

  it("falls back to 'other'/'cash' on unknown values and null for an empty note", async () => {
    await createExpense({ amount: "5", category: "bogus", method: "bitcoin", note: "   " });
    const payload = addDoc.mock.calls[0][1];
    expect(payload.category).toBe("other");
    expect(payload.method).toBe("cash");
    expect(payload.note).toBeNull();
  });

  it("never records a negative amount", async () => {
    await createExpense({ amount: "-99", category: "other", method: "cash" });
    expect(addDoc.mock.calls[0][1].amountCents).toBe(0);
  });
});
