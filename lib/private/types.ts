import type { Category } from "../types";
export const currencies = ["KZT", "USD", "EUR"] as const;
export type Currency = (typeof currencies)[number];
export type PrivateUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  timeZone: string;
  createdAt: string;
  demoProfile?: "student" | "family" | "freelancer";
  demoExpiresAt?: number;
};
export type LoginSession = { hash: string; userId: string; createdAt: number; expiresAt: number };
export type FinanceAccount = {
  id: string;
  ownerId: string;
  name: string;
  kind: "bank" | "cash" | "savings";
  currency: Currency;
  openingMinor: number;
  createdAt: string;
};
export type EntryKind = "income" | "expense";
export type EntryFields = {
  accountId: string;
  kind: EntryKind;
  amountMinor: number;
  currency: Currency;
  description: string;
  category: Category;
  date: string;
};
export type FinanceEntry = EntryFields & {
  id: string;
  ownerId: string;
  createdAt: string;
  draftId: string;
  source: "manual" | "pennybot";
  voidedAt?: string;
};
export type EntryDraft = EntryFields & {
  id: string;
  ownerId: string;
  createdAt: number;
  expiresAt: number;
  source: "manual" | "pennybot";
  mode: "rules" | "llm";
  entryId?: string;
};
export type PrivateState = {
  version: 1;
  users: PrivateUser[];
  sessions: LoginSession[];
  accounts: FinanceAccount[];
  entries: FinanceEntry[];
  drafts: EntryDraft[];
  limits: { key: string; count: number; expiresAt: number }[];
};
export type PublicUser = Pick<
  PrivateUser,
  "id" | "name" | "email" | "timeZone" | "demoProfile" | "demoExpiresAt"
>;
export type AccountView = Omit<FinanceAccount, "ownerId"> & { balanceMinor: number };
export type EntryView = Omit<FinanceEntry, "ownerId">;
export type DraftView = Omit<EntryDraft, "ownerId">;
export type FinanceOverview = {
  user: PublicUser;
  accounts: AccountView[];
  entries: EntryView[];
  totals: Record<Currency, { balanceMinor: number; incomeMinor: number; expenseMinor: number }>;
  month: string;
  today: string;
};
