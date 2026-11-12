import { randomUUID } from "node:crypto";
import { z } from "zod";
import { categories } from "../types";
import { HttpError } from "../http";
import {
  currencies,
  type FinanceAccount,
  type PrivateState,
  type EntryFields,
  type EntryDraft,
  type DraftView,
  type FinanceOverview,
} from "./types";
import { publicUser, authenticatedUser } from "./auth";
import type { NextRequest } from "next/server";
import { personalAdaptiveHome } from "./adaptive-home";
import { formatCurrency } from "../currency";
import { workspaceViews } from "./views";
import { sumMinor } from "./arithmetic";
export { sumMinor } from "./arithmetic";
import { recordActivity } from "./activity";
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(12, "Use a password with at least 12 characters.")
  .max(128);
export const currencySchema = z.enum(currencies);
export const today = () => new Date().toISOString().slice(0, 10);
export const calendarDay = (timeZone = "Asia/Almaty") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const date = new Date(d + "T12:00:00Z");
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === d &&
      d >= "1900-01-01" &&
      d <= new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    );
  }, "Choose a valid date no later than today.");
export function parseMinor(value: string, allowNegative = false) {
  const clean = value
    .trim()
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(",", ".");
  if (!new RegExp(`^${allowNegative ? "-?" : ""}\\d+(?:\\.\\d{1,2})?$`).test(clean))
    throw new HttpError(400, "Enter an amount with no more than two decimal places.");
  const negative = clean.startsWith("-"),
    parts = clean.replace("-", "").split(".");
  const integer = BigInt(parts[0]) * 100n + BigInt((parts[1] || "").padEnd(2, "0"));
  if (integer > 1000000000000n) throw new HttpError(400, "The amount is too large.");
  return Number(integer) * (negative ? -1 : 1);
}
export const formatMinor = formatCurrency;
export const accountSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    kind: z.enum(["bank", "cash", "savings"]),
    currency: currencySchema,
    openingBalance: z.string().max(32),
  })
  .strict();
export const entrySchema = z
  .object({
    accountId: z.string().uuid(),
    kind: z.enum(["income", "expense"]),
    amount: z.string().max(32),
    description: z.string().trim().min(1).max(240),
    category: z.enum(categories),
    date: dateSchema,
  })
  .strict();
export function ownedAccount(s: PrivateState, userId: string, id: string) {
  const a = s.accounts.find((a) => a.id === id && a.ownerId === userId);
  if (!a) throw new HttpError(404, "Account not found.");
  return a;
}
export function accountBalance(s: PrivateState, account: FinanceAccount) {
  const balance = s.entries
    .filter((t) => t.ownerId === account.ownerId && t.accountId === account.id && !t.voidedAt)
    .reduce(
      (sum, t) => sum + (t.kind === "income" ? BigInt(t.amountMinor) : -BigInt(t.amountMinor)),
      BigInt(account.openingMinor),
    );
  if (balance > BigInt(Number.MAX_SAFE_INTEGER) || balance < BigInt(Number.MIN_SAFE_INTEGER))
    throw new HttpError(409, "The total exceeds the supported range.");
  return Number(balance);
}
export function viewDraft(d: EntryDraft): DraftView {
  const { ownerId: _owner, ...view } = d;
  void _owner;
  return view;
}
export function prepareDraft(
  s: PrivateState,
  ownerId: string,
  fields: EntryFields,
  source: EntryDraft["source"],
  mode: EntryDraft["mode"] = "rules",
) {
  const account = ownedAccount(s, ownerId, fields.accountId);
  if (account.currency !== fields.currency)
    throw new HttpError(409, "The transaction currency must match the account currency.");
  if (!Number.isSafeInteger(fields.amountMinor) || fields.amountMinor <= 0)
    throw new HttpError(400, "The amount must be greater than zero.");
  const user = s.users.find((u) => u.id === ownerId);
  if (!user || fields.date > calendarDay(user.timeZone))
    throw new HttpError(400, "Future transactions cannot be recorded.");
  const now = Date.now();
  s.drafts = s.drafts.filter((d) => d.entryId || d.expiresAt > now);
  const active = s.drafts.filter((d) => d.ownerId === ownerId && !d.entryId);
  if (active.length >= 50) throw new HttpError(429, "Too many drafts. Please wait 15 minutes.");
  const draft: EntryDraft = {
    ...fields,
    id: randomUUID(),
    ownerId,
    createdAt: now,
    expiresAt: now + 900000,
    source,
    mode,
  };
  s.drafts.push(draft);
  if (source === "pennybot")
    recordActivity(
      s,
      ownerId,
      "pennybot prepared a transaction",
      fields.description,
      "assistant",
      "draft-" + draft.id,
    );
  return viewDraft(draft);
}
export function confirmDraft(s: PrivateState, ownerId: string, id: string) {
  const draft = s.drafts.find((d) => d.id === id && d.ownerId === ownerId);
  if (!draft) throw new HttpError(404, "Draft not found.");
  if (draft.entryId) {
    const entry = s.entries.find((t) => t.id === draft.entryId && t.ownerId === ownerId);
    if (!entry) throw new HttpError(409, "Transaction unavailable.");
    const { ownerId: _owner, ...view } = entry;
    void _owner;
    return { entry: view, duplicate: true };
  }
  if (draft.expiresAt <= Date.now())
    throw new HttpError(410, "This draft has expired. Please review the transaction again.");
  const account = ownedAccount(s, ownerId, draft.accountId);
  if (account.currency !== draft.currency)
    throw new HttpError(409, "The account currency has changed.");
  const balance =
    accountBalance(s, account) + (draft.kind === "income" ? draft.amountMinor : -draft.amountMinor);
  if (!Number.isSafeInteger(balance))
    throw new HttpError(409, "The total exceeds the supported range.");
  const entry = {
    id: randomUUID(),
    ownerId,
    accountId: account.id,
    kind: draft.kind,
    amountMinor: draft.amountMinor,
    currency: draft.currency,
    description: draft.description,
    category: draft.category,
    date: draft.date,
    source: draft.source,
    draftId: draft.id,
    createdAt: new Date().toISOString(),
  };
  s.entries.push(entry);
  draft.entryId = entry.id;
  const { ownerId: _owner, ...view } = entry;
  void _owner;
  return { entry: view, duplicate: false };
}
export function overview(s: PrivateState, request: NextRequest): FinanceOverview {
  const user = authenticatedUser(s, request),
    day = calendarDay(user.timeZone),
    month = day.slice(0, 7);
  const accounts = s.accounts
    .filter((a) => a.ownerId === user.id)
    .map((a) => {
      const { ownerId: _owner, ...view } = a;
      void _owner;
      return { ...view, balanceMinor: accountBalance(s, a) };
    });
  const entries = s.entries
    .filter((t) => t.ownerId === user.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .map((t) => {
      const { ownerId: _owner, ...view } = t;
      void _owner;
      return view;
    });
  const totals = Object.fromEntries(
    currencies.map((currency) => [
      currency,
      {
        balanceMinor: sumMinor(
          accounts.filter((a) => a.currency === currency).map((a) => a.balanceMinor),
        ),
        incomeMinor: sumMinor(
          entries
            .filter(
              (e) =>
                e.currency === currency &&
                e.kind === "income" &&
                !e.voidedAt &&
                e.date.startsWith(month),
            )
            .map((e) => e.amountMinor),
        ),
        expenseMinor: sumMinor(
          entries
            .filter(
              (e) =>
                e.currency === currency &&
                e.kind === "expense" &&
                !e.voidedAt &&
                e.date.startsWith(month),
            )
            .map((e) => e.amountMinor),
        ),
      },
    ]),
  ) as FinanceOverview["totals"];
  for (const row of Object.values(totals))
    if (Object.values(row).some((v) => !Number.isSafeInteger(v)))
      throw new HttpError(409, "The total exceeds the supported range.");
  const adaptiveHome = Object.fromEntries(
    currencies.map((c) => [c, personalAdaptiveHome(user, accounts, entries, c, day)]),
  ) as FinanceOverview["adaptiveHome"];
  return {
    user: publicUser(user),
    accounts,
    entries,
    totals,
    month,
    today: day,
    adaptiveHome,
    ...workspaceViews(s, user, entries, day),
  };
}
