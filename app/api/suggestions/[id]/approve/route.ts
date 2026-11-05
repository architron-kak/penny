import type { NextRequest } from "next/server";
import { z } from "zod";
import { api, assertSameOrigin, HttpError, jsonBody, userSchema } from "@/lib/http";
import { withDatabase, logActivity } from "@/lib/db";
import { sessionHash } from "@/lib/session";
import { createOrder } from "@/lib/paypal";
import { currentHabitSuggestions } from "@/lib/adaptive-home";
import { cents } from "@/lib/money";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    assertSameOrigin(request);
    const { user, approved, expectedAmount } = await jsonBody(
      request,
      z.object({
        user: userSchema,
        approved: z.literal(true),
        expectedAmount: z.number().positive().optional(),
      }),
    );
    void approved;
    const { id } = await context.params;
    const owner = await sessionHash();
    return withDatabase(async (db) => {
      let suggestion = db.suggestions.find((s) => s.id === id && s.userId === user);
      if (!suggestion && id.startsWith("habit-")) {
        suggestion = currentHabitSuggestions(db, user).find((s) => s.id === id);
        if (!suggestion)
          throw new HttpError(409, "This daily shortcut has expired. Refresh your home.");
        if (expectedAmount === undefined || cents(expectedAmount) !== cents(suggestion.amount))
          throw new HttpError(409, "The usual amount changed. Refresh and review it again.");
        db.suggestions.unshift(suggestion);
      }
      if (!suggestion) throw new HttpError(404, "Suggestion not found.");
      if (
        suggestion.habitMerchant &&
        (expectedAmount === undefined || cents(expectedAmount) !== cents(suggestion.amount))
      )
        throw new HttpError(409, "Review the payment amount again before approving.");
      if (suggestion.status === "dismissed" || suggestion.status === "paid")
        throw new HttpError(409, "This suggestion has already been resolved.");
      const existing = db.orders.find((o) => o.suggestionId === id);
      if (existing) {
        if (existing.sessionHash !== owner)
          throw new HttpError(
            409,
            "This demo suggestion was already approved in another browser session.",
          );
        return { orderId: existing.id, approvalUrl: existing.approvalUrl };
      }
      const remote = await createOrder(suggestion);
      const now = new Date().toISOString();
      db.orders.unshift({
        ...remote,
        suggestionId: id,
        userId: user,
        amount: suggestion.amount,
        currency: "USD",
        createdAt: now,
        updatedAt: now,
        sessionHash: owner,
      });
      suggestion.status = "approved";
      suggestion.approvedAt = now;
      logActivity(
        db,
        user,
        `You approved a $${suggestion.amount.toFixed(2)} Sandbox payment. Created order ${remote.id}; waiting for PayPal approval.`,
        "user",
      );
      return { orderId: remote.id, approvalUrl: remote.approvalUrl };
    });
  });
}
