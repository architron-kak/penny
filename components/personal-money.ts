import type { Currency } from "@/lib/private/types";
import type { Category } from "@/lib/types";
import { formatCurrency } from "@/lib/currency";
export const categoryLabels: Record<Category, string> = {
  groceries: "Groceries",
  "food & coffee": "Food & coffee",
  transport: "Transport",
  subscriptions: "Subscriptions",
  shopping: "Shopping",
  utilities: "Housing & bills",
  other: "Other",
};
export const formatMoney = (minor: number, currency: Currency) => formatCurrency(minor, currency);
export const amountInput = (minor: number) => (minor / 100).toFixed(2);
