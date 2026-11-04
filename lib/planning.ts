import type { Database, PersonaId } from "./types";
import type {
  CashForecast,
  Debt,
  PlanningView,
  PriceChange,
  PurchaseOptions,
  PurchasePlan,
} from "./planning-types";
import { addDays, ensurePlanning } from "./planning-seed";
import { cents, dollars } from "./money";
export { addDays, ensurePlanning };
export const headphones = [
  { id: "h1", name: "Pocket Buds", price: 25, features: "Demo model · wired in-ear · lightweight" },
  {
    id: "h2",
    name: "Campus Wireless",
    price: 59,
    features: "Demo model · Bluetooth · 30h battery",
  },
  {
    id: "h3",
    name: "Study Over-Ear",
    price: 89,
    features: "Demo model · over-ear · passive isolation",
  },
  {
    id: "h4",
    name: "Focus ANC",
    price: 129,
    features: "Demo model · noise cancellation · 40h battery",
  },
];
export function datesUntil(start: string, end: string, schedule: "daily" | "weekdays" = "daily") {
  const result: string[] = [];
  for (let d = start, n = 0; d < end && n < 366; d = addDays(d, 1), n++) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (schedule === "daily" || (day !== 0 && day !== 6)) result.push(d);
  }
  return result;
}
export function remainingDebt(debt: Debt) {
  return dollars(
    Math.max(0, cents(debt.amount) - debt.repayments.reduce((s, p) => s + cents(p.amount), 0)),
  );
}
export function openInstallments(debt: Debt) {
  let paid = debt.repayments.reduce((s, p) => s + cents(p.amount), 0);
  return [...debt.installments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => {
      const allocated = Math.min(paid, cents(i.amount));
      paid -= allocated;
      return { date: i.date, amount: dollars(cents(i.amount) - allocated) };
    })
    .filter((i) => i.amount > 0);
}
export function purchasePlan(
  db: Database,
  user: PersonaId,
  options: PurchaseOptions = {},
): PurchasePlan {
  const store = ensurePlanning(db),
    p = store.profiles[user];
  const balance = options.balance ?? p.balance,
    reserve = options.reserve ?? p.reserve,
    incomeDate = options.incomeDate ?? p.nextIncome?.date;
  const evidence = db.transactions
    .filter(
      (t) =>
        t.userId === user && t.merchant === p.lunchMerchant && t.amount > 0 && t.date <= p.asOf,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map(({ id, merchant, date, amount, description }) => ({
      id,
      merchant,
      date,
      amount,
      description,
    }));
  const prices = evidence.map((t) => cents(t.amount)).sort((a, b) => a - b);
  const inferredPrice = prices.length ? dollars(prices[Math.floor(prices.length / 2)]) : 0;
  const missing: string[] = [];
  if (balance === null) missing.push("What is your available balance?");
  if (!incomeDate || incomeDate <= p.asOf) missing.push("When is your next income (YYYY-MM-DD)?");
  if (incomeDate && incomeDate > addDays(p.asOf, 180))
    missing.push("Choose an income date within 180 demo days.");
  if (reserve === null) missing.push("How much would you like to keep as a reserve?");
  if (p.lunchMerchant && !evidence.length && options.lunchPrice === undefined)
    missing.push("What does your usual lunch cost?");
  const ambiguous =
    evidence.length > 0 && !evidence.some((t) => /lunch|meal|обед/i.test(t.description));
  if (ambiguous && !p.lunchConfirmed && !options.confirmLunch)
    missing.push(`Are purchases at ${p.lunchMerchant} your usual lunches?`);
  const days = datesUntil(p.asOf, incomeDate || p.asOf);
  const lunchDates = datesUntil(p.asOf, incomeDate || p.asOf, options.schedule || p.lunchSchedule);
  const lunchPrice = options.lunchPrice ?? p.lunchPrice ?? inferredPrice;
  const lunchCost = dollars(cents(lunchPrice) * lunchDates.length);
  // Habit spending is a disjoint non-lunch allowance; category budgets are never subtracted again.
  const otherCost = dollars(cents(p.dailyOther) * days.length);
  const mandatoryCost = dollars(
    p.obligations
      .filter((o) => o.date < (incomeDate || p.asOf))
      .reduce((s, o) => s + cents(o.amount), 0),
  );
  const debtCost = dollars(
    store.debts
      .filter((d) => d.userId === user && d.direction === "payable")
      .flatMap(openInstallments)
      .filter((i) => i.date < (incomeDate || p.asOf))
      .reduce((s, i) => s + cents(i.amount), 0),
  );
  const limit = Math.max(
    0,
    dollars(
      cents(balance || 0) -
        cents(lunchCost) -
        cents(otherCost) -
        cents(mandatoryCost) -
        cents(debtCost) -
        cents(reserve || 0),
    ),
  );
  return {
    missing,
    balance: balance ?? 0,
    days: days.length,
    lunchDates,
    lunchPrice,
    lunchCost,
    otherCost,
    mandatoryCost,
    debtCost,
    reserve: reserve ?? 0,
    limit,
    incomeDate: incomeDate || "",
    evidence,
    candidates: missing.length
      ? []
      : headphones
          .filter((h) => h.price <= limit)
          .map((h) => ({ ...h, remaining: dollars(cents(balance || 0) - cents(h.price)) })),
  };
}
export function forecast(
  db: Database,
  user: PersonaId,
  incomeDate?: string,
  replacement?: { debtId: string; installments: { date: string; amount: number }[] },
  throughDate?: string,
): CashForecast {
  const s = ensurePlanning(db),
    p = s.profiles[user],
    plan = purchasePlan(db, user);
  const income = p.nextIncome,
    payDate = incomeDate || income?.date;
  const end = [
    addDays(p.asOf, 30),
    payDate || p.asOf,
    throughDate || p.asOf,
    ...(replacement?.installments.map((i) => i.date) || []),
    ...p.obligations.map((o) => o.date),
    ...s.debts.filter((d) => d.userId === user).flatMap((d) => d.installments.map((i) => i.date)),
  ]
    .sort()
    .at(-1)!;
  let balance = cents(p.balance || 0);
  const days: CashForecast["days"] = [];
  let firstShortfall: CashForecast["firstShortfall"];
  const debtEvents = s.debts
    .filter((d) => d.userId === user && d.direction === "payable")
    .flatMap((d) =>
      (replacement?.debtId === d.id ? replacement.installments : openInstallments(d)).map((i) => ({
        ...i,
        title: `Repay ${d.person}`,
      })),
    );
  for (const date of datesUntil(p.asOf, addDays(end, 1))) {
    const incoming = date === payDate ? income?.amount || 0 : 0;
    balance += cents(incoming);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const lunch =
      p.lunchSchedule === "daily" || (weekday !== 0 && weekday !== 6) ? plan.lunchPrice : 0;
    const ordinary = cents(lunch) + cents(p.dailyOther);
    balance -= ordinary;
    if (balance < 0 && !firstShortfall)
      firstShortfall = { date, amount: dollars(-balance), payment: "Usual living costs" };
    const payments = [
      ...p.obligations
        .filter((o) => o.date === date || (o.date < p.asOf && date === p.asOf))
        .map((o) => ({ title: o.title, amount: o.amount })),
      ...debtEvents
        .filter((d) => d.date === date || (d.date < p.asOf && date === p.asOf))
        .map((d) => ({ title: d.title, amount: d.amount })),
    ];
    for (const event of payments) {
      balance -= cents(event.amount);
      if (balance < 0 && !firstShortfall)
        firstShortfall = { date, amount: dollars(-balance), payment: event.title };
    }
    days.push({
      date,
      income: incoming,
      ordinary: dollars(ordinary),
      payments,
      balance: dollars(balance),
    });
  }
  return { days, firstShortfall, endBalance: dollars(balance) };
}
export function priceChanges(db: Database, user: PersonaId): PriceChange[] {
  const s = ensurePlanning(db);
  const result: PriceChange[] = [];
  for (const sub of db.subscriptions.filter((x) => x.userId === user)) {
    const charges = db.transactions
      .filter(
        (t) =>
          t.userId === user &&
          t.merchant === sub.merchant &&
          t.amount > 0 &&
          t.currency === "USD" &&
          t.date <= s.profiles[user].asOf &&
          (t.billingPeriod || /monthly|annual/i.test(t.description)),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    const current = charges[0],
      previous = charges.find((t) => t.date.slice(0, 7) !== current?.date.slice(0, 7));
    if (!current || !previous) continue;
    const period =
        current.billingPeriod || (/annual/i.test(current.description) ? "annual" : "monthly"),
      older =
        previous.billingPeriod || (/annual/i.test(previous.description) ? "annual" : "monthly");
    const gap = (Date.parse(current.date) - Date.parse(previous.date)) / 86400000;
    if (
      period !== older ||
      current.amount <= previous.amount ||
      gap < (period === "monthly" ? 20 : 300) ||
      gap > (period === "monthly" ? 40 : 400)
    )
      continue;
    const id = `${sub.id}:${previous.id}:${current.id}`;
    if (!s.acknowledgedPrices.includes(id))
      result.push({
        id,
        subscriptionId: sub.id,
        merchant: sub.merchant,
        previous: { date: previous.date, amount: previous.amount },
        current: { date: current.date, amount: current.amount },
        period,
        annualDifference: dollars(
          (cents(current.amount) - cents(previous.amount)) * (period === "monthly" ? 12 : 1),
        ),
      });
  }
  return result;
}
export function planningView(db: Database, user: PersonaId): PlanningView {
  const s = ensurePlanning(db),
    profile = s.profiles[user];
  return {
    profile,
    purchase: purchasePlan(db, user),
    debts: s.debts
      .filter((d) => d.userId === user)
      .map((d) => ({ ...d, remaining: remainingDebt(d) })),
    refunds: s.refunds
      .filter((r) => r.userId === user)
      .map((r) => {
        const t = db.transactions.find((t) => t.id === r.transactionId);
        return {
          ...r,
          purchase: t ? { merchant: t.merchant, date: t.date, amount: t.amount } : undefined,
          overdue: !r.receivedAt && r.dueDate < profile.asOf,
        };
      }),
    prices: priceChanges(db, user),
    debtForecast: forecast(db, user),
    delay: {
      days: profile.delayDays,
      baseline: forecast(
        db,
        user,
        undefined,
        undefined,
        profile.nextIncome ? addDays(profile.nextIncome.date, profile.delayDays) : undefined,
      ),
      delayed: forecast(
        db,
        user,
        profile.nextIncome ? addDays(profile.nextIncome.date, profile.delayDays) : undefined,
      ),
    },
  };
}
