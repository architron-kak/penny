import type {
  PrivateState,
  PrivateUser,
  EntryView,
  Currency,
  MonthlyPoint,
  SubscriptionView,
  FinanceOverview,
} from "./types";
import { currencies } from "./types";
import { sumMinor } from "./arithmetic";
export function workspaceViews(
  s: PrivateState,
  user: PrivateUser,
  entries: EntryView[],
  day: string,
) {
  const month = day.slice(0, 7),
    now = new Date(day + "T12:00:00Z");
  const months = Array.from({ length: 6 }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1))
      .toISOString()
      .slice(0, 7),
  );
  const active = entries.filter((e) => !e.voidedAt && e.date <= day);
  const analytics = Object.fromEntries(
    currencies.map((currency) => {
      const rows = active.filter((e) => e.currency === currency);
      const monthly: MonthlyPoint[] = months.map((m) => ({
        month: m,
        incomeMinor: sumMinor(
          rows.filter((e) => e.date.startsWith(m) && e.kind === "income").map((e) => e.amountMinor),
        ),
        expenseMinor: sumMinor(
          rows
            .filter((e) => e.date.startsWith(m) && e.kind === "expense")
            .map((e) => e.amountMinor),
        ),
      }));
      const current = monthly.at(-1)!.expenseMinor,
        previousSpendMinor = monthly.at(-2)!.expenseMinor;
      const byCategory = new Map<EntryView["category"], number[]>();
      for (const e of rows.filter((e) => e.date.startsWith(month) && e.kind === "expense")) {
        const values = byCategory.get(e.category) || [];
        values.push(e.amountMinor);
        byCategory.set(e.category, values);
      }
      return [
        currency,
        {
          monthly,
          previousSpendMinor,
          changePercent: previousSpendMinor
            ? Math.round(((current - previousSpendMinor) / previousSpendMinor) * 100)
            : null,
          categories: [...byCategory]
            .map(([category, values]) => ({ category, amountMinor: sumMinor(values) }))
            .sort((a, b) => b.amountMinor - a.amountMinor),
        },
      ];
    }),
  ) as FinanceOverview["analytics"];
  const groups = new Map<string, EntryView[]>();
  for (const e of active.filter((e) => e.kind === "expense" && e.category === "subscriptions")) {
    const key = `${e.currency}:${e.description.trim().toLowerCase()}`;
    const group = groups.get(key) || [];
    group.push(e);
    groups.set(key, group);
  }
  const subscriptions: SubscriptionView[] = [...groups].map(([key, rows]) => {
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return {
      key,
      name: rows[0].description,
      currency: rows[0].currency as Currency,
      amountMinor: rows[0].amountMinor,
      monthMinor: sumMinor(rows.filter((e) => e.date.startsWith(month)).map((e) => e.amountMinor)),
      lastDate: rows[0].date,
      count: rows.length,
      reviewRequested: !!user.subscriptionReviews?.includes(key),
    };
  });
  const stripOwner = <T extends { ownerId: string }>(value: T): Omit<T, "ownerId"> => {
    const { ownerId: _owner, ...view } = value;
    void _owner;
    return view;
  };
  const payments = (s.payments || [])
    .filter((p) => p.ownerId === user.id)
    .map(stripOwner)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activity = (s.activity || []).filter((a) => a.ownerId === user.id).map(stripOwner);
  const fallback = entries.flatMap((e) => [
    {
      id: "entry-" + e.id,
      title: e.kind === "income" ? "Income recorded" : "Expense recorded",
      detail: e.description,
      kind: "record" as const,
      createdAt: e.createdAt,
    },
    ...(e.voidedAt
      ? [
          {
            id: "void-" + e.id,
            title: "Entry voided",
            detail: e.description,
            kind: "record" as const,
            createdAt: e.voidedAt,
          },
        ]
      : []),
  ]);
  return {
    analytics,
    subscriptions,
    payments,
    activity: [...activity, ...fallback]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100),
    paypalConfigured: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
  };
}
