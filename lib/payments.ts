import { ensurePlanning } from "./planning";
import { dollars } from "./money";
import type { Database, Order } from "./types";
import { cents } from "./money";
import { logActivity } from "./db";
import { HttpError } from "./http";
import type { PayPalOrder } from "./paypal";
export function validateRemoteOrder(remote: PayPalOrder, order: Order) {
  if (remote.id !== order.id || remote.purchase_units?.length !== 1)
    throw new HttpError(409, "PayPal order does not match this suggestion.");
  const unit = remote.purchase_units[0];
  if (
    unit.custom_id !== order.suggestionId ||
    unit.amount?.currency_code !== "USD" ||
    cents(Number(unit.amount.value)) !== cents(order.amount)
  )
    throw new HttpError(409, "PayPal amount or reference does not match this suggestion.");
}
export function settleOrder(
  db: Database,
  order: Order,
  capture: {
    id: string;
    status: string;
    amount: { currency_code: string; value: string };
  },
) {
  if (
    capture.status !== "COMPLETED" ||
    capture.amount.currency_code !== "USD" ||
    cents(Number(capture.amount.value)) !== cents(order.amount)
  )
    throw new HttpError(409, "The capture is not completed or its amount does not match.");
  if (order.status === "COMPLETED") return;
  const suggestion = db.suggestions.find((s) => s.id === order.suggestionId);
  if (!suggestion?.approvedAt)
    throw new HttpError(409, "This suggestion was not explicitly approved.");
  const now = new Date().toISOString();
  order.status = "COMPLETED";
  order.captureId = capture.id;
  order.capturedAt = now;
  order.updatedAt = now;
  suggestion.status = "paid";
  const profile = ensurePlanning(db).profiles[order.userId];
  if (profile.balance !== null)
    profile.balance = dollars(cents(profile.balance) - cents(order.amount));
  if (!db.transactions.some((t) => t.id === `capture-${capture.id}`))
    db.transactions.unshift({
      id: `capture-${capture.id}`,
      userId: order.userId,
      date: now.slice(0, 10),
      merchant: "Penny Sandbox Merchant",
      description: suggestion.title,
      amount: order.amount,
      currency: "USD",
      category: "other",
      source: "paypal-sandbox",
    });
  logActivity(
    db,
    order.userId,
    `Sandbox payment completed: $${order.amount.toFixed(2)}. Capture ${capture.id}.`,
    "payment",
  );
}
