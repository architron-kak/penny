import type { NextRequest } from "next/server";
import { z } from "zod";
import { api, HttpError, jsonBody } from "@/lib/http";
import { verifyWebhook } from "@/lib/paypal";
import { withDatabase } from "@/lib/db";
import { settleOrder } from "@/lib/payments";
export async function POST(request: NextRequest) {
  return api(async () => {
    const event = await jsonBody(
      request,
      z
        .object({
          id: z.string(),
          event_type: z.string(),
          resource: z.record(z.string(), z.unknown()),
        })
        .passthrough(),
    );
    if (!(await verifyWebhook(request.headers, event)))
      throw new HttpError(401, "Invalid PayPal webhook signature.");
    return withDatabase((db) => {
      if (db.webhookIds.includes(event.id))
        return { received: true, duplicate: true };
      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const resource = z
          .object({
            id: z.string(),
            status: z.literal("COMPLETED"),
            amount: z.object({ currency_code: z.string(), value: z.string() }),
            supplementary_data: z.object({
              related_ids: z.object({ order_id: z.string() }),
            }),
          })
          .parse(event.resource);
        const order = db.orders.find(
          (o) => o.id === resource.supplementary_data.related_ids.order_id,
        );
        if (order) settleOrder(db, order, resource);
      }
      db.webhookIds.push(event.id);
      db.webhookIds = db.webhookIds.slice(-2000);
      return { received: true };
    });
  });
}
