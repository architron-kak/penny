import { HttpError } from "../http";
import { formatCurrency } from "../currency";
import type {
  AccountView,
  Currency,
  EntryView,
  HomePlan,
  PersonalHome,
  PersonalHomeCard,
  PrivateUser,
} from "./types";

const addDays = (day: string, n: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const money = formatCurrency;
const sum = (values: number[]) => {
  const total = values.reduce((s, n) => s + BigInt(n), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER))
    throw new HttpError(409, "The total exceeds the supported range.");
  return Number(total);
};
export const emptyHomePlan = (): HomePlan => ({ debtMinor: 0, goalName: "", goalTargetMinor: 0 });

export function personalAdaptiveHome(
  user: PrivateUser,
  accounts: AccountView[],
  entries: EntryView[],
  currency: Currency,
  day: string,
): PersonalHome {
  const relevant = accounts.filter((a) => a.currency === currency),
    owned = new Set(relevant.map((a) => a.id));
  const active = entries.filter(
    (e) => owned.has(e.accountId) && e.currency === currency && !e.voidedAt && e.date <= day,
  );
  const weekday = new Date(day + "T12:00:00Z").getUTCDay(),
    week = addDays(day, -((weekday + 6) % 7));
  const groups = new Map<string, EntryView[]>();
  for (const e of active) {
    if (
      e.kind !== "expense" ||
      e.amountMinor <= 0 ||
      e.date < addDays(day, -27) ||
      e.category === "subscriptions" ||
      e.category === "utilities"
    )
      continue;
    const key = `${e.accountId}:${e.description.trim().toLocaleLowerCase("ru")}`;
    const rows = groups.get(key) || [];
    rows.push(e);
    groups.set(key, rows);
  }
  const habits = [...groups]
    .flatMap(([key, rows]) => {
      const recent = rows
        .filter((e) => e.date >= addDays(day, -6))
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.createdAt.localeCompare(a.createdAt) ||
            a.id.localeCompare(b.id),
        );
      const days = new Set(recent.map((e) => e.date)).size;
      if (days < 3) return [];
      const amounts = new Map<number, number>();
      for (const e of recent) amounts.set(e.amountMinor, (amounts.get(e.amountMinor) || 0) + 1);
      const amount = [...amounts].sort(
        (a, b) =>
          b[1] - a[1] ||
          recent.findIndex((e) => e.amountMinor === a[0]) -
            recent.findIndex((e) => e.amountMinor === b[0]),
      )[0][0];
      return [
        {
          key,
          days,
          count: rows.length,
          total: sum(rows.map((e) => e.amountMinor)),
          entry: recent.find((e) => e.amountMinor === amount)!,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.days - a.days || b.count - a.count || b.total - a.total || a.key.localeCompare(b.key),
    );
  user.adaptive ||= {};
  let review = user.adaptive[currency];
  if (!review || review.week !== week)
    user.adaptive[currency] = review = { week, habits: habits.slice(0, 2).map((h) => h.key) };
  const plan = user.homePlan?.[currency] || emptyHomePlan();
  const metadata = {
    reviewedWeek: review.week,
    nextReview: addDays(week, 7),
    analysisDate: day,
    plan,
  };
  if (!relevant.length)
    return {
      ...metadata,
      cards: [
        {
          id: "first-account",
          kind: "onboarding",
          title: "Your Adaptive Home",
          value: `Start with an account in ${currency}`,
          description:
            "Add an account and transactions. Your cards will adapt to your data and habits.",
          action: "new-account",
          actionLabel: "Create account",
        },
      ],
    };
  const selected = habits.slice(0, 2).sort((a, b) => {
    const rank = (key: string) => {
      const i = review.habits.indexOf(key);
      return i < 0 ? 2 : i;
    };
    return rank(a.key) - rank(b.key);
  });
  const cards: PersonalHomeCard[] = selected.map((h) => ({
    id: "habit-" + h.key,
    kind: "habit",
    title: h.entry.description,
    value: money(h.entry.amountMinor, currency),
    description: `${h.days} different days in the last 7 days. Your most frequent purchase amount.`,
    action: "repeat",
    actionLabel: "Repeat expense",
    entry: h.entry,
  }));
  const month = day.slice(0, 7),
    monthly = active.filter((e) => e.date.startsWith(month));
  const income = sum(monthly.filter((e) => e.kind === "income").map((e) => e.amountMinor));
  const expenses = sum(monthly.filter((e) => e.kind === "expense").map((e) => e.amountMinor));
  const subscriptions = monthly.filter(
    (e) => e.kind === "expense" && e.category === "subscriptions",
  );
  const saved = sum(relevant.filter((a) => a.kind === "savings").map((a) => a.balanceMinor));
  const liquid = sum(relevant.filter((a) => a.kind !== "savings").map((a) => a.balanceMinor));
  const goalLeft = Math.max(0, plan.goalTargetMinor - saved),
    spendable = Math.max(0, liquid - plan.debtMinor);
  cards.push(
    {
      id: "debts",
      kind: "debts",
      title: "Debts",
      value: user.homePlan?.[currency]
        ? money(plan.debtMinor, currency)
        : "Add your outstanding debt",
      description: user.homePlan?.[currency]
        ? "The outstanding amount you entered. It is not automatically deducted from your accounts."
        : "Add your obligations to include them in your insights.",
      action: "plan",
      actionLabel: "Set obligations",
      urgent: plan.debtMinor > Math.max(0, liquid),
    },
    {
      id: "subscriptions",
      kind: "subscriptions",
      title: "Subscriptions",
      value: money(sum(subscriptions.map((e) => e.amountMinor)), currency),
      description: subscriptions.length
        ? `${subscriptions.length} ${subscriptions.length === 1 ? "record" : "records"} this month. Recorded expenses, not a future bill.`
        : "No expenses categorized as subscriptions this month.",
      action: "subscriptions",
      actionLabel: "View records",
    },
    {
      id: "savings",
      kind: "savings",
      title: plan.goalName || "Savings jar",
      value: plan.goalTargetMinor
        ? `${money(saved, currency)} / ${money(plan.goalTargetMinor, currency)}`
        : money(saved, currency),
      description: !plan.goalTargetMinor
        ? "Money in savings accounts. Choose a savings goal."
        : goalLeft === 0
          ? "Your savings-account balance has reached the goal."
          : `Remaining: ${money(goalLeft, currency)}. ${goalLeft <= spendable ? "Your current balance after stated debts covers this amount; future expenses are excluded." : "Keep building your savings balance."}`,
      action: "plan",
      actionLabel: "Set savings goal",
      progress: plan.goalTargetMinor
        ? Math.max(0, Math.min(100, (saved / plan.goalTargetMinor) * 100))
        : undefined,
    },
    {
      id: "cashflow",
      kind: "cashflow",
      title: "Cash flow",
      value: money(sum([income, -expenses]), currency),
      description: `This month: ${money(income, currency)} income and ${money(expenses, currency)} expenses. Opening balances are excluded from income.`,
      action: "entries",
      actionLabel: "All transactions",
    },
  );
  let insight: PersonalHomeCard = {
    id: "insight",
    kind: "insight",
    title: "Your next step",
    value: "Add your first transaction",
    description: "Tell pennybot about an expense. Your cards update after you confirm it.",
    action: "entries",
    actionLabel: "Open transactions",
  };
  const negative = relevant.filter((a) => a.balanceMinor < 0);
  const recent = active.filter((e) => e.kind === "expense" && e.date >= addDays(day, -6));
  const previous = active.filter(
    (e) => e.kind === "expense" && e.date < addDays(day, -6) && e.date >= addDays(day, -13),
  );
  if (negative.length)
    insight = {
      ...insight,
      title: "Needs attention",
      value: "Negative balance",
      description: `${negative.length} accounts are below zero. Review their entries and opening balances.`,
      action: "accounts",
      actionLabel: "Review accounts",
      urgent: true,
    };
  else if (plan.debtMinor > liquid)
    insight = {
      ...insight,
      title: "Obligations and balance",
      value: `Shortfall: ${money(plan.debtMinor - liquid, currency)}`,
      description:
        "Your stated outstanding debt exceeds money in spending accounts. Payment due dates are not included yet.",
      action: "plan",
      actionLabel: "Review obligations",
      urgent: true,
    };
  else if (
    new Set(recent.map((e) => e.date)).size >= 3 &&
    new Set(previous.map((e) => e.date)).size >= 3
  ) {
    const a = sum(recent.map((e) => e.amountMinor)),
      b = sum(previous.map((e) => e.amountMinor));
    insight = {
      ...insight,
      title: "Weekly spending",
      value:
        a === b
          ? "Same as last week"
          : `${a > b ? "Up" : "Down"} by ${money(Math.abs(a - b), currency)}`,
      description:
        "The last 7 calendar days compared with the previous 7, using saved transactions only.",
      actionLabel: "Explore expenses",
    };
  } else if (active.length)
    insight = {
      ...insight,
      title: "Available after obligations",
      value: money(spendable, currency),
      description: `Spending accounts: ${money(liquid, currency)}. Savings and stated debts are excluded. This is not a forecast of future expenses.`,
      action: "accounts",
      actionLabel: "View accounts",
    };
  cards.push(insight);
  return { ...metadata, cards: cards.slice(0, 7) };
}
