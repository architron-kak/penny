import type { Currency } from "@/lib/private/types";
import type { Category } from "@/lib/types";
export const categoryLabels: Record<Category, string> = {
  groceries: "Продукты",
  "food & coffee": "Еда и кофе",
  transport: "Транспорт",
  subscriptions: "Подписки",
  shopping: "Покупки",
  utilities: "Жильё и счета",
  other: "Другое",
};
export const formatMoney = (minor: number, currency: Currency) =>
  new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    minor / 100,
  );
export const amountInput = (minor: number) => (minor / 100).toFixed(2);
