import type { NextRequest } from "next/server";
import { z } from "zod";
import { api, assertSameOrigin, jsonBody, requestUser, userSchema } from "@/lib/http";
import { logActivity, readDatabase, withDatabase } from "@/lib/db";
import { planningView } from "@/lib/planning";
import { applyPlanningCommand, commandSchema } from "@/lib/planning-actions";
export async function GET(request: NextRequest) {
  return api(async () => planningView(await readDatabase(), requestUser(request)));
}
export async function POST(request: NextRequest) {
  return api(async () => {
    assertSameOrigin(request);
    const { user, command, requestId } = await jsonBody(
      request,
      z.object({
        user: userSchema,
        command: commandSchema,
        confirmed: z.literal(true),
        requestId: z.string().uuid(),
      }),
    );
    return withDatabase((db) => {
      const result = applyPlanningCommand(db, user, command, requestId);
      if (!result.duplicate)
        logActivity(
          db,
          user,
          `You confirmed a local planning action: ${command.type}. No PayPal transfer was initiated.`,
          "user",
        );
      return { ...result, planning: planningView(db, user) };
    });
  });
}
