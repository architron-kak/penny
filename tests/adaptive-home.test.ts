import { describe, it, expect } from "vitest";
import { adaptiveHome, spendingHabits, currentHabitSuggestions } from "../lib/adaptive-home";
import { generateSeed } from "../lib/seed";
import { computeInsights } from "../lib/insights";
import { planningView } from "../lib/planning";
import { applyPlanningCommand, commandSchema } from "../lib/planning-actions";
import type { Transaction } from "../lib/types";
const now = new Date("2026-11-05T12:00:00Z");
function fixture() {
  const db = generateSeed(now);
  db.transactions = [];
  for (const [merchant, amount] of [
    ["Lunch", 5],
    ["Coffee", 3],
  ] as const)
    for (let day = 1; day <= 5; day++)
      db.transactions.push({
        id: `${merchant}-${day}`,
        userId: "student",
        merchant,
        description: "Daily purchase",
        date: `2026-11-0${day}`,
        amount,
        currency: "USD",
        category: "food & coffee",
        source: "synthetic",
      });
  return db;
}
function home(db = fixture(), date = now) {
  const persona = db.personas[0];
  return adaptiveHome(
    db,
    persona,
    db.transactions,
    computeInsights(db.transactions, db.subscriptions, persona, now),
    planningView(db, persona.id),
    date,
  );
}
describe("seven-card adaptive home", () => {
  it("puts two evidence-based payment shortcuts before four essentials and one useful insight", () => {
    const result = home();
    expect(result.cards).toHaveLength(7);
    expect(result.cards.slice(0, 2).every((c) => c.payment)).toBe(true);
    expect(result.cards.slice(2, 6).map((c) => c.id)).toEqual([
      "focus-debts",
      "focus-subscriptions",
      "focus-savings",
      "focus-cash",
    ]);
    expect(result.cards[0].payment?.amount).toBe(5);
  });
  it("requires separate recent days and ignores income, subscriptions, future and stale charges", () => {
    const db = fixture();
    const base = db.transactions[0];
    const rejected: Transaction[] = [
      ...Array.from({ length: 10 }, (_, i) => ({
        ...base,
        id: `batch-${i}`,
        merchant: "Batch",
        date: "2026-11-05",
      })),
      ...db.transactions.map((t) => ({ ...t, merchant: "Income", amount: -5 })),
      ...db.transactions.map((t) => ({
        ...t,
        merchant: "Subscription",
        category: "subscriptions" as const,
      })),
      ...db.transactions.map((t) => ({ ...t, merchant: "Future", date: "2026-12-01" })),
      ...db.transactions.map((t) => ({ ...t, merchant: "Old", date: "2026-09-01" })),
    ];
    expect(spendingHabits(rejected, "student", "2026-11-05")).toEqual([]);
  });
  it("uses the most repeated amount rather than a purchase total or an outlier", () => {
    const db = fixture();
    db.transactions.push({ ...db.transactions[0], id: "outlier", date: "2026-11-05", amount: 80 });
    expect(
      currentHabitSuggestions(db, "student", now).find((s) => s.habitMerchant === "Lunch")?.amount,
    ).toBe(5);
  });
  it("persists a Monday review and refreshes it on the next weekly visit without a cron process", () => {
    const db = fixture();
    home(db);
    expect(db.adaptive?.student?.week).toBe("2026-11-02");
    const result = home(db, new Date("2026-11-09T00:00:00Z"));
    expect(db.adaptive?.student?.week).toBe("2026-11-09");
    expect(result.metadata.nextReview).toBe("2026-11-16");
  });
  it("shows a newly established daily habit immediately and caps the result even with many alerts", () => {
    const db = fixture();
    home(db);
    for (let i = 0; i < 8; i++)
      db.transactions.push({
        ...db.transactions[0],
        id: `new-${i}`,
        merchant: "New habit",
        date: `2026-11-0${1 + (i % 5)}`,
      });
    const result = home(db);
    expect(result.cards.some((c) => c.merchant === "New habit")).toBe(true);
    expect(result.cards).toHaveLength(7);
  });
  it("never invents payment shortcuts when history is insufficient", () => {
    const db = fixture();
    db.transactions = [];
    expect(home(db).cards.filter((c) => c.payment)).toHaveLength(0);
    expect(db.suggestions.some((s) => s.habitMerchant)).toBe(false);
  });
  it("changes payment identity daily and retains paid state for the same day", () => {
    const db = fixture();
    const suggestion = currentHabitSuggestions(db, "student", now)[0];
    db.suggestions.push({ ...suggestion, status: "paid" });
    expect(home(db).cards.find((c) => c.payment?.id === suggestion.id)?.payment?.status).toBe(
      "paid",
    );
    expect(currentHabitSuggestions(db, "student", new Date("2026-11-06T12:00:00Z"))[0].id).not.toBe(
      suggestion.id,
    );
  });
  it("saves a validated savings goal without moving money and reflects it in the card", () => {
    const db = fixture();
    const balance = planningView(db, "student").profile.balance;
    const command = commandSchema.parse({
      type: "savings-save",
      name: "A trip",
      target: 300,
      saved: 40,
    });
    applyPlanningCommand(db, "student", command, "goal-1");
    expect(planningView(db, "student").profile.balance).toBe(balance);
    expect(home(db).cards.find((c) => c.id === "focus-savings")?.headline).toContain(
      "$40.00 / $300.00",
    );
    expect(() =>
      applyPlanningCommand(
        db,
        "student",
        { type: "savings-save", name: "Wrong", target: 10, saved: 20 },
        "goal-2",
      ),
    ).toThrow();
  });
});
