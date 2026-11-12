import type { Currency } from "./private/types";
const formatters = new Map<Currency, Intl.NumberFormat>();
export function formatCurrency(minor: number, currency: Currency) {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(minor / 100);
}
