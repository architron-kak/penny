import type { HomeCard, Insight, Persona, Suggestion } from "./types";
import { money } from "./money";
export function rankCards(
  insights: Insight,
  persona: Persona,
  suggestions: Suggestion[],
): HomeCard[] {
  const cards: HomeCard[] = [
    {
      id: "summary",
      kind: "SpendingSummary",
      priority: 60,
      reason: `Your monthly overview brings ${insights.transactionCount} transactions together.`,
    },
  ];
  const topCategory = (
    Object.keys(
      insights.categorySpend,
    ) as (keyof typeof insights.categorySpend)[]
  ).sort(
    (a, b) =>
      insights.categorySpend[b] / persona.budgets[b] -
        insights.categorySpend[a] / persona.budgets[a] || a.localeCompare(b),
  )[0];
  const ratio =
    insights.categorySpend[topCategory] / persona.budgets[topCategory];
  cards.push({
    id: "budget",
    kind: "CategoryBudget",
    category: topCategory,
    priority: Math.min(99, Math.round(48 + ratio * 34)),
    reason: `${Math.round(ratio * 100)}% of your ${topCategory} budget is used; ${money(Math.max(0, insights.categoryRemaining[topCategory]))} remains.`,
  });
  if (insights.unusedSubscriptions.length)
    cards.push({
      id: "subscriptions",
      kind: "SubscriptionAlert",
      priority: Math.min(98, 72 + insights.unusedSubscriptions.length * 6),
      reason: `${insights.unusedSubscriptions.length} subscriptions have not been used in over 45 days.`,
    });
  else
    cards.push({
      id: "subscriptions",
      kind: "SubscriptionAlert",
      priority: 35,
      reason: "Your active subscriptions have been used in the last 45 days.",
    });
  const suggestion = suggestions.find(
    (s) =>
      s.userId === persona.id &&
      (s.status === "proposed" || s.status === "approved"),
  );
  if (suggestion)
    cards.push({
      id: `payment-${suggestion.id}`,
      kind: "SuggestedPayment",
      suggestionId: suggestion.id,
      priority: Math.min(
        92,
        Math.round(
          50 +
            suggestion.amount / 4 +
            Math.min(
              12,
              (insights.categorySpend.groceries / persona.budgets.groceries) *
                4,
            ),
        ),
      ),
      reason:
        "A prepared Sandbox payment is waiting for your explicit approval.",
    });
  const merchant = insights.recurringMerchants[0];
  if (merchant) {
    const age = Math.max(
      0,
      (Date.parse(insights.asOf) - Date.parse(merchant.lastDate)) / 86400000,
    );
    cards.push({
      id: "merchant",
      kind: "MerchantShortcut",
      merchant: merchant.merchant,
      priority: Math.min(
        95,
        Math.round(
          42 +
            merchant.count * 3 +
            Math.min(merchant.total / 100, 10) +
            Math.max(0, 10 - age),
        ),
      ),
      reason: `${merchant.count} visits to ${merchant.merchant} this month, totalling ${money(merchant.total)}.`,
    });
  }
  return cards.sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
}
