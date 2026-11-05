import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { api, assertSameOrigin, jsonBody, userSchema } from "@/lib/http";
import { readDatabase } from "@/lib/db";
import { commandSchema, applyPlanningCommand } from "@/lib/planning-actions";
import { planningView } from "@/lib/planning";
import { money } from "@/lib/money";
export async function POST(request: NextRequest) {
  return api(async () => {
    assertSameOrigin(request);
    const { user, command } = await jsonBody(
      request,
      z.object({ user: userSchema, command: commandSchema }),
    );
    const original = await readDatabase(),
      before = planningView(original, user),
      trial = structuredClone(original);
    applyPlanningCommand(trial, user, command, randomUUID());
    const after = planningView(trial, user);
    const topic =
      command.type === "savings-save"
        ? "savings"
        : command.type.startsWith("debt")
          ? "debts"
          : command.type.startsWith("refund")
            ? "refunds"
            : command.type === "profile"
              ? "purchase"
              : "delay";
    return {
      mode: "rules",
      answer:
        command.type === "savings-save"
          ? `Preview only — ${command.name}: ${money(command.saved)} saved toward ${money(command.target)}. No balance change or transfer. Confirm below to save.`
          : `Preview only — nothing saved. ${command.type}: available balance ${money(before.profile.balance || 0)} → ${money(after.profile.balance || 0)}; headphone limit ${money(before.purchase.limit)} → ${money(after.purchase.limit)}. ${after.debtForecast.firstShortfall ? `First cash shortfall ${money(after.debtForecast.firstShortfall.amount)} on ${after.debtForecast.firstShortfall.date}, for ${after.debtForecast.firstShortfall.payment}.` : "Scheduled payments fit this cash forecast."} Confirm below to save this local record. This action does not call PayPal.`,
      context: { topic },
      planning: after,
      preview: command.type === "debt-schedule" ? after.debtForecast : undefined,
      actions: [{ label: "Confirm and save", command }],
    };
  });
}
