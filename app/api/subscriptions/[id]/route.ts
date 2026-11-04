import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  api,
  assertSameOrigin,
  HttpError,
  jsonBody,
  userSchema,
} from "@/lib/http";
import { withDatabase, logActivity } from "@/lib/db";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    assertSameOrigin(request);
    const { user, action } = await jsonBody(
      request,
      z.object({
        user: userSchema,
        action: z.enum(["suggest-cancel", "undo"]),
      }),
    );
    const { id } = await context.params;
    return withDatabase((db) => {
      const sub = db.subscriptions.find(
        (s) => s.id === id && s.userId === user,
      );
      if (!sub) throw new HttpError(404, "Subscription not found.");
      sub.status = action === "undo" ? "active" : "cancel-suggested";
      logActivity(
        db,
        user,
        `${action === "undo" ? "Removed" : "Saved"} a local cancellation suggestion for ${sub.merchant}. No subscription was changed with the merchant.`,
        "user",
      );
      return { status: sub.status };
    });
  });
}
