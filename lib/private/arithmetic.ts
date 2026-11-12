import { HttpError } from "../http";
export function sumMinor(values: number[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER))
    throw new HttpError(409, "The total exceeds the supported range.");
  return Number(total);
}
