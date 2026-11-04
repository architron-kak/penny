import { describe, expect, it } from "vitest";
import { computeInsights } from "../lib/insights";
import { generateSeed, personas } from "../lib/seed";
import type { Transaction } from "../lib/types";
const asOf = new Date("2026-10-25T12:00:00Z");
const tx = (
  id: string,
  amount: number,
  date = "2026-10-02",
  category: Transaction["category"] = "groceries",
): Transaction => ({
  id,
  userId: "student",
  date,
  merchant: "Market",
  description: "groceries",
  amount,
  currency: "USD",
  category,
  source: "synthetic",
});
describe("insights", () => {
  it("sums cents accurately, excludes income, and excludes future transactions", () => {
    const insight = computeInsights(
      [tx("1", 0.1), tx("2", 0.2), tx("3", -500), tx("4", 100, "2026-11-01")],
      [],
      personas[0],
      asOf,
    );
    expect(insight.currentSpend).toBe(0.3);
    expect(insight.income).toBe(500);
    expect(insight.categorySpend.groceries).toBe(0.3);
    expect(insight.categoryRemaining.groceries).toBe(149.7);
  });
  it("compares with previous month and previous five-month average", () => {
    const insight = computeInsights(
      [tx("1", 120), tx("2", 100, "2026-09-02"), tx("3", 50, "2026-08-02")],
      [],
      personas[0],
      asOf,
    );
    expect(insight.changePercent).toBe(20);
    expect(insight.previousSpend).toBe(100);
    expect(insight.averageSpend).toBe(30);
    expect(insight.monthly).toHaveLength(6);
  });
  it("flags inactivity strictly greater than 45 days and preserves pending cancellations as costs", () => {
    const subscriptions = [
      {
        id: "1",
        userId: "student" as const,
        merchant: "Unused",
        monthlyPrice: 10,
        lastUsedDate: "2026-09-09",
        status: "active" as const,
      },
      {
        id: "2",
        userId: "student" as const,
        merchant: "Boundary",
        monthlyPrice: 5,
        lastUsedDate: "2026-09-10",
        status: "active" as const,
      },
    ];
    const insight = computeInsights([], subscriptions, personas[0], asOf);
    expect(insight.unusedSubscriptions.map((s) => s.id)).toEqual(["1"]);
    expect(insight.subscriptionTotal).toBe(15);
    const pending = computeInsights(
      [],
      subscriptions.map((s) => ({ ...s, status: "cancel-suggested" as const })),
      personas[0],
      asOf,
    );
    expect(pending.subscriptionTotal).toBe(15);
    expect(pending.unusedSubscriptions).toHaveLength(0);
  });
  it("handles empty months and January year boundaries", () => {
    const insight = computeInsights(
      [],
      [],
      personas[0],
      new Date("2027-01-05T00:00:00Z"),
    );
    expect(insight.monthly[0].month).toBe("2026-08");
    expect(insight.changePercent).toBe(0);
    expect(insight.budgetRemaining).toBe(850);
  });
  it("produces reproducible six-month histories of 150–250 records per persona", () => {
    const a = generateSeed(asOf);
    expect(a).toEqual(generateSeed(asOf));
    for (const persona of a.personas) {
      const rows = a.transactions.filter((t) => t.userId === persona.id);
      expect(rows.length).toBeGreaterThanOrEqual(150);
      expect(rows.length).toBeLessThanOrEqual(250);
      expect(new Set(rows.map((t) => t.date.slice(0, 7))).size).toBe(6);
    }
  });
});
