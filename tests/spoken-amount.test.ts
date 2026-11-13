import { describe, it, expect } from "vitest";
import { readSpokenAmount } from "../lib/spoken-amount";
describe("cashier amount recognition", () => {
  it.each([
    ["The total is twenty-four dollars and fifty cents", 2450, "USD"],
    ["24 dollars and 50 cents", 2450, "USD"],
    ["Twenty four point five zero dollars", 2450, "USD"],
    ["It comes to $24.50", 2450, "USD"],
    ["The total is one hundred and twelve dollars and five cents", 11205, "USD"],
    ["fifty cents", 50, "USD"],
    ["zero dollars and fifty cents", 50, "USD"],
    ["one thousand two hundred and thirty-four dollars", 123400, "USD"],
    ["1,234.50 USD", 123450, "USD"],
    ["4 500,50 tenge", 450050, "KZT"],
    ["25 euros", 2500, "EUR"],
    ["twenty euros and ten cents", 2010, "EUR"],
  ])("extracts %s", (text, minor, currency) => {
    expect(readSpokenAmount(text as string)).toEqual({ ok: true, amountMinor: minor, currency });
  });
  it.each([
    "nineteen dollars or twenty-four dollars",
    "24.50 and 25.50",
    "twenty four fifty",
    "one two dollars",
    "24 50 dollars",
    "-24 dollars",
    "- twenty dollars",
    "minus twenty dollars",
    "24.999 USD",
    "24 dollars and 150 cents",
    "24.50 dollars and fifty cents",
    "24 USD or 25 EUR",
    "24 CAD",
    "20 pounds",
    "1e3",
    "zero dollars",
    "USD-24",
    "USD-twenty",
    "−24 USD",
    "cents 50",
    "24. cents",
    "50 tiyn USD",
    "nothing here",
    "",
  ])("refuses unclear or invalid speech: %s", (text) => {
    expect(readSpokenAmount(text).ok).toBe(false);
  });
  it("uses the selected currency only when the speaker omitted a currency", () => {
    expect(readSpokenAmount("4500", "KZT")).toEqual({
      ok: true,
      amountMinor: 450000,
      currency: "KZT",
    });
    expect(readSpokenAmount("25 dollars", "KZT")).toEqual({
      ok: true,
      amountMinor: 2500,
      currency: "USD",
    });
  });
});
