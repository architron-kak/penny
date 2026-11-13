import type { Currency } from "./private/types";
export type HeardAmount =
  { ok: true; amountMinor: number; currency: Currency } | { ok: false; error: string };
const small = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const tens = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const words = [...small, ...tens, "hundred", "thousand", "million", "point", "and"];
function underHundred(tokens: string[]): number | null {
  if (tokens.length === 1 && small.includes(tokens[0])) return small.indexOf(tokens[0]);
  if (tokens.length >= 1 && tokens.length <= 2 && tens.includes(tokens[0])) {
    const unit = tokens.length === 1 ? 0 : small.indexOf(tokens[1]);
    if (tokens.length === 2 && (unit < 1 || unit > 9)) return null;
    return (tens.indexOf(tokens[0]) + 2) * 10 + unit;
  }
  return null;
}
function underThousand(tokens: string[]): number | null {
  const hundred = tokens.indexOf("hundred");
  if (hundred < 0) return underHundred(tokens);
  const head = small.indexOf(tokens[0]);
  if (hundred !== 1 || head < 1 || head > 9) return null;
  let rest = tokens.slice(2);
  if (rest[0] === "and") rest = rest.slice(1);
  const tail = rest.length ? underHundred(rest) : 0;
  return tail === null ? null : head * 100 + tail;
}
function integerWords(tokens: string[]): number | null {
  let rest = tokens,
    total = 0;
  for (const [scale, factor] of [
    ["million", 1000000],
    ["thousand", 1000],
  ] as const) {
    const index = rest.indexOf(scale);
    if (index < 0) continue;
    const head = underThousand(rest.slice(0, index));
    if (head === null || head === 0) return null;
    total += head * factor;
    rest = rest.slice(index + 1);
    if (rest[0] === "and") rest = rest.slice(1);
  }
  const tail = rest.length ? underThousand(rest) : 0;
  return tail === null ? null : total + tail;
}
function numberMinor(raw: string): { minor: number; whole: boolean } | null {
  if (/^\d/.test(raw)) {
    const value = raw.trim();
    let clean = value;
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value)) clean = value.replaceAll(",", "");
    else if (/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/.test(value))
      clean = value.replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
    else if (/^\d+(?:[.,]\d{1,2})?$/.test(value)) clean = value.replace(",", ".");
    else return null;
    const [whole, fraction = ""] = clean.split(".");
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return minor <= 1000000000000n ? { minor: Number(minor), whole: !clean.includes(".") } : null;
  }
  const parts = raw.replace(/-/g, " ").trim().split(/\s+/).filter(Boolean);
  while (parts[0] === "and") parts.shift();
  while (parts.at(-1) === "and") parts.pop();
  const point = parts.indexOf("point"),
    whole = integerWords(point < 0 ? parts : parts.slice(0, point));
  if (whole === null) return null;
  const fraction = point < 0 ? [] : parts.slice(point + 1);
  if (
    point >= 0 &&
    (!fraction.length ||
      fraction.length > 2 ||
      fraction.some((t) => small.indexOf(t) < 0 || small.indexOf(t) > 9))
  )
    return null;
  const decimal = fraction
    .map((t) => small.indexOf(t))
    .join("")
    .padEnd(2, "0");
  return { minor: whole * 100 + Number(decimal), whole: point < 0 };
}
/** Conservative English amount extraction. No totals are added or chosen from alternatives. */
export function readSpokenAmount(input: string, fallback: Currency = "USD"): HeardAmount {
  const text = input.trim().toLowerCase();
  const fail = (error: string): HeardAmount => ({ ok: false, error });
  if (!text || text.length > 1000) return fail("Enter or say one amount.");
  if (/\b(?:minus|negative)\b|(?:^|[\s$€₸])-|-\s*\d|[−–—]|\b(?:usd|eur|kzt)-/.test(text))
    return fail("Use one positive amount.");
  const currencies = new Set<Currency>();
  if (/\b(?:usd|dollars?)\b|\$/.test(text)) currencies.add("USD");
  if (/\b(?:eur|euros?)\b|€/.test(text)) currencies.add("EUR");
  if (/\b(?:kzt|tenge)\b|₸|тенге/i.test(text)) currencies.add("KZT");
  if (currencies.size > 1 || /\b(?:gbp|rub|cad|aud|jpy|cny|pounds?|rubles?)\b|£|₽|¥/.test(text))
    return fail("Use one supported currency: USD, EUR or KZT.");
  const currency = [...currencies][0] || fallback;
  if (
    (currency === "KZT" && /\bcents?\b/.test(text)) ||
    (currency !== "KZT" && /\btiyn\b/.test(text))
  )
    return fail("Check the currency and minor units manually.");
  const pattern = new RegExp(
    `\\b(?:${words.join("|")})(?:[ -]+(?:${words.join("|")}))*\\b|\\d+(?:(?:[.,]|[ \\u00a0\\u202f]+)\\d+)*`,
    "g",
  );
  const matches = [...text.matchAll(pattern)].filter((m) => m[0].replace(/\band\b/g, "").trim());
  if (matches.length !== 1 && matches.length !== 2)
    return fail("No single amount found. Type the cashier’s amount to check it.");
  const parsed = matches.map((m) => numberMinor(m[0]));
  if (parsed.some((n) => !n))
    return fail(
      "The amount is unclear. Use a form such as 24.50 or twenty-four dollars and fifty cents.",
    );
  let amountMinor = parsed[0]!.minor;
  if (matches.length === 2) {
    const between = text.slice(matches[0].index! + matches[0][0].length, matches[1].index);
    const after = text.slice(matches[1].index! + matches[1][0].length);
    if (
      !/^\s*(?:dollars?|usd|euros?|eur|tenge|kzt)\s*(?:and\s*)?$/.test(between) ||
      !/^\s*(?:cents?|tiyn)\b/.test(after) ||
      !parsed[0]!.whole ||
      !parsed[1]!.whole ||
      parsed[1]!.minor > 9900
    )
      return fail("Several numbers were heard. Check and enter just the final amount.");
    amountMinor += parsed[1]!.minor / 100;
  } else if (/^\s*(?:cents?|tiyn)\b/.test(text.slice(matches[0].index! + matches[0][0].length))) {
    if (!parsed[0]!.whole) return fail("Check the cents amount manually.");
    amountMinor /= 100;
  } else if (/\b(?:cents?|tiyn)\b/.test(text)) {
    return fail("Check the cents amount manually.");
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 1000000000000)
    return fail("Use a positive amount within the supported range.");
  return { ok: true, amountMinor, currency };
}
