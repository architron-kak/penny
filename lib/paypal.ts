import { z } from "zod";
import { HttpError } from "./http";
import type { Suggestion } from "./types";
const BASE = "https://api-m.sandbox.paypal.com";
let token: { value: string; expires: number } | undefined;
async function accessToken() {
  if (token && token.expires > Date.now() + 60000) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret)
    throw new HttpError(
      503,
      "PayPal Sandbox is not connected. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env.local and restart the app.",
    );
  const response = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new HttpError(
      502,
      "PayPal Sandbox authentication failed. Check your Sandbox app credentials.",
    );
  const data = z
    .object({ access_token: z.string(), expires_in: z.number() })
    .parse(await response.json());
  token = {
    value: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };
  return token.value;
}
async function paypal(
  path: string,
  method = "GET",
  body?: unknown,
  requestId?: string,
): Promise<unknown> {
  const bearer = await accessToken();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new HttpError(
      502,
      `PayPal Sandbox could not ${method === "GET" ? "check" : "process"} this order. Retry the action; duplicate requests use the same payment identifier.`,
    );
  return response.json();
}
const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(z.object({ href: z.string(), rel: z.string() })).optional(),
  purchase_units: z
    .array(
      z.object({
        custom_id: z.string().optional(),
        amount: z.object({ currency_code: z.string(), value: z.string() }).optional(),
        payments: z
          .object({
            captures: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string(),
                  amount: z.object({
                    currency_code: z.string(),
                    value: z.string(),
                  }),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
export type PayPalOrder = z.infer<typeof orderSchema>;
export async function createOrder(suggestion: Suggestion) {
  const origin = new URL(process.env.APP_URL || "http://localhost:3000").origin;
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: suggestion.id,
        custom_id: suggestion.id,
        description: `Penny demo: ${suggestion.title}`,
        amount: { currency_code: "USD", value: suggestion.amount.toFixed(2) },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Penny · Sandbox",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: `${origin}/?checkout=return&user=${suggestion.userId}`,
          cancel_url: `${origin}/?checkout=cancel&user=${suggestion.userId}`,
        },
      },
    },
  };
  const order = orderSchema.parse(
    await paypal("/v2/checkout/orders", "POST", body, `create-${suggestion.id}`),
  );
  const approvalUrl = order.links?.find(
    (l) => l.rel === "payer-action" || l.rel === "approve",
  )?.href;
  if (
    !approvalUrl ||
    (new URL(approvalUrl).hostname !== "www.sandbox.paypal.com" &&
      new URL(approvalUrl).hostname !== "sandbox.paypal.com")
  )
    throw new HttpError(502, "PayPal did not return a valid Sandbox approval link.");
  return { id: order.id, status: order.status, approvalUrl };
}
export async function getOrder(orderId: string) {
  return orderSchema.parse(await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}`));
}
export async function captureOrder(orderId: string) {
  return orderSchema.parse(
    await paypal(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      "POST",
      {},
      `capture-${orderId}`,
    ),
  );
}
export async function verifyWebhook(headers: Headers, event: unknown) {
  if (!process.env.PAYPAL_WEBHOOK_ID)
    throw new HttpError(503, "Webhook verification is not configured.");
  const names = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  if (names.some((n) => !headers.get(n)))
    throw new HttpError(400, "Missing PayPal signature headers.");
  const cert = new URL(headers.get("paypal-cert-url")!);
  if (
    cert.protocol !== "https:" ||
    (cert.hostname !== "api.sandbox.paypal.com" && cert.hostname !== "api-m.sandbox.paypal.com")
  )
    throw new HttpError(400, "Invalid Sandbox certificate URL.");
  const result = z.object({ verification_status: z.string() }).parse(
    await paypal("/v1/notifications/verify-webhook-signature", "POST", {
      auth_algo: headers.get(names[0]),
      cert_url: headers.get(names[1]),
      transmission_id: headers.get(names[2]),
      transmission_sig: headers.get(names[3]),
      transmission_time: headers.get(names[4]),
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    }),
  );
  return result.verification_status === "SUCCESS";
}
