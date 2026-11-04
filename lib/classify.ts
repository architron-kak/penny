import { z } from "zod";
import {
  categories,
  type Category,
  type Database,
  type PersonaId,
  type Transaction,
} from "./types";
import { structuredLLM } from "./llm";
import { logActivity, readDatabase, withDatabase } from "./db";
export const classificationKey = (t: Transaction) =>
  `${t.merchant.toLowerCase()}|${t.description.toLowerCase()}`;
export function classifyByRules(
  merchant: string,
  description: string,
): Category {
  const text = `${merchant} ${description}`.toLowerCase();
  if (
    /subscription|renewal|streambox|soundwave|code cloud|design studio|task space|stock library|fit club|study cloud|family cloud/.test(
      text,
    )
  )
    return "subscriptions";
  if (/grocer|produce|fresh market/.test(text)) return "groceries";
  if (
    /coffee|latte|lunch|dinner|noodle|kitchen|takeaway|breakfast|food|snack/.test(
      text,
    )
  )
    return "food & coffee";
  if (/transport|transit|flight|taxi|cab|runway|bus fare/.test(text))
    return "transport";
  if (/utilities|energy|water bill|internet|electricity/.test(text))
    return "utilities";
  if (/shopping|supply|book nook|equipment/.test(text)) return "shopping";
  return "other";
}
const inFlight = new Map<string, Promise<void>>();
export async function ensureClassified(userId: PersonaId) {
  const running = inFlight.get(userId);
  if (running) return running;
  const work = classifyUser(userId);
  inFlight.set(userId, work);
  try {
    await work;
  } finally {
    inFlight.delete(userId);
  }
}
async function classifyUser(userId: PersonaId) {
  const db = await readDatabase();
  const mode = process.env.LLM_API_KEY ? "llm" : "rules";
  const missing = db.transactions.filter(
    (t) =>
      t.userId === userId &&
      t.amount > 0 &&
      (!db.classification[classificationKey(t)] ||
        (mode === "llm" &&
          db.classification[classificationKey(t)].mode !== "llm")),
  );
  if (!missing.length) return;
  const distinct = [
    ...new Map(missing.map((t) => [classificationKey(t), t])).values(),
  ];
  const keys = distinct.map(classificationKey);
  const schema = z
    .object({
      classifications: z
        .array(z.object({ key: z.string(), category: z.enum(categories) }))
        .length(keys.length),
    })
    .refine(
      (value) =>
        new Set(value.classifications.map((c) => c.key)).size === keys.length &&
        value.classifications.every((c) => keys.includes(c.key)),
      "Every input key must appear exactly once",
    );
  const result = await structuredLLM(
    "Classify each merchant/description into one category. Copy the input key exactly.",
    distinct.map((t) => ({
      key: classificationKey(t),
      merchant: t.merchant,
      description: t.description,
    })),
    schema,
    () => ({
      classifications: distinct.map((t) => ({
        key: classificationKey(t),
        category: classifyByRules(t.merchant, t.description),
      })),
    }),
  );
  await withDatabase((current) => {
    for (const row of result.data.classifications)
      current.classification[row.key] = {
        category: row.category,
        mode: result.mode,
      };
    for (const t of current.transactions)
      if (t.userId === userId && t.amount > 0)
        t.category =
          current.classification[classificationKey(t)]?.category ||
          classifyByRules(t.merchant, t.description);
    logActivity(
      current,
      userId,
      `Classified ${missing.length} synthetic transactions using ${result.mode === "llm" ? "validated AI" : "built-in rules"}.`,
    );
  });
}
export function applyClassification(db: Database, userId: PersonaId) {
  return db.transactions
    .filter((t) => t.userId === userId)
    .map((t) => ({
      ...t,
      category:
        t.category ||
        db.classification[classificationKey(t)]?.category ||
        classifyByRules(t.merchant, t.description),
    }));
}
