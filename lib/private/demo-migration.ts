import type { PrivateState } from "./types";

const labels: Record<string, string> = {
  Студент: "Student",
  Семья: "Family",
  Фрилансер: "Freelancer",
  "Карта в тенге": "Additional account",
  "Дополнительный счёт": "Additional account",
  "Долларовые накопления": "Savings",
  Накопления: "Savings",
  "Кошелёк для поездок": "Cash",
  "Основная карта": "Main account",
  "Проектный счёт": "Project account",
  Наличные: "Cash",
  "Оплата дизайн-проекта": "Design project payment",
  Зарплата: "Salary",
  "Стипендия и подработка": "Scholarship and part-time work",
  Кофе: "Coffee",
  Продукты: "Groceries",
  Коворкинг: "Coworking",
  Аренда: "Rent",
  "Музыкальная подписка": "Music subscription",
  "Покупка продуктов": "Grocery purchase",
  "Обед в поездке": "Lunch on a trip",
  "Семейный отпуск": "Family holiday",
  "Новый ноутбук": "New laptop",
  "Поездка летом": "Summer trip",
};
// Fixed fictional sample scaling only. Personal records never enter this upgrade.
export function upgradeDollarDemos(s: PrivateState) {
  for (const user of s.users) {
    if (!user.demoProfile || (user.demoVersion || 0) >= 3) continue;
    const upgradeCurrency = (user.demoVersion || 0) < 2;
    const scale = (n: number, currency: string) => (currency === "KZT" ? Math.round(n / 500) : n);
    for (const a of s.accounts.filter((a) => a.ownerId === user.id)) {
      if (upgradeCurrency) {
        a.openingMinor = scale(a.openingMinor, a.currency);
        a.currency = "USD";
      }
      a.name = labels[a.name] || a.name;
    }
    for (const e of s.entries.filter((e) => e.ownerId === user.id)) {
      if (upgradeCurrency) {
        e.amountMinor = Math.max(1, scale(e.amountMinor, e.currency));
        e.currency = "USD";
      }
      e.description = labels[e.description] || e.description;
    }
    // Any prior review must be repeated after its display fields change.
    s.drafts = s.drafts.filter((d) => d.ownerId !== user.id || d.entryId);
    for (const d of s.drafts.filter((d) => d.ownerId === user.id)) {
      if (upgradeCurrency) {
        d.amountMinor = Math.max(1, scale(d.amountMinor, d.currency));
        d.currency = "USD";
      }
      d.description = labels[d.description] || d.description;
    }
    for (const plan of Object.values(user.homePlan || {}))
      if (plan) plan.goalName = labels[plan.goalName] || plan.goalName;
    user.name = labels[user.name] || user.name;
    user.demoVersion = 3;
    user.adaptive = {};
  }
}
