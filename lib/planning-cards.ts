import type { HomeCard } from "./types";
import type { PlanningView } from "./planning-types";
import { money } from "./money";
import { openInstallments } from "./planning";
export function planningCards(v: PlanningView): HomeCard[] {
  const cards: HomeCard[] = [];
  if (v.profile.userId === "student" && !v.purchase.missing.length)
    cards.push({
      id: "plan-purchase",
      kind: "PurchaseBudget",
      headline: `Headphones · up to ${money(v.purchase.limit)} · ${v.purchase.days} days to income`,
      priority: 88,
      reason: "Calculated after lunches, bills, outgoing debts and your reserve.",
      topic: "purchase",
    });
  for (const d of v.debts.filter((d) => d.direction === "payable" && d.remaining > 0)) {
    const i = openInstallments(d)[0];
    if (i)
      cards.push({
        id: `plan-debt-${d.id}`,
        kind: "DebtReminder",
        headline: `Repay ${d.person} ${money(i.amount)} by ${i.date}`,
        priority: i.date < v.profile.asOf ? 100 : 94,
        reason:
          i.date < v.profile.asOf
            ? "This debt installment is overdue."
            : "An outgoing debt installment needs a plan.",
        topic: "debts",
        entityId: d.id,
      });
  }
  for (const r of v.refunds.filter((r) => !r.receivedAt))
    cards.push({
      id: `plan-refund-${r.id}`,
      kind: "RefundAlert",
      headline: `Refund ${money(r.amount)} · ${r.overdue ? "overdue" : `expected ${r.dueDate}`}`,
      priority: r.overdue ? 96 : 68,
      reason: "Expected refunds are excluded until you confirm receipt.",
      topic: "refunds",
      entityId: r.id,
    });
  for (const c of v.prices)
    cards.push({
      id: `plan-price-${c.id}`,
      kind: "PriceAlert",
      headline: `${c.merchant} · ${money(c.previous.amount)} → ${money(c.current.amount)}/${c.period === "monthly" ? "mo" : "yr"}`,
      priority: 55,
      reason: "Comparable recurring USD charges increased; the cause is unknown.",
      topic: "price",
      entityId: c.id,
    });
  if (v.profile.userId === "freelancer" && v.delay.delayed.firstShortfall) {
    const short = v.delay.delayed.firstShortfall;
    cards.push({
      id: "plan-delay",
      kind: "IncomeDelay",
      headline: `${v.delay.days}-day delay · ${short.payment} short by ${money(short.amount)}`,
      priority: 100,
      reason: `First shortfall on ${short.date}; original income date is unchanged.`,
      topic: "delay",
    });
  }
  return cards;
}
