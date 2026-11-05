import { planningChat } from "@/lib/planning-chat";
import { readDatabase } from "@/lib/db";
import { purchaseOptionsSchema } from "@/lib/planning-actions";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { api, assertSameOrigin, jsonBody, userSchema } from "@/lib/http";
import { getHome } from "@/lib/home";
import { money } from "@/lib/money";
import { structuredLLM } from "@/lib/llm";
export async function POST(request: NextRequest) {
  return api(async () => {
    assertSameOrigin(request);
    const { user, message, context } = await jsonBody(
      request,
      z.object({
        user: userSchema,
        context: z
          .object({
            debtDraft: z
              .object({
                person: z.string().max(60),
                direction: z.enum(["payable", "receivable"]),
                amount: z.number().positive().max(100000),
                firstAmount: z.number().positive().max(100000),
              })
              .optional(),
            topic: z.enum([
              "purchase",
              "savings",
              "debts",
              "refunds",
              "price",
              "delay",
              "payment",
              "overview",
              "coffee",
              "subscriptions",
              "merchant",
            ]),
            entityId: z.string().optional(),
            options: purchaseOptionsSchema.optional(),
          })
          .optional(),
        message: z.string().trim().min(1).max(500),
      }),
    );
    const home = await getHome(user);
    const planned = planningChat(await readDatabase(), user, message, context);
    if (planned) return planned;
    const i = home.insights;
    if (context?.topic === "merchant") {
      const rows = home.transactions.filter(
        (t) => t.merchant === context.entityId && t.amount > 0 && t.date.startsWith(i.month),
      );
      return {
        mode: "rules",
        context,
        answer: `${context.entityId}: ${rows.length} purchases this month, total ${money(rows.reduce((sum, t) => sum + t.amount, 0))}. ${rows.map((t) => `${t.date}: ${money(t.amount)}`).join("; ")}`,
      };
    }
    const facts = {
      overview: `Your spending is ${money(i.currentSpend)} this month across ${i.transactionCount} transactions. Your monthly budget is ${money(home.persona.monthlyBudget)}; ${money(Math.abs(i.budgetRemaining))} ${i.budgetRemaining < 0 ? "over budget" : "remains"}.`,
      coffee: `Food & coffee totals ${money(i.categorySpend["food & coffee"])} this month. Your budget is ${money(home.persona.budgets["food & coffee"])}.`,
      groceries: `Groceries total ${money(i.categorySpend.groceries)} this month against a ${money(home.persona.budgets.groceries)} budget.`,
      subscriptions: `Active subscriptions cost ${money(i.subscriptionTotal)} per month. ${i.unusedSubscriptions.length} have not been used in over 45 days${i.unusedSubscriptions.length ? `: ${i.unusedSubscriptions.map((s) => s.merchant).join(", ")}` : ""}. Cancellation suggestions are local only.`,
      comparison: `This month: ${money(i.currentSpend)}. Previous month: ${money(i.previousSpend)}. Average of the previous five months: ${money(i.averageSpend)}. These compare a partial current month with full previous months.`,
      payments:
        "I only suggest payments. You must approve in Penny, confirm in PayPal Sandbox, and click Complete payment on return. No real money is used.",
    };
    const keys = Object.keys(facts) as (keyof typeof facts)[];
    const fallback = () => ({
      factIds: [
        /coffee|food|cafe|кофе|еда/i.test(message)
          ? "coffee"
          : /grocer|продукт/i.test(message)
            ? "groceries"
            : /subscr|unused|cancel|подпис/i.test(message) || context?.topic === "subscriptions"
              ? "subscriptions"
              : /last month|compar|average|прошл|средн/i.test(message)
                ? "comparison"
                : /pay|approve|плат|оплат/i.test(message)
                  ? "payments"
                  : "overview",
      ] as (keyof typeof facts)[],
    });
    // The model selects computed facts; every displayed number and sentence comes from server templates.
    const schema = z.object({
      factIds: z
        .array(
          z.enum(["overview", "coffee", "groceries", "subscriptions", "comparison", "payments"]),
        )
        .min(1)
        .max(3),
    });
    const result = await structuredLLM(
      "Select fact IDs that best answer the user's question. You cannot create facts or payments.",
      { question: message, facts },
      schema,
      fallback,
    );
    return {
      context: {
        topic: result.data.factIds.includes("coffee")
          ? "coffee"
          : result.data.factIds.includes("subscriptions")
            ? "subscriptions"
            : "overview",
      },
      answer: [...new Set(result.data.factIds)]
        .filter((id) => keys.includes(id))
        .map((id) => facts[id])
        .join("\n\n"),
      mode: result.mode,
    };
  });
}
