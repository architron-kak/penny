import { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, HttpError } from "../http";
import { createOrder, getOrder, captureOrder, type PayPalOrder } from "../paypal";
import { privateApi, privateBody } from "./http";
import { withPrivateState } from "./store";
import { authenticatedUser, consumeLimit } from "./auth";
import { overview, parseMinor } from "./ledger";
import { recordActivity } from "./activity";
import type { WorkspacePayment } from "./types";
const schema = z
  .object({
    requestId: z.string().uuid(),
    amount: z.string().max(32),
    description: z.string().trim().min(1).max(240),
    cardId: z.string().max(400).optional(),
    confirmed: z.literal(true),
  })
  .strict();
function view(p: WorkspacePayment) {
  const { ownerId: _owner, ...v } = p;
  void _owner;
  return v;
}
export function createWorkspacePayment(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(request, schema),
      amountMinor = parseMinor(input.amount);
    if (amountMinor <= 0 || amountMinor > 500000)
      throw new HttpError(400, "Sandbox payments must be between $0.01 and $5,000.");
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
      throw new HttpError(503, "PayPal Sandbox is currently unavailable.");
    const prepared = await withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      s.payments ||= [];
      const existing = s.payments.find((p) => p.id === input.requestId);
      if (existing) {
        if (existing.ownerId !== user.id) throw new HttpError(404, "Payment not found.");
        if (existing.amountMinor !== amountMinor || existing.description !== input.description)
          throw new HttpError(
            409,
            "This payment identifier already belongs to a different review.",
          );
        return { order: { ...existing }, allowed: true };
      }
      if (!consumeLimit(s, `checkout:${user.id}`, 15, 60000))
        return { allowed: false, order: null };
      if (input.cardId) {
        const card = overview(s, request).adaptiveHome.USD.cards.find(
          (c) => c.id === input.cardId && c.kind === "habit",
        );
        if (
          !card?.entry ||
          card.entry.amountMinor !== amountMinor ||
          card.title !== input.description
        )
          throw new HttpError(409, "Your shortcut changed. Open its review again.");
      }
      const now = new Date().toISOString();
      const order: WorkspacePayment = {
        id: input.requestId,
        ownerId: user.id,
        amountMinor,
        currency: "USD",
        description: input.description,
        status: "CREATING",
        createdAt: now,
        updatedAt: now,
      };
      s.payments.push(order);
      return { order: { ...order }, allowed: true };
    });
    if (!prepared.allowed || !prepared.order)
      throw new HttpError(429, "Too many payment requests. Please wait a minute.");
    if (prepared.order.paypalOrderId) return { payment: view(prepared.order) };
    try {
      const remote = await createOrder(
        {
          id: prepared.order.id,
          userId: prepared.order.ownerId,
          title: prepared.order.description,
          amount: prepared.order.amountMinor / 100,
        },
        "/cabinet",
      );
      return await withPrivateState((s) => {
        const user = authenticatedUser(s, request),
          order = s.payments?.find((p) => p.id === input.requestId && p.ownerId === user.id);
        if (!order) throw new HttpError(404, "Payment not found.");
        if (order.paypalOrderId && order.paypalOrderId !== remote.id)
          throw new HttpError(409, "The provider returned a conflicting payment.");
        order.paypalOrderId = remote.id;
        order.approvalUrl = remote.approvalUrl;
        if (order.status !== "COMPLETED") order.status = "CREATED";
        order.updatedAt = new Date().toISOString();
        recordActivity(
          s,
          user.id,
          "Sandbox order prepared",
          order.description,
          "payment",
          "payment-created-" + order.id,
        );
        return { payment: view(order) };
      });
    } catch (error) {
      await withPrivateState((s) => {
        const order = s.payments?.find(
          (p) => p.id === input.requestId && p.ownerId === prepared.order!.ownerId,
        );
        if (order && !order.paypalOrderId) {
          order.status = "FAILED";
          order.updatedAt = new Date().toISOString();
        }
      });
      throw error;
    }
  });
}
function validate(remote: PayPalOrder, order: WorkspacePayment) {
  const unit = remote.purchase_units?.[0];
  if (
    remote.id !== order.paypalOrderId ||
    remote.purchase_units?.length !== 1 ||
    unit?.custom_id !== order.id ||
    unit.amount?.currency_code !== "USD" ||
    parseMinor(unit.amount.value) !== order.amountMinor
  )
    throw new HttpError(409, "PayPal returned a different payment reference or amount.");
}
export function captureWorkspacePayment(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return privateApi(async () => {
    assertSameOrigin(request);
    await privateBody(request, z.object({ confirmed: z.literal(true) }).strict());
    const { id } = await context.params;
    const order = await withPrivateState((s) => {
      const user = authenticatedUser(s, request),
        order = s.payments?.find((p) => p.id === id && p.ownerId === user.id);
      if (!order?.paypalOrderId) throw new HttpError(404, "Payment not found.");
      return { ...order };
    });
    if (order.status === "COMPLETED") return { payment: view(order), duplicate: true };
    let remote = await getOrder(order.paypalOrderId!);
    validate(remote, order);
    if (remote.status !== "COMPLETED") {
      if (remote.status !== "APPROVED")
        throw new HttpError(409, "Approve the payment in PayPal Sandbox first.");
      remote = await captureOrder(order.paypalOrderId!);
      if (remote.id !== order.paypalOrderId || remote.purchase_units?.length !== 1)
        throw new HttpError(409, "PayPal returned a different captured order.");
    }
    const captures = remote.purchase_units![0].payments?.captures;
    if (
      remote.status !== "COMPLETED" ||
      captures?.length !== 1 ||
      captures[0].status !== "COMPLETED" ||
      captures[0].amount.currency_code !== "USD" ||
      parseMinor(captures[0].amount.value) !== order.amountMinor
    )
      throw new HttpError(409, "PayPal has not completed the expected capture.");
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request),
        current = s.payments?.find((p) => p.id === id && p.ownerId === user.id);
      if (!current) throw new HttpError(404, "Payment not found.");
      const duplicate = current.status === "COMPLETED";
      if (!duplicate) {
        current.status = "COMPLETED";
        current.captureId = captures[0].id;
        current.updatedAt = new Date().toISOString();
        recordActivity(
          s,
          user.id,
          "Sandbox payment completed",
          current.description,
          "payment",
          "payment-completed-" + id,
        );
      }
      return { payment: view(current), duplicate };
    });
  });
}
