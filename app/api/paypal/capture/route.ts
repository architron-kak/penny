import type { NextRequest } from "next/server";
import { z } from "zod";
import { api, assertSameOrigin, HttpError, jsonBody } from "@/lib/http";
import { withDatabase } from "@/lib/db";
import { sessionHash } from "@/lib/session";
import { captureOrder, getOrder } from "@/lib/paypal";
import { settleOrder, validateRemoteOrder } from "@/lib/payments";
export async function POST(request: NextRequest) {
  return api(async () => {
    assertSameOrigin(request);
    const { orderId } = await jsonBody(
      request,
      z.object({
        orderId: z.string().regex(/^[A-Z0-9]{8,40}$/),
        userApproved: z.literal(true),
      }),
    );
    const owner = await sessionHash();
    return withDatabase(async (db) => {
      const order = db.orders.find((o) => o.id === orderId);
      if (!order) throw new HttpError(404, "Order not found.");
      if (order.sessionHash !== owner)
        throw new HttpError(
          403,
          "Complete the payment in the browser where you approved it.",
        );
      if (!db.suggestions.find((s) => s.id === order.suggestionId)?.approvedAt)
        throw new HttpError(409, "User approval is required.");
      if (order.status === "COMPLETED")
        return { orderId, status: order.status };
      const remote = await getOrder(orderId);
      validateRemoteOrder(remote, order);
      if (remote.status !== "APPROVED" && remote.status !== "COMPLETED")
        throw new HttpError(
          409,
          "Approve this order in PayPal Sandbox before completing it.",
        );
      const captured =
        remote.status === "COMPLETED" ? remote : await captureOrder(orderId);
      const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
      if (capture?.status === "COMPLETED") settleOrder(db, order, capture);
      else {
        order.status = capture?.status || captured.status;
        order.updatedAt = new Date().toISOString();
      }
      return { orderId, status: order.status };
    });
  });
}
