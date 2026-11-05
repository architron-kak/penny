import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database, PersonaId } from "./types";
import { addDays, ensurePlanning, openInstallments, priceChanges, remainingDebt } from "./planning";
import type { PlanningCommand } from "./planning-types";
import { cents, dollars } from "./money";
import { HttpError } from "./http";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Use a real YYYY-MM-DD date");
const amount = z.number().finite().positive().max(100000).multipleOf(0.01);
export const purchaseOptionsSchema = z.object({
  balance: z.number().min(0).max(100000).optional(),
  incomeDate: dateSchema.optional(),
  incomeAmount: amount.optional(),
  reserve: z.number().min(0).max(100000).optional(),
  schedule: z.enum(["daily", "weekdays"]).optional(),
  lunchPrice: z.number().min(0).max(1000).optional(),
  confirmLunch: z.boolean().optional(),
});
const installments = z
  .array(z.object({ date: dateSchema, amount }))
  .min(1)
  .max(24);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("savings-save"),
    name: z.string().trim().min(1).max(60),
    target: amount,
    saved: z.number().finite().min(0).max(100000).multipleOf(0.01),
  }),
  z.object({ type: z.literal("profile"), options: purchaseOptionsSchema }),
  z.object({
    type: z.literal("debt-create"),
    person: z.string().trim().min(1).max(60),
    direction: z.enum(["payable", "receivable"]),
    amount,
    installments,
  }),
  z.object({ type: z.literal("debt-payment"), debtId: z.string(), amount, date: dateSchema }),
  z.object({ type: z.literal("debt-schedule"), debtId: z.string(), installments }),
  z.object({
    type: z.literal("refund-create"),
    transactionId: z.string(),
    amount,
    dueDate: dateSchema,
  }),
  z.object({ type: z.literal("refund-received"), refundId: z.string() }),
  z.object({ type: z.literal("price-acknowledge"), priceId: z.string() }),
  z.object({ type: z.literal("delay-save"), days: z.number().int().min(0).max(60) }),
]);
export function applyPlanningCommand(
  db: Database,
  user: PersonaId,
  command: PlanningCommand,
  requestId: string,
) {
  const s = ensurePlanning(db),
    p = s.profiles[user],
    key = `${user}:${requestId}`;
  if (s.appliedActions.includes(key)) return { duplicate: true };
  const fail = (message: string): never => {
    throw new HttpError(409, message);
  };
  switch (command.type) {
    case "savings-save": {
      if (cents(command.saved) > cents(command.target))
        fail("Saved money cannot exceed the goal target.");
      p.savingsGoal = { name: command.name, target: command.target, saved: command.saved };
      break;
    }
    case "profile": {
      const o = command.options;
      if (o.incomeDate && (o.incomeDate <= p.asOf || o.incomeDate > addDays(p.asOf, 180)))
        fail("Income must be within the next 180 demo days.");
      if (o.balance !== undefined) p.balance = o.balance;
      if (o.reserve !== undefined) p.reserve = o.reserve;
      if (o.schedule) p.lunchSchedule = o.schedule;
      if (o.incomeDate && !p.nextIncome) {
        if (o.incomeAmount === undefined)
          fail("What is the expected income amount? Enter it before saving the income date.");
        p.nextIncome = { date: o.incomeDate, amount: o.incomeAmount!, label: "Next income" };
      }
      if (o.incomeDate && p.nextIncome) p.nextIncome.date = o.incomeDate;
      if (o.incomeAmount !== undefined && p.nextIncome) p.nextIncome.amount = o.incomeAmount;
      if (o.confirmLunch) p.lunchConfirmed = true;
      if (o.lunchPrice !== undefined) {
        p.lunchPrice = o.lunchPrice;
      }
      break;
    }
    case "debt-create": {
      if (
        cents(command.amount) !== command.installments.reduce((sum, i) => sum + cents(i.amount), 0)
      )
        fail("Installments must add up to the debt amount.");
      if (command.installments.some((i) => i.date > addDays(p.asOf, 180)))
        fail("Plan debts within 180 demo days.");
      s.debts.push({ id: randomUUID(), userId: user, ...command, repayments: [] });
      break;
    }
    case "debt-payment": {
      const d = s.debts.find((d) => d.id === command.debtId && d.userId === user);
      if (!d) fail("Debt not found.");
      const debt = d!;
      if (command.date > p.asOf) fail("Only money already paid or received can be recorded.");
      if (cents(command.amount) > cents(remainingDebt(debt)))
        fail("This payment exceeds the remaining debt.");
      if (p.balance === null) fail("Set your current available balance first.");
      debt.repayments.push({ id: key, amount: command.amount, date: command.date });
      p.balance = dollars(
        cents(p.balance!) + (debt.direction === "payable" ? -1 : 1) * cents(command.amount),
      );
      break;
    }
    case "debt-schedule": {
      const d = s.debts.find((d) => d.id === command.debtId && d.userId === user);
      if (!d) fail("Debt not found.");
      if (command.installments.some((i) => i.date < p.asOf || i.date > addDays(p.asOf, 180)))
        fail("Choose new dates within the next 180 demo days.");
      if (
        command.installments.reduce((sum, i) => sum + cents(i.amount), 0) !==
        cents(remainingDebt(d!))
      )
        fail("The new schedule must match the remaining debt.");
      const paid = dollars(cents(d!.amount) - cents(remainingDebt(d!)));
      d!.installments = [
        ...(paid ? [{ date: p.asOf, amount: paid }] : []),
        ...command.installments,
      ];
      break;
    }
    case "refund-create": {
      const tx = db.transactions.find(
        (t) => t.id === command.transactionId && t.userId === user && t.amount > 0,
      );
      if (!tx) fail("Choose an outgoing transaction from this profile.");
      const recorded = s.refunds
        .filter((r) => r.userId === user && r.transactionId === command.transactionId)
        .reduce((sum, r) => sum + cents(r.amount), 0);
      if (recorded + cents(command.amount) > cents(tx!.amount))
        fail("Refunds cannot exceed the original purchase amount.");
      s.refunds.push({
        id: randomUUID(),
        userId: user,
        transactionId: command.transactionId,
        amount: command.amount,
        dueDate: command.dueDate,
      });
      break;
    }
    case "refund-received": {
      const r = s.refunds.find((r) => r.id === command.refundId && r.userId === user);
      if (!r) fail("Refund not found.");
      if (r!.receivedAt) return { duplicate: true };
      if (p.balance === null) fail("Set your balance before recording received money.");
      r!.receivedAt = new Date().toISOString();
      p.balance = dollars(cents(p.balance!) + cents(r!.amount));
      break;
    }
    case "price-acknowledge":
      if (!priceChanges(db, user).some((c) => c.id === command.priceId))
        fail("This price change is no longer current.");
      s.acknowledgedPrices.push(command.priceId);
      break;
    case "delay-save":
      p.delayDays = command.days;
      break;
  }
  s.appliedActions.push(key); // Retain replay keys for the lifetime of this small demo database.
  return { duplicate: false };
}
export function debtSummary(db: Database, user: PersonaId) {
  return ensurePlanning(db)
    .debts.filter((d) => d.userId === user)
    .map((d) => ({ debt: d, remaining: remainingDebt(d), installments: openInstallments(d) }));
}
