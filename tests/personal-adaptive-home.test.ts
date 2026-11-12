import { describe, it, expect } from "vitest";
import { personalAdaptiveHome } from "../lib/private/adaptive-home";
import { upgradeDollarDemos } from "../lib/private/demo-migration";
import { emptyPrivateState } from "../lib/private/store";
import type { AccountView, EntryView, PrivateUser } from "../lib/private/types";
const day = "2026-11-13",
  user = (): PrivateUser => ({
    id: "me",
    name: "Me",
    email: "me@example.test",
    passwordHash: "hash",
    timeZone: "Asia/Almaty",
    createdAt: day,
  });
const account = (
  id = "bank",
  currency: AccountView["currency"] = "USD",
  kind: AccountView["kind"] = "bank",
  balance = 50000,
): AccountView => ({
  id,
  currency,
  kind,
  name: id,
  openingMinor: balance,
  balanceMinor: balance,
  createdAt: day,
});
const row = (name: string, n: number, amount = 450, accountId = "bank"): EntryView => ({
  id: name + n,
  accountId,
  kind: "expense",
  amountMinor: amount,
  currency: "USD",
  description: name,
  category: "food & coffee",
  date: `2026-11-${String(n).padStart(2, "0")}`,
  createdAt: `2026-11-${n}T12:00:00Z`,
  draftId: name + n,
  source: "manual",
});
const fixtures = () => [8, 10, 12].flatMap((n) => [row("Coffee", n), row("Groceries", n, 2450)]);
describe("personal Adaptive Home", () => {
  it("shows up to seven cards, two habits before the four essentials and insight", () => {
    const h = personalAdaptiveHome(user(), [account()], fixtures(), "USD", day);
    expect(h.cards).toHaveLength(7);
    expect(h.cards.slice(0, 2).every((c) => c.kind === "habit")).toBe(true);
    expect(h.cards.slice(2).map((c) => c.id)).toEqual([
      "debts",
      "subscriptions",
      "savings",
      "cashflow",
      "insight",
    ]);
    expect(h.reviewedWeek).toBe("2026-11-09");
    expect(h.nextReview).toBe("2026-11-16");
  });
  it("selects the most frequent amount rather than total or latest outlier", () => {
    const rows = [row("Coffee", 8), row("Coffee", 10), row("Coffee", 12), row("Coffee", 13, 9900)];
    const h = personalAdaptiveHome(user(), [account()], rows, "USD", day);
    expect(h.cards[0].entry?.amountMinor).toBe(450);
    expect(h.cards[0].entry?.description).toBe("Coffee");
  });
  it("ignores same-day batches, voided, stale, future, income and bills", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ ...row("Batch", 12), id: "batch" + i }));
    for (const e of fixtures())
      rows.push(
        { ...e, voidedAt: day },
        { ...e, description: "Future", date: "2026-12-01" },
        { ...e, description: "Old", date: "2026-10-01" },
        { ...e, description: "Salary", kind: "income" },
        { ...e, description: "Bill", category: "utilities" },
      );
    const h = personalAdaptiveHome(user(), [account()], rows, "USD", day);
    expect(h.cards.filter((c) => c.kind === "habit")).toHaveLength(0);
    expect(h.cards).toHaveLength(5);
  });
  it("never merges currencies or accounts with the same description", () => {
    const rows = [
      row("Coffee", 8),
      row("Coffee", 10),
      { ...row("Coffee", 12), currency: "EUR" as const },
      row("Coffee", 12, 450, "other-bank"),
    ];
    const h = personalAdaptiveHome(user(), [account(), account("other-bank")], rows, "USD", day);
    expect(h.cards.some((c) => c.kind === "habit")).toBe(false);
    expect(personalAdaptiveHome(user(), [], fixtures(), "USD", day).cards[0].kind).toBe(
      "onboarding",
    );
  });
  it("persists weekly preferences while new evidence updates immediately", () => {
    const u = user(),
      rows = fixtures();
    personalAdaptiveHome(u, [account()], rows, "USD", day);
    const initial = structuredClone(u.adaptive);
    const more = [...rows, ...[7, 9, 11, 13].map((n) => row("New", n, 1000))];
    const h = personalAdaptiveHome(u, [account()], more, "USD", day);
    expect(h.cards.some((c) => c.title === "New")).toBe(true);
    expect(u.adaptive).toEqual(initial);
    const next = personalAdaptiveHome(u, [account()], more, "USD", "2026-11-16");
    expect(next.reviewedWeek).toBe("2026-11-16");
    expect(next.nextReview).toBe("2026-11-23");
  });
  it("uses savings account balances, excludes them and debts from spendable money", () => {
    const u = user();
    u.homePlan = { USD: { debtMinor: 2000, goalName: "Trip", goalTargetMinor: 10000 } };
    const h = personalAdaptiveHome(
      u,
      [account("bank", "USD", "bank", 10000), account("jar", "USD", "savings", 5000)],
      [row("Lunch", 12, 1500)],
      "USD",
      day,
    );
    const savings = h.cards.find((c) => c.kind === "savings")!;
    expect(savings.title).toBe("Trip");
    expect(savings.progress).toBe(50);
    expect(h.cards.at(-1)?.value).toContain("80.00");
    expect(h.cards.find((c) => c.kind === "cashflow")?.value).toContain("15.00");
  });
  it("prioritizes a negative-balance alert and excludes voided subscriptions", () => {
    const entries = [
      { ...row("Music", 12, 999), category: "subscriptions" as const },
      { ...row("Music", 10, 999), category: "subscriptions" as const, voidedAt: day },
    ];
    const h = personalAdaptiveHome(
      user(),
      [account("bank", "USD", "bank", -1000)],
      entries,
      "USD",
      day,
    );
    expect(h.cards.at(-1)?.urgent).toBe(true);
    expect(h.cards.at(-1)?.value).toBe("Negative balance");
    expect(h.cards.find((c) => c.kind === "subscriptions")?.value).toContain("9.99");
  });
});
describe("USD demo upgrade", () => {
  it("updates only fictional accounts once, preserves IDs and invalidates stale reviews", () => {
    const s = emptyPrivateState(),
      real = user(),
      demo = { ...user(), id: "demo", demoProfile: "student" as const };
    s.users.push(real, demo);
    const a = { ...account("legacy", "KZT"), ownerId: "demo", openingMinor: 500000 };
    const actual = { ...account("real", "KZT"), ownerId: "me" };
    s.accounts.push(a, actual);
    s.entries.push({ ...row("Coffee", 12, 4500, "legacy"), currency: "KZT", ownerId: "demo" });
    s.drafts.push({
      ...s.entries[0],
      id: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      mode: "rules",
    });
    const realBefore = JSON.stringify(actual);
    upgradeDollarDemos(s);
    expect(a.id).toBe("legacy");
    expect(a.currency).toBe("USD");
    expect(a.openingMinor).toBe(1000);
    expect(s.entries[0].amountMinor).toBe(9);
    expect(s.entries[0].currency).toBe("USD");
    expect(s.drafts).toHaveLength(0);
    expect(JSON.stringify(actual)).toBe(realBefore);
    const snapshot = JSON.stringify(s);
    upgradeDollarDemos(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
