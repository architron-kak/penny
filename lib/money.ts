export const cents = (value: number) => Math.round(value * 100);
export const dollars = (value: number) => Math.round(value) / 100;
export const money = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
