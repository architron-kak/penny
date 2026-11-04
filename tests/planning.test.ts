import { describe, expect, it } from "vitest";
import { generateSeed } from "../lib/seed";
import {
  datesUntil,
  ensurePlanning,
  forecast,
  openInstallments,
  planningView,
  purchasePlan,
  priceChanges,
  addDays,
} from "../lib/planning";
import { applyPlanningCommand } from "../lib/planning-actions";
import { planningChat } from "../lib/planning-chat";
import { planningCards } from "../lib/planning-cards";
const make = () => generateSeed(new Date("2026-11-04T12:00:00Z"));
describe("planning cash invariants", () => {
  it("keeps the headphone limit at $60 after a reserved $40 debt is actually paid", () => {
    const db = make(),
      p = ensurePlanning(db).profiles.student;
    expect(purchasePlan(db, "student").limit).toBe(100);
    applyPlanningCommand(
      db,
      "student",
      {
        type: "debt-create",
        person: "Ali",
        direction: "payable",
        amount: 40,
        installments: [{ date: addDays(p.asOf, 2), amount: 40 }],
      },
      "create",
    );
    expect(purchasePlan(db, "student").limit).toBe(60);
    const debt = db.planning!.debts.find((d) => d.userId === "student")!;
    const command = { type: "debt-payment" as const, debtId: debt.id, amount: 40, date: p.asOf };
    applyPlanningCommand(db, "student", command, "pay");
    applyPlanningCommand(db, "student", command, "pay");
    expect(p.balance).toBe(160);
    expect(purchasePlan(db, "student").debtCost).toBe(0);
    expect(purchasePlan(db, "student").limit).toBe(60);
    const chat = planningChat(db, "student", "Can I afford headphones?")!;
    expect(chat.answer).toContain("$60.00");
    expect(
      planningCards(planningView(db, "student")).find((c) => c.kind === "PurchaseBudget")!.headline,
    ).toContain("$60.00");
  });
  it("counts real weekdays, excluding income day, across weekends and year boundaries", () => {
    expect(datesUntil("2026-11-06", "2026-11-10", "weekdays")).toEqual([
      "2026-11-06",
      "2026-11-09",
    ]);
    expect(datesUntil("2026-12-31", "2027-01-04", "weekdays")).toEqual([
      "2026-12-31",
      "2027-01-01",
    ]);
    const db = make();
    const plan = purchasePlan(db, "student", { schedule: "weekdays" });
    expect(plan.lunchDates).toHaveLength(8);
    expect(plan.limit).toBe(110);
  });
  it("allocates partial repayments once, preserving remaining schedules and history", () => {
    const db = make(),
      s = ensurePlanning(db),
      d = s.debts.find((d) => d.id === "family-debt-demo")!;
    applyPlanningCommand(
      db,
      "family",
      { type: "debt-payment", debtId: d.id, amount: 25, date: s.profiles.family.asOf },
      "partial",
    );
    expect(openInstallments(d).map((i) => i.amount)).toEqual([15, 20]);
    expect(d.repayments).toHaveLength(1);
    expect(s.profiles.family.balance).toBe(875);
    applyPlanningCommand(
      db,
      "family",
      {
        type: "debt-schedule",
        debtId: d.id,
        installments: [{ date: addDays(s.profiles.family.asOf, 10), amount: 35 }],
      },
      "reschedule",
    );
    expect(openInstallments(d).map((i) => i.amount)).toEqual([35]);
    expect(d.repayments).toHaveLength(1);
  });
  it("does not count receivables or expected refunds until confirmed and never credits refunds twice", () => {
    const db = make(),
      s = ensurePlanning(db),
      p = s.profiles.family;
    const before = purchasePlan(db, "family").limit;
    expect(p.balance).toBe(900);
    const view = planningView(db, "family");
    expect(view.refunds[0].overdue).toBe(true);
    expect(planningCards(view).some((c) => c.kind === "RefundAlert")).toBe(true);
    const cmd = { type: "refund-received" as const, refundId: s.refunds[0].id };
    applyPlanningCommand(db, "family", cmd, "received1");
    applyPlanningCommand(db, "family", cmd, "received2");
    expect(p.balance).toBe(935);
    expect(purchasePlan(db, "family").limit).toBe(before + 35);
    expect(planningCards(planningView(db, "family")).some((c) => c.kind === "RefundAlert")).toBe(
      false,
    );
  });
  it("compares delayed income without changing the original date and identifies rent shortfall", () => {
    const db = make(),
      p = ensurePlanning(db).profiles.freelancer,
      original = p.nextIncome!.date;
    const baseline = forecast(db, "freelancer"),
      delayed = forecast(db, "freelancer", addDays(original, 7));
    expect(baseline.firstShortfall).toBeUndefined();
    expect(delayed.firstShortfall).toMatchObject({
      payment: "Rent",
      amount: 45,
      date: addDays(p.asOf, 8),
    });
    const reply = planningChat(db, "freelancer", "What if my client pays 7 days late?")!;
    expect(reply.answer).toContain("Rent");
    expect(p.nextIncome!.date).toBe(original);
  });
  it("detects only matching billing periods and acknowledges a confirmed plan change", () => {
    const db = make(),
      change = priceChanges(db, "student").find((c) => c.merchant === "Monthly Notes")!;
    expect(change.annualDifference).toBe(36);
    applyPlanningCommand(db, "student", { type: "price-acknowledge", priceId: change.id }, "plan");
    expect(priceChanges(db, "student").some((c) => c.id === change.id)).toBe(false);
    const other = make();
    other.transactions.find((t) => t.id === "student-planning-sub-old")!.billingPeriod = "annual";
    expect(priceChanges(other, "student").some((c) => c.merchant === "Monthly Notes")).toBe(false);
  });
  it("asks to confirm ambiguous lunch evidence and handles missing inputs", () => {
    const db = make(),
      p = ensurePlanning(db).profiles.student;
    p.lunchConfirmed = false;
    p.balance = null;
    db.transactions
      .filter((t) => t.merchant === p.lunchMerchant)
      .forEach((t) => (t.description = "Card purchase"));
    const plan = purchasePlan(db, "student");
    expect(plan.missing.join(" ")).toContain("available balance");
    expect(plan.missing.join(" ")).toContain("usual lunches");
    expect(plan.candidates).toEqual([]);
  });
  it("returns no model when the budget cannot afford any demo headphones", () => {
    const db = make();
    expect(purchasePlan(db, "student", { balance: 30 }).candidates).toEqual([]);
  });
  it("upgrades old JSON once and preserves Sandbox records", () => {
    const db = make();
    delete db.planning;
    const transactions = db.transactions.length;
    db.orders.push({
      id: "OLD",
      suggestionId: "student-topup",
      userId: "student",
      amount: 45,
      currency: "USD",
      status: "COMPLETED",
      approvalUrl: "https://www.sandbox.paypal.com",
      createdAt: "x",
      updatedAt: "x",
    });
    ensurePlanning(db);
    ensurePlanning(db);
    expect(db.orders[0].id).toBe("OLD");
    expect(db.transactions).toHaveLength(transactions);
  });
  it("proposes debt creation from natural text without changing state", () => {
    const db = make(),
      before = db.planning!.debts.length;
    const reply = planningChat(
      db,
      "student",
      "Я должен Али $60. Верну $40 до пятницы, остальное после стипендии",
    )!;
    expect(reply.actions![0].command).toMatchObject({
      type: "debt-create",
      amount: 60,
      installments: [
        { date: "2026-11-06", amount: 40 },
        { date: "2026-11-15", amount: 20 },
      ],
    });
    expect(db.planning!.debts).toHaveLength(before);
  });
  it("never saves or creates orders from voice-style payment/repayment text", () => {
    const db = make(),
      balance = db.planning!.profiles.family.balance;
    const cash = planningChat(db, "family", "I already returned Ali $40 in cash")!;
    expect(cash.actions![0].command?.type).toBe("debt-payment");
    expect(db.planning!.profiles.family.balance).toBe(balance);
    const unsupported = planningChat(db, "student", "Оплати продукты на $20")!;
    expect(unsupported.actions).toBeUndefined();
    expect(db.orders).toHaveLength(0);
    const review = planningChat(db, "student", "Pay groceries $45")!;
    expect(review.actions![0].paymentId).toBe("student-topup");
    expect(db.orders).toHaveLength(0);
    expect(db.suggestions[0].status).toBe("proposed");
  });
});
