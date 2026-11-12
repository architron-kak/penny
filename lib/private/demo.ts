import { randomUUID } from "node:crypto";
import { calendarDay } from "./ledger";
import { demoProfiles, type DemoProfile } from "./demo-profiles";
import type { Currency, FinanceAccount, PrivateState, PrivateUser, EntryFields } from "./types";

// Every visitor receives an independent copy. These users have no password login.
export function seedJudgeWorkspace(s: PrivateState, profile: DemoProfile): PrivateUser {
  const now = Date.now(),
    createdAt = new Date(now).toISOString(),
    id = randomUUID();
  const user: PrivateUser = {
    id,
    name: demoProfiles.find((p) => p.id === profile)!.title,
    email: `demo-${id}@penny.invalid`,
    passwordHash: "",
    timeZone: "Asia/Almaty",
    createdAt,
    demoProfile: profile,
    demoVersion: 3,
    demoExpiresAt: now + 24 * 60 * 60 * 1000,
  };
  s.users.push(user);
  const account = (
    name: string,
    currency: Currency,
    openingMinor: number,
    kind: FinanceAccount["kind"] = "bank",
  ) => {
    const a: FinanceAccount = {
      id: randomUUID(),
      ownerId: id,
      name,
      currency,
      openingMinor,
      kind,
      createdAt,
    };
    s.accounts.push(a);
    return a;
  };
  const primary =
    profile === "freelancer"
      ? account("Project account", "USD", 240000)
      : account("Main account", "USD", profile === "family" ? 620000 : 120000);
  const secondary = account(
    "Savings",
    "USD",
    profile === "family" ? 180000 : profile === "freelancer" ? 85000 : 22000,
    "savings",
  );
  const euro = account("Cash", "USD", profile === "family" ? 58000 : 14000, "cash");
  const day = calendarDay(user.timeZone);
  const date = (offset: number) =>
    new Date(Date.parse(day + "T12:00:00Z") - offset * 86400000).toISOString().slice(0, 10);
  const add = (
    a: FinanceAccount,
    kind: EntryFields["kind"],
    amountMinor: number,
    description: string,
    category: EntryFields["category"],
    offset: number,
  ) => {
    s.entries.push({
      id: randomUUID(),
      ownerId: id,
      accountId: a.id,
      currency: a.currency,
      kind,
      amountMinor,
      description,
      category,
      date: date(offset),
      createdAt,
      draftId: randomUUID(),
      source: "manual",
    });
  };
  const freelance = profile === "freelancer",
    family = profile === "family";
  add(
    primary,
    "income",
    freelance ? 185000 : family ? 480000 : 80000,
    freelance ? "Design project payment" : family ? "Salary" : "Scholarship and part-time work",
    "other",
    6,
  );
  for (const offset of [0, 2, 4]) {
    add(
      primary,
      "expense",
      freelance ? 450 : family ? 650 : 350,
      "Coffee",
      "food & coffee",
      offset,
    );
    add(
      primary,
      "expense",
      freelance ? 4850 : family ? 8500 : 2450,
      "Groceries",
      "groceries",
      offset + 1,
    );
  }
  add(
    primary,
    "expense",
    freelance ? 30000 : family ? 180000 : 35000,
    freelance ? "Coworking" : "Rent",
    "utilities",
    3,
  );
  add(primary, "expense", freelance ? 1200 : 999, "Music subscription", "subscriptions", 2);
  add(secondary, "expense", 950, "Grocery purchase", "groceries", 1);
  add(euro, "expense", 1250, "Lunch on a trip", "food & coffee", 2);
  user.homePlan = {
    USD: {
      debtMinor: family ? 24000 : freelance ? 12000 : 6500,
      goalName: family ? "Family holiday" : freelance ? "New laptop" : "Summer trip",
      goalTargetMinor: family ? 300000 : freelance ? 180000 : 80000,
    },
  };
  return user;
}
