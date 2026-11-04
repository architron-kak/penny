import {
  categories,
  type Category,
  type Insight,
  type Persona,
  type Subscription,
  type Transaction,
} from "./types";
import { cents, dollars } from "./money";
const empty = () =>
  Object.fromEntries(categories.map((c) => [c, 0])) as Record<Category, number>;
export function computeInsights(
  transactions: Transaction[],
  subscriptions: Subscription[],
  persona: Persona,
  asOf: Date,
): Insight {
  const month = asOf.toISOString().slice(0, 7);
  const date = asOf.toISOString().slice(0, 10);
  const relevant = transactions.filter(
    (t) => t.userId === persona.id && t.date <= date,
  );
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 5 + i, 1),
    );
    const key = d.toISOString().slice(0, 7);
    return {
      month: key,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      amount: dollars(
        relevant
          .filter((t) => t.date.startsWith(key) && t.amount > 0)
          .reduce((sum, t) => sum + cents(t.amount), 0),
      ),
    };
  });
  const current = relevant.filter((t) => t.date.startsWith(month));
  const categoryCents = empty();
  for (const t of current)
    if (t.amount > 0) categoryCents[t.category || "other"] += cents(t.amount);
  const categorySpend = Object.fromEntries(
    categories.map((c) => [c, dollars(categoryCents[c])]),
  ) as Record<Category, number>;
  const categoryRemaining = Object.fromEntries(
    categories.map((c) => [
      c,
      dollars(cents(persona.budgets[c]) - categoryCents[c]),
    ]),
  ) as Record<Category, number>;
  const currentSpend = monthly[5].amount;
  const previousSpend = monthly[4].amount;
  const userSubs = subscriptions.filter((s) => s.userId === persona.id);
  const merchants = new Map<
    string,
    { merchant: string; count: number; total: number; lastDate: string }
  >();
  for (const t of current.filter((t) => t.amount > 0)) {
    const row = merchants.get(t.merchant) || {
      merchant: t.merchant,
      count: 0,
      total: 0,
      lastDate: t.date,
    };
    row.count++;
    row.total += cents(t.amount);
    if (t.date > row.lastDate) row.lastDate = t.date;
    merchants.set(t.merchant, row);
  }
  return {
    month,
    asOf: date,
    currentSpend,
    previousSpend,
    averageSpend: dollars(
      monthly.slice(0, 5).reduce((sum, m) => sum + cents(m.amount), 0) / 5,
    ),
    income: dollars(
      current
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum - cents(t.amount), 0),
    ),
    budgetRemaining: dollars(
      cents(persona.monthlyBudget) - cents(currentSpend),
    ),
    changePercent: previousSpend
      ? Math.round(((currentSpend - previousSpend) / previousSpend) * 100)
      : 0,
    categorySpend,
    categoryRemaining,
    monthly,
    unusedSubscriptions: userSubs.filter(
      (s) =>
        s.status === "active" &&
        (Date.parse(`${date}T12:00:00Z`) -
          Date.parse(`${s.lastUsedDate}T12:00:00Z`)) /
          86400000 >
          45,
    ),
    recurringMerchants: [...merchants.values()]
      .filter((m) => m.count > 1)
      .map((m) => ({ ...m, total: dollars(m.total) }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          b.total - a.total ||
          a.merchant.localeCompare(b.merchant),
      ),
    subscriptionTotal: dollars(
      userSubs.reduce((sum, s) => sum + cents(s.monthlyPrice), 0),
    ),
    transactionCount: current.length,
  };
}
