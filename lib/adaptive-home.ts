import { createHash } from "node:crypto";
import type {
  Database,
  HomeCard,
  Insight,
  Persona,
  PersonaId,
  Suggestion,
  Transaction,
} from "./types";
import type { PlanningView } from "./planning-types";
import { cents, dollars, money } from "./money";
import { addDays } from "./planning-seed";
import { planningCards } from "./planning-cards";

export function weekStart(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function spendingHabits(transactions: Transaction[], user: PersonaId, asOf: string) {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (
      t.userId !== user ||
      t.amount <= 0 ||
      t.currency !== "USD" ||
      t.category === "subscriptions" ||
      t.category === "utilities" ||
      t.billingPeriod ||
      t.date > asOf ||
      t.date < addDays(asOf, -27)
    )
      continue;
    const name = t.merchant.trim();
    const key = name.toLocaleLowerCase("en-US");
    const rows = groups.get(key) || [];
    rows.push(t);
    groups.set(key, rows);
  }
  return [...groups.values()]
    .flatMap((rows) => {
      const recent = rows.filter((t) => t.date >= addDays(asOf, -6));
      const days = new Set(recent.map((t) => t.date)).size;
      // Distinct days prevent a batch of purchases on one day becoming a daily habit.
      if (days < 3) return [];
      recent.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      const amounts = new Map<number, number>();
      for (const t of recent) amounts.set(cents(t.amount), (amounts.get(cents(t.amount)) || 0) + 1);
      const usual = [...amounts].sort(
        (a, b) =>
          b[1] - a[1] ||
          recent.findIndex((t) => cents(t.amount) === a[0]) -
            recent.findIndex((t) => cents(t.amount) === b[0]),
      )[0][0];
      return [
        {
          merchant: recent[0].merchant,
          amount: dollars(usual),
          days,
          count: rows.length,
          lastDate: recent[0].date,
          total: dollars(rows.reduce((s, t) => s + cents(t.amount), 0)),
        },
      ];
    })
    .sort(
      (a, b) =>
        b.days - a.days ||
        b.count - a.count ||
        b.total - a.total ||
        a.merchant.localeCompare(b.merchant),
    );
}

export function habitSuggestion(
  user: PersonaId,
  merchant: string,
  amount: number,
  day: string,
): Suggestion {
  const key = createHash("sha256").update(`${user}:${day}:${merchant}`).digest("hex").slice(0, 24);
  return {
    id: `habit-${key}`,
    userId: user,
    habitMerchant: merchant,
    title: `Usual purchase · ${merchant}`,
    amount,
    status: "proposed",
    createdAt: `${day}T00:00:00Z`,
    description: `Review ${money(amount)} based on your recent repeated purchases. This is a test payment to the configured Penny Sandbox merchant, not a payment to ${merchant}.`,
  };
}

export function currentHabitSuggestions(db: Database, user: PersonaId, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const analysisDate = db.transactions
    .filter((t) => t.userId === user && t.date <= day)
    .reduce((date, t) => (t.date > date ? t.date : date), db.seedDate.slice(0, 10));
  const subscriptions = new Set(
    db.subscriptions.filter((s) => s.userId === user).map((s) => s.merchant),
  );
  return spendingHabits(
    db.transactions.filter((t) => !subscriptions.has(t.merchant)),
    user,
    analysisDate,
  ).map((h) => habitSuggestion(user, h.merchant, h.amount, day));
}

export function adaptiveHome(
  db: Database,
  persona: Persona,
  transactions: Transaction[],
  insights: Insight,
  view: PlanningView,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10),
    week = weekStart(day);
  // Synthetic history stays anchored to its snapshot; newer real transactions advance the window.
  const analysisDate = transactions
    .filter((t) => t.userId === persona.id && t.date <= day)
    .reduce((date, t) => (t.date > date ? t.date : date), db.seedDate.slice(0, 10));
  const subscriptions = new Set(
    db.subscriptions.filter((s) => s.userId === persona.id).map((s) => s.merchant),
  );
  const habits = spendingHabits(
    transactions.filter((t) => !subscriptions.has(t.merchant)),
    persona.id,
    analysisDate,
  );
  db.adaptive ||= {};
  let review = db.adaptive[persona.id];
  if (!review || review.week !== week) {
    review = { week, merchants: habits.slice(0, 2).map((h) => h.merchant) };
    db.adaptive[persona.id] = review;
  }
  // New daily habits appear immediately; the second slot is reviewed as soon as evidence changes.
  const selected = habits.slice(0, 2);
  const ordered = [...selected].sort((a, b) => {
    const ai = review.merchants.indexOf(a.merchant),
      bi = review.merchants.indexOf(b.merchant);
    return (ai < 0 ? 2 : ai) - (bi < 0 ? 2 : bi);
  });
  const cards: HomeCard[] = ordered.map((h, index) => {
    const proposed = habitSuggestion(persona.id, h.merchant, h.amount, day);
    const existing = db.suggestions.find((s) => s.id === proposed.id);
    return {
      id: `habit-card-${h.merchant}`,
      kind: "MerchantShortcut",
      merchant: h.merchant,
      headline: `${h.merchant} · ${money(h.amount)}`,
      priority: 99 - index,
      topic: "merchant",
      entityId: h.merchant,
      reason: `${h.days} separate days in the last seven days; ${h.count} purchases over 28 days. Amount is the most repeated recent charge, not a bill.`,
      payment: existing || proposed,
    };
  });
  const outgoing = view.debts.filter((d) => d.direction === "payable" && d.remaining > 0);
  const incoming = view.debts.filter((d) => d.direction === "receivable" && d.remaining > 0);
  const planning = planningCards(view).sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
  const dueDebt = planning.find((c) => c.kind === "DebtReminder");
  cards.push({
    id: "focus-debts",
    kind: "DebtReminder",
    priority: 90,
    topic: "debts",
    entityId: dueDebt?.entityId,
    headline:
      dueDebt?.headline ||
      `Debts · ${money(dollars(outgoing.reduce((s, d) => s + cents(d.remaining), 0)))} to repay`,
    reason: `${outgoing.length} outgoing debts; ${money(dollars(incoming.reduce((s, d) => s + cents(d.remaining), 0)))} owed to you. ${dueDebt?.reason || "Open to plan dates and repayments."}`,
  });
  cards.push({
    id: "focus-subscriptions",
    kind: "SubscriptionAlert",
    priority: 85,
    topic: "subscriptions",
    headline: `Subscriptions · ${money(insights.subscriptionTotal)}/mo`,
    reason: `${insights.unusedSubscriptions.length} unused for over 45 days. Review before suggesting cancellation.`,
  });
  const goal = view.profile.savingsGoal;
  const left = goal ? dollars(Math.max(0, cents(goal.target) - cents(goal.saved))) : 0;
  cards.push({
    id: "focus-savings",
    kind: "PurchaseBudget",
    priority: 80,
    topic: "savings",
    headline: goal
      ? `${goal.name} · ${money(goal.saved)} / ${money(goal.target)}`
      : "Your savings jar · set a goal",
    supportingText: goal
      ? view.purchase.missing.length
        ? "Complete your budget to check affordability."
        : left <= view.purchase.limit
          ? "Enough available after essentials to finish this goal."
          : `${money(Math.max(0, left - view.purchase.limit))} more needed after essentials.`
      : "What are you saving for?",
    reason: goal
      ? `${money(left)} left. ${view.purchase.missing.length ? "Complete your budget to check affordability." : left <= view.purchase.limit ? "The remaining goal fits your available budget after essentials." : `Available after essentials: ${money(view.purchase.limit)}; keep saving.`} Saved funds must already be excluded from your available balance.`
      : "Choose what you are saving for, a target and money already set aside. No transfer is made.",
  });
  cards.push({
    id: "focus-cash",
    kind: "SpendingSummary",
    priority: 75,
    topic: "overview",
    headline: `Cash flow · ${money(insights.income)} in / ${money(insights.currentSpend)} out`,
    reason: `${money(insights.budgetRemaining)} monthly budget remaining. ${view.debtForecast.firstShortfall ? `Forecast shortfall on ${view.debtForecast.firstShortfall.date}.` : "Scheduled payments fit the current forecast."}`,
  });
  const extra = planning.find((c) => c.kind !== "PurchaseBudget" && c.kind !== "DebtReminder");
  cards.push(
    extra || {
      id: "focus-week",
      kind: "CategoryBudget",
      priority: 60,
      topic: "overview",
      headline: view.purchase.missing.length
        ? "Complete your cash forecast"
        : `Until income · ${money(view.purchase.limit)} after essentials`,
      reason: view.purchase.missing.length
        ? "Complete your planning assumptions before relying on this forecast."
        : "Lunches, bills, outgoing debts and reserve are included. Expected refunds are excluded.",
    },
  );
  return {
    cards: cards.slice(0, 7),
    metadata: { reviewedWeek: review.week, nextReview: addDays(week, 7), analysisDate },
  };
}
