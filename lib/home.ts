import { planningView } from "./planning";
import { planningCards } from "./planning-cards";
import { money } from "./money";
import { createHash } from "node:crypto";
import { z } from "zod";
import { applyClassification, ensureClassified } from "./classify";
import { readDatabase, withDatabase } from "./db";
import { computeInsights } from "./insights";
import { structuredLLM } from "./llm";
import { rankCards } from "./ranking";
import type { HomeData, PersonaId } from "./types";
export async function getHome(userId: PersonaId): Promise<HomeData> {
  await ensureClassified(userId);
  const db = await readDatabase();
  const persona = db.personas.find((p) => p.id === userId)!;
  const transactions = applyClassification(db, userId);
  const subscriptions = db.subscriptions.filter((s) => s.userId === userId);
  // Demo data is anchored to its seed date, so six-month comparisons remain reproducible.
  const insights = computeInsights(transactions, subscriptions, persona, new Date(db.seedDate));
  const suggestions = db.suggestions.filter((s) => s.userId === userId);
  const planning = planningView(db, userId);
  const legacy = rankCards(insights, persona, suggestions)
    .filter((c) => c.kind !== "SubscriptionAlert" || insights.unusedSubscriptions.length)
    .filter((c) => c.kind !== "CategoryBudget" || c.priority >= 75)
    .map((c) => ({
      ...c,
      headline:
        c.kind === "SpendingSummary"
          ? `${money(insights.currentSpend)} spent this month`
          : c.kind === "CategoryBudget"
            ? `${c.category} · ${money(Math.abs(insights.categoryRemaining[c.category!]))} ${insights.categoryRemaining[c.category!] < 0 ? "over budget" : "remaining"}`
            : c.kind === "SubscriptionAlert"
              ? `${insights.unusedSubscriptions.length} subscriptions unused for over 45 days`
              : c.kind === "SuggestedPayment"
                ? `Review ${money(suggestions.find((s) => s.id === c.suggestionId)!.amount)} Sandbox payment`
                : `${c.merchant} · a recurring habit`,
      topic: (c.kind === "SuggestedPayment"
        ? "payment"
        : c.kind === "SubscriptionAlert"
          ? "subscriptions"
          : c.kind === "MerchantShortcut"
            ? "merchant"
            : "overview") as import("./planning-types").ChatContext["topic"],
      entityId: c.suggestionId || c.merchant,
    }));
  const cards = [...legacy, ...planningCards(planning)].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        userId,
        cards,
        provider: process.env.LLM_PROVIDER,
        model: process.env.LLM_MODEL,
        enabled: !!process.env.LLM_API_KEY,
      }),
    )
    .digest("hex");
  let reasonResult = db.reasons[cacheKey];
  if (!reasonResult) {
    const ids = cards.map((c) => c.id);
    const schema = z
      .object({
        reasons: z
          .array(z.object({ id: z.string(), reason: z.string().min(10).max(220) }))
          .length(ids.length),
      })
      .refine(
        (v) =>
          new Set(v.reasons.map((r) => r.id)).size === ids.length &&
          v.reasons.every((r) => ids.includes(r.id)),
        "Use every card id exactly once",
      );
    const result = await structuredLLM(
      "Write one brief friendly sentence explaining each card's priority. Use only supplied facts. Do not change priority or propose additional payments.",
      cards,
      schema,
      () => ({ reasons: cards.map((c) => ({ id: c.id, reason: c.reason })) }),
    );
    reasonResult = {
      reasons: Object.fromEntries(result.data.reasons.map((r) => [r.id, r.reason])),
      mode: result.mode,
    };
    const cached = reasonResult;
    await withDatabase((current) => {
      current.reasons[cacheKey] = cached;
      const keys = Object.keys(current.reasons);
      if (keys.length > 100) delete current.reasons[keys[0]];
    });
  }
  return {
    planning,
    persona,
    personas: db.personas,
    insights,
    cards: cards.map((c) => ({
      ...c,
      reason: reasonResult.reasons[c.id] || c.reason,
    })),
    transactions,
    subscriptions,
    suggestions,
    orders: db.orders
      .filter((o) => o.userId === userId)
      .map(({ sessionHash: _private, ...order }) => {
        void _private;
        return order;
      }),
    activities: db.activities.filter((a) => a.userId === userId).slice(0, 25),
    aiMode: reasonResult.mode,
    paypalReady: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    seedDate: db.seedDate,
  };
}
