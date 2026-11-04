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
    const { user } = await jsonBody(request, z.object({ user: userSchema }));
    const { id } = await context.params;
    return withDatabase((db) => {
      const suggestion = db.suggestions.find(
        (s) => s.id === id && s.userId === user,
      );
      if (!suggestion) throw new HttpError(404, "Suggestion not found.");
      if (suggestion.status !== "proposed")
        throw new HttpError(
          409,
          "Only unapproved suggestions can be dismissed.",
        );
      suggestion.status = "dismissed";
      logActivity(
        db,
        user,
        `You dismissed “${suggestion.title}”. No order was created.`,
        "user",
      );
      return { status: "dismissed" };
    });
  });
}
