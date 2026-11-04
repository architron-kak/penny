import { describe, expect, it } from "vitest";
import { generateSeed } from "../lib/seed";
import { classifyByRules } from "../lib/classify";
import { computeInsights } from "../lib/insights";
import { rankCards } from "../lib/ranking";
const db = generateSeed(new Date("2026-10-25T12:00:00Z"));
function ranked(index: number) {
  const p = db.personas[index];
  const tx = db.transactions.map((t) => ({
    ...t,
    category: classifyByRules(t.merchant, t.description),
  }));
  const insight = computeInsights(
    tx,
    db.subscriptions,
    p,
    new Date(db.seedDate),
  );
  return { cards: rankCards(insight, p, db.suggestions), insight, p };
}
describe("adaptive ranking", () => {
  it("orders scores deterministically in descending order", () => {
    const { cards, insight, p } = ranked(0);
    expect(cards).toEqual(rankCards(insight, p, db.suggestions));
    expect(cards.map((c) => c.priority)).toEqual(
      cards.map((c) => c.priority).sort((a, b) => b - a),
    );
    expect(
      cards.every((c) => c.priority >= 0 && c.priority <= 100 && !!c.reason),
    ).toBe(true);
  });
  it("visibly changes card order between personas", () => {
    const orders = db.personas.map((_, index) =>
      ranked(index)
        .cards.map((c) => c.kind)
        .join(","),
    );
    expect(new Set(orders).size).toBeGreaterThan(1);
  });
  it("increases urgency when a budget is exhausted", () => {
    const { insight, p } = ranked(0);
    const low = rankCards(
      {
        ...insight,
        categorySpend: { ...insight.categorySpend, "food & coffee": 0 },
      },
      p,
      [],
    ).find((c) => c.kind === "CategoryBudget")!.priority;
    const high = rankCards(
      {
        ...insight,
        categorySpend: { ...insight.categorySpend, "food & coffee": 10000 },
      },
      p,
      [],
    ).find((c) => c.kind === "CategoryBudget")!.priority;
    expect(high).toBeGreaterThan(low);
  });
  it("never shows resolved suggestions or another persona's suggestion", () => {
    const { insight, p } = ranked(0);
    expect(
      rankCards(
        insight,
        p,
        db.suggestions.map((s) => ({ ...s, status: "dismissed" as const })),
      ).some((c) => c.kind === "SuggestedPayment"),
    ).toBe(false);
    expect(
      rankCards(
        insight,
        p,
        db.suggestions.filter((s) => s.userId !== p.id),
      ).some((c) => c.kind === "SuggestedPayment"),
    ).toBe(false);
  });
});
