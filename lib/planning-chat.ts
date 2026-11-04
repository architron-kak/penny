import type { Database, PersonaId } from "./types";
import type { ChatContext, ChatReply, PurchaseOptions } from "./planning-types";
import {
  addDays,
  ensurePlanning,
  forecast,
  openInstallments,
  planningView,
  purchasePlan,
} from "./planning";
import { money, cents, dollars } from "./money";
const amountIn = (text: string) => {
  const m = text.match(
    /\$\s*(\d+(?:[.,]\d{1,2})?)|(?:USD|amount|сумм[ауы])\s*(\d+(?:[.,]\d{1,2})?)/i,
  );
  return m ? Number((m[1] || m[2]).replace(",", ".")) : undefined;
};
const nameKey = (s: string) =>
  s.toLowerCase().replace(/али/g, "ali").replace(/мина/g, "mina").trim();
const dateIn = (text: string, day: string, income?: string) => {
  const exact = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (
    exact &&
    !Number.isNaN(Date.parse(exact)) &&
    new Date(exact).toISOString().slice(0, 10) === exact
  )
    return exact;
  if (/friday|пятниц/i.test(text)) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    return addDays(day, (5 - weekday + 7) % 7);
  }
  if (/after.*(?:income|scholarship)|после.*(?:стипенд|доход)/i.test(text) && income)
    return addDays(income, 1);
  return undefined;
};
const shortfall = (f: ReturnType<typeof forecast>) =>
  f.firstShortfall
    ? `First shortfall: ${money(f.firstShortfall.amount)} on ${f.firstShortfall.date} for ${f.firstShortfall.payment}.`
    : `All scheduled payments fit the forecast. End balance: ${money(f.endBalance)}.`;
export function planningChat(
  db: Database,
  user: PersonaId,
  message: string,
  context?: ChatContext,
): ChatReply | undefined {
  ensurePlanning(db);
  const view = planningView(db, user),
    p = view.profile,
    text = message.trim();
  const reply = (
    answer: string,
    topic: ChatContext["topic"],
    extra: Partial<ChatReply> = {},
  ): ChatReply => ({
    answer,
    mode: "rules",
    planning: view,
    context: { topic, entityId: context?.entityId },
    ...extra,
  });
  if (context?.debtDraft && !/(?:i owe|owes me|я должен|должен мне)/i.test(text)) {
    const due = dateIn(text, p.asOf, p.nextIncome?.date);
    if (due) {
      const d = context.debtDraft;
      return planningChat(
        db,
        user,
        `${d.direction === "payable" ? `I owe ${d.person}` : `${d.person} owes me`} $${d.amount}. Return $${d.firstAmount} by ${due}, rest after scholarship`,
        { topic: "debts" },
      );
    }
  }
  // A spoken/pasted statement is a proposal only. All mutations require the separate confirmed endpoint.
  if (/(?:already|уже).*(?:repaid|returned|paid|received|вернул|вернула|получил)/i.test(text)) {
    const direction = /received|получил/i.test(text) ? "receivable" : "payable";
    const matches = view.debts.filter(
      (d) =>
        d.direction === direction && d.remaining > 0 && nameKey(text).includes(nameKey(d.person)),
    );
    const amount =
      amountIn(text) ??
      Number(
        text
          .match(
            /(?:вернул[аи]?|получил[аи]?|paid|repaid|returned|received).*?(\d+(?:[.,]\d{1,2})?)/i,
          )?.[1]
          ?.replace(",", "."),
      );
    if (matches.length !== 1 || !Number.isFinite(amount) || amount <= 0)
      return reply(
        "Which debt and how much was actually paid or received? Choose the debt below. This records cash movement locally; it does not transfer money to a friend.",
        "debts",
      );
    const d = matches[0];
    if (amount > d.remaining)
      return reply(
        `Only ${money(d.remaining)} remains on ${d.person}'s debt. Please correct the amount.`,
        "debts",
      );
    return reply(
      `Record ${money(amount)} ${direction === "payable" ? `paid to ${d.person}` : `received from ${d.person}`}? Balance will ${direction === "payable" ? "decrease" : "increase"} once; remaining debt will be ${money(d.remaining - amount)}. No PayPal transfer is involved.`,
      "debts",
      {
        actions: [
          {
            label: "Confirm recorded cash movement",
            command: { type: "debt-payment", debtId: d.id, amount, date: p.asOf },
          },
        ],
      },
    );
  }
  const owes = text.match(/(?:i owe|я должен|я должна)\s+(.+?)\s+\$?(\d+(?:[.,]\d{1,2})?)/i);
  const owed = text.match(/^(.+?)\s+(?:owes me|должен мне|должна мне)\s+\$?(\d+(?:[.,]\d{1,2})?)/i);
  if (owes || owed) {
    const m = (owes || owed)!,
      person = m[1].trim(),
      amount = Number(m[2].replace(",", ".")),
      direction = owes ? "payable" : "receivable";
    const first = text.match(/(?:repay|return|pay|верну)\s+\$?(\d+(?:[.,]\d{1,2})?)/i);
    const firstAmount = first ? Number(first[1].replace(",", ".")) : amount;
    const date = dateIn(text, p.asOf, p.nextIncome?.date);
    if (!date)
      return reply(
        `You ${direction === "payable" ? `owe ${person}` : `are owed by ${person}`} ${money(amount)}. What is the due date (YYYY-MM-DD or Friday)? Incoming debts do not increase your budget until money arrives.`,
        "debts",
        { context: { topic: "debts", debtDraft: { person, direction, amount, firstAmount } } },
      );
    if (firstAmount > amount || firstAmount <= 0)
      return reply("The first installment must be positive and cannot exceed the debt.", "debts");
    const remaining = dollars(cents(amount) - cents(firstAmount));
    const secondDate = p.nextIncome ? addDays(p.nextIncome.date, 1) : undefined;
    if (remaining && !secondDate)
      return reply(
        "When will the remaining amount be paid? Add the income date first, or enter the complete schedule below.",
        "debts",
      );
    const installments = [
      { date, amount: firstAmount },
      ...(remaining ? [{ date: secondDate!, amount: remaining }] : []),
    ];
    return reply(
      `${direction === "payable" ? `You owe ${person}` : `${person} owes you`} ${money(amount)}. Proposed schedule: ${installments.map((i) => `${money(i.amount)} on ${i.date}`).join("; ")}. ${direction === "receivable" ? "Expected money is excluded until receipt." : "Only installments before your income will be reserved for the purchase budget."} Save this record?`,
      "debts",
      {
        actions: [
          {
            label: "Confirm and save debt",
            command: { type: "debt-create", person, direction, amount, installments },
          },
        ],
      },
    );
  }
  // Preparing a Sandbox review must never create an order or silently alter the amount.
  if (/^(?:pay|оплати|заплати|prepare payment)/i.test(text) || context?.topic === "payment") {
    const amount =
      amountIn(text) ?? Number(text.match(/(\d+(?:[.,]\d{1,2})?)/)?.[1]?.replace(",", "."));
    const grocery = /grocer|продукт|top.?up/i.test(text),
      workspace = /workspace|essentials/i.test(text);
    if (
      /EUR|€|KZT|₸|RUB|₽|GBP|£|тенге|рубл/i.test(text) ||
      (/^(?:pay|оплати|заплати)/i.test(text) && !grocery && !workspace)
    )
      return reply(
        "Please specify a supported purpose and an exact USD amount. Only existing grocery/workspace suggestions to the configured Sandbox merchant can be reviewed. Friend transfers and other currencies are unavailable; no order was created.",
        "payment",
      );
    const options = db.suggestions.filter(
      (s) =>
        s.userId === user &&
        ["proposed", "approved"].includes(s.status) &&
        (!context?.entityId || s.id === context.entityId),
    );
    const matched = options.filter(
      (s) =>
        (!Number.isFinite(amount) || cents(s.amount) === cents(amount)) &&
        (context?.entityId ||
          (grocery && /grocer/i.test(s.title)) ||
          (workspace && /workspace/i.test(s.title))),
    );
    if (matched.length !== 1)
      return reply(
        `I can review an existing matching Sandbox suggestion only. ${options.map((s) => `${s.title}: ${money(s.amount)}`).join("; ") || "There are no active suggestions."} Please specify the purpose and exact amount. The recipient is this demo's configured Sandbox merchant; friend transfers are not supported. No order has been created.`,
        "payment",
      );
    const suggestion = matched[0];
    return reply(
      `Review ${suggestion.title}, ${money(suggestion.amount)} USD, payable only to the configured Sandbox merchant. Continue to the existing payment review, then explicitly approve in Penny and PayPal, and complete capture on return. This message has not created an order.`,
      "payment",
      {
        actions: [
          { label: `Review ${money(suggestion.amount)} Sandbox payment`, paymentId: suggestion.id },
        ],
      },
    );
  }
  const topic =
    /headphone|наушник|afford|стипенд|обед|weekdays|будням|every day|ежеднев|каждый день|reserve|резерв|available balance/i.test(
      text,
    )
      ? "purchase"
      : /delay|late.*client|client.*late|задерж|клиент.*позже/i.test(text)
        ? "delay"
        : /refund|возврат/i.test(text)
          ? "refunds"
          : /price.*increas|подорож|сменил тариф/i.test(text)
            ? "price"
            : /debt|owe|погаш|долг|вернуть|всем в срок/i.test(text)
              ? "debts"
              : /subscr|подпис/i.test(text)
                ? "subscriptions"
                : /coffee|кофе/i.test(text)
                  ? "coffee"
                  : /overview|spending|расход/i.test(text)
                    ? "overview"
                    : context?.topic;
  if (topic === "purchase") {
    const options: PurchaseOptions = { ...context?.options };
    if (/weekdays|будням/i.test(text)) options.schedule = "weekdays";
    else if (/daily|every day|ежеднев|каждый день/i.test(text)) options.schedule = "daily";
    const reserve = text.match(/(?:reserve|резерв)\D{0,12}(\d+(?:[.,]\d{1,2})?)/i);
    if (reserve) options.reserve = Number(reserve[1].replace(",", "."));
    const balance = text.match(/(?:balance|остаток|на счету)\D{0,12}(\d+(?:[.,]\d{1,2})?)/i);
    if (balance) options.balance = Number(balance[1].replace(",", "."));
    const lunch = text.match(/(?:lunch costs?|обед стоит)\D{0,8}(\d+(?:[.,]\d{1,2})?)/i);
    if (lunch) options.lunchPrice = Number(lunch[1].replace(",", "."));
    const date = dateIn(text, p.asOf);
    if (date) options.incomeDate = date;
    const days = text.match(/(?:in|через|до стипендии)\s*(\d+)\s*(?:days?|дн|дней)/i);
    if (days) options.incomeDate = addDays(p.asOf, Number(days[1]));
    if (/confirm.*lunch|это.*обед/i.test(text)) options.confirmLunch = true;
    const plan = purchasePlan(db, user, options);
    if (plan.missing.length)
      return reply(plan.missing.join("\n"), "purchase", {
        context: { topic: "purchase", options },
        planning: { ...view, purchase: plan },
        actions: plan.missing.some((s) => s.startsWith("Are purchases"))
          ? [
              {
                label: "Confirm these are my usual lunches",
                command: { type: "profile", options: { ...options, confirmLunch: true } },
              },
            ]
          : [],
      });
    const products = plan.candidates.length
      ? plan.candidates
          .map(
            (h) =>
              `${h.name}: ${money(h.price)} · ${h.features}. Balance after purchase ${money(h.remaining)}; unallocated purchase budget ${money(plan.limit - h.price)}.`,
          )
          .join("\n")
      : "No demo headphones fit this budget. Keep the reserve or change the assumptions before buying.";
    return reply(
      `Headphones: up to ${money(plan.limit)} until ${plan.incomeDate}.\n\n${money(plan.balance)} available − ${plan.lunchDates.length} lunches × ${money(plan.lunchPrice)} (${money(plan.lunchCost)}) − ${money(plan.otherCost)} other habits − ${money(plan.mandatoryCost)} essential bills − ${money(plan.debtCost)} debt installments − ${money(plan.reserve)} reserve = ${money(plan.limit)}.\n\nLunch dates: ${plan.lunchDates.join(", ") || "none"}. ${options.schedule || p.lunchSchedule} schedule; the snapshot day is included and income day excluded. Lunches are not counted again in a food-category budget.\n\nEvidence: ${plan.evidence.map((t) => `${t.date} · ${t.merchant} · ${money(t.amount)} · ${t.description}`).join("; ") || "No lunch history; price supplied explicitly."}\n\n${products}\n\nThe catalog is fictional, prices are fixed demo prices, and this forecast is an estimate. Expected refunds and money owed to you are excluded.`,
      "purchase",
      {
        context: { topic: "purchase", options },
        planning: { ...view, purchase: plan },
        actions: Object.keys(options).length
          ? [{ label: "Confirm and save these assumptions", command: { type: "profile", options } }]
          : [],
      },
    );
  }
  if (topic === "debts") {
    const selected = context?.entityId
      ? view.debts.find((d) => d.id === context.entityId)
      : undefined;
    const newDate = dateIn(text, p.asOf, p.nextIncome?.date);
    if (selected && newDate && /move|resched|instead|перен|график/i.test(text)) {
      const installments = [{ date: newDate, amount: selected.remaining }];
      const preview = forecast(db, user, undefined, { debtId: selected.id, installments });
      return reply(
        `Trial schedule for ${selected.person}: ${money(selected.remaining)} on ${newDate}. ${shortfall(preview)} The saved schedule has not changed.`,
        "debts",
        {
          preview,
          actions: [
            {
              label: "Confirm and save new schedule",
              command: { type: "debt-schedule", debtId: selected.id, installments },
            },
          ],
        },
      );
    }
    const debtLines = (selected ? [selected] : view.debts)
      .map(
        (d) =>
          `${d.direction === "payable" ? `You owe ${d.person}` : `${d.person} owes you`}: ${money(d.remaining)} remaining of ${money(d.amount)}. Due: ${
            openInstallments(d)
              .map((i) => `${money(i.amount)} on ${i.date}`)
              .join("; ") || "settled"
          }. History: ${d.repayments.map((r) => `${money(r.amount)} on ${r.date}`).join("; ") || "no repayments"}.`,
      )
      .join("\n\n");
    return reply(
      `${debtLines || "No debt records yet. You can say: I owe Ali $60, return $40 by Friday and the rest after scholarship."}\n\n${shortfall(view.debtForecast)} Expected receivables are not counted. Change the schedule below to preview before saving.`,
      "debts",
    );
  }
  if (topic === "refunds") {
    const refund =
      view.refunds.find((r) => r.id === context?.entityId) ||
      (!context?.entityId ? view.refunds.find((r) => !r.receivedAt) : undefined);
    if (refund)
      return reply(
        `${refund.purchase?.merchant || "Purchase"}: ${money(refund.purchase?.amount || 0)} on ${refund.purchase?.date}. Expected refund ${money(refund.amount)}, promised ${refund.dueDate}. ${refund.receivedAt ? "Already recorded as received." : refund.overdue ? "The promised date has passed." : "Still pending."} Expected refunds do not increase the purchase budget.`,
        "refunds",
        {
          context: { topic: "refunds", entityId: refund.id },
          actions: refund.receivedAt
            ? []
            : [
                {
                  label: "Confirm money arrived",
                  command: { type: "refund-received", refundId: refund.id },
                },
              ],
        },
      );
    const tx = db.transactions.find((t) => t.userId === user && t.id === context?.entityId);
    return reply(
      tx
        ? `Track a refund for ${tx.merchant}, ${money(tx.amount)} on ${tx.date}. Enter the expected amount and promised date below, then confirm.`
        : "Choose an outgoing purchase below and enter the refund amount and promised date. No expected refund is counted as available money.",
      "refunds",
    );
  }
  if (topic === "price") {
    const change = view.prices.find((c) => c.id === context?.entityId) || view.prices[0];
    if (!change)
      return reply("No unreviewed increase between comparable recurring charges.", "price");
    return reply(
      `${change.merchant}: ${money(change.previous.amount)} on ${change.previous.date} → ${money(change.current.amount)} on ${change.current.date}, both ${change.period} USD charges. Annual difference if the new charge persists: ${money(change.annualDifference)}. I can confirm the charge increased; the reason is unknown. Mark a plan change only if you actually changed your plan.`,
      "price",
      {
        context: { topic: "price", entityId: change.id },
        actions: [
          {
            label: "I changed my plan — acknowledge",
            command: { type: "price-acknowledge", priceId: change.id },
          },
        ],
      },
    );
  }
  if (topic === "delay") {
    const daysMatch =
      text.match(/(?:by|на|delay)\s*(\d+)\s*(?:days?|дн|день)/i) ||
      text.match(/(\d+)\s*days?\s*(?:late|later)/i);
    const date = dateIn(text, p.asOf);
    const days =
      date && p.nextIncome
        ? Math.round((Date.parse(date) - Date.parse(p.nextIncome.date)) / 86400000)
        : daysMatch
          ? Number(daysMatch[1])
          : /week|недел/i.test(text)
            ? 7
            : p.delayDays;
    if (days < 0 || days > 60 || !p.nextIncome)
      return reply("Choose a delay from 0 to 60 days, with a known original income date.", "delay");
    const delayed = forecast(db, user, addDays(p.nextIncome.date, days));
    const baseline = forecast(db, user, undefined, undefined, addDays(p.nextIncome.date, days));
    return reply(
      `Original ${p.nextIncome.label}: ${money(p.nextIncome.amount)} on ${p.nextIncome.date}; trial date ${addDays(p.nextIncome.date, days)} (${days} days later).\n\nOriginal forecast: ${shortfall(baseline)}\nDelayed forecast: ${shortfall(delayed)}\n\nThe daily comparison below includes usual expenses, bills, and outgoing debt installments. Trying this scenario does not change your original income date.`,
      "delay",
      {
        planning: { ...view, delay: { days, baseline, delayed } },
        actions: [
          {
            label: "Save this watch scenario (income date stays unchanged)",
            command: { type: "delay-save", days },
          },
        ],
      },
    );
  }
  return undefined;
}
