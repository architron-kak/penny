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
      ? account("Проектный счёт", "USD", 240000)
      : account("Основная карта", "KZT", profile === "family" ? 62000000 : 12000000);
  const secondary =
    primary.currency === "USD"
      ? account("Карта в тенге", "KZT", 36000000)
      : account("Долларовые накопления", "USD", profile === "family" ? 180000 : 22000, "savings");
  const euro = account("Кошелёк для поездок", "EUR", profile === "family" ? 58000 : 14000, "cash");
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
    freelance ? 185000 : family ? 90000000 : 18000000,
    freelance ? "Оплата дизайн-проекта" : family ? "Зарплата" : "Стипендия и подработка",
    "other",
    6,
  );
  for (const offset of [0, 2, 4]) {
    add(
      primary,
      "expense",
      freelance ? 450 : family ? 250000 : 120000,
      "Кофе",
      "food & coffee",
      offset,
    );
    add(
      primary,
      "expense",
      freelance ? 4850 : family ? 2850000 : 450000,
      "Продукты",
      "groceries",
      offset + 1,
    );
  }
  add(
    primary,
    "expense",
    freelance ? 30000 : family ? 18000000 : 3500000,
    freelance ? "Коворкинг" : "Аренда",
    "utilities",
    3,
  );
  add(primary, "expense", freelance ? 1200 : 399000, "Музыкальная подписка", "subscriptions", 2);
  add(
    secondary,
    "expense",
    secondary.currency === "USD" ? 950 : 450000,
    "Покупка продуктов",
    "groceries",
    1,
  );
  add(euro, "expense", 1250, "Обед в поездке", "food & coffee", 2);
  return user;
}
