import { describe, expect, it } from "vitest";
import { generateSeed } from "../lib/seed";
import { settleOrder, validateRemoteOrder } from "../lib/payments";
import type { Order } from "../lib/types";
const order: Order = {
  id: "TESTORDER123",
  suggestionId: "student-topup",
  userId: "student",
  amount: 45,
  currency: "USD",
  status: "CREATED",
  approvalUrl: "https://www.sandbox.paypal.com/checkoutnow",
  createdAt: "2026-10-25",
  updatedAt: "2026-10-25",
};
const capture = {
  id: "CAPTURE123",
  status: "COMPLETED",
  amount: { currency_code: "USD", value: "45.00" },
};
describe("payment invariants", () => {
  it("refuses settlement without explicit approval", () => {
    expect(() => settleOrder(generateSeed(), { ...order }, capture)).toThrow(
      "explicitly approved",
    );
  });
  it("refuses mismatched amount or currency", () => {
    const db = generateSeed();
    db.suggestions[0].approvedAt = new Date().toISOString();
    expect(() =>
      settleOrder(
        db,
        { ...order },
        { ...capture, amount: { currency_code: "USD", value: "44.00" } },
      ),
    ).toThrow("does not match");
    expect(() =>
      validateRemoteOrder(
        {
          id: order.id,
          status: "APPROVED",
          purchase_units: [
            {
              custom_id: order.suggestionId,
              amount: { currency_code: "EUR", value: "45.00" },
            },
          ],
        },
        order,
      ),
    ).toThrow("does not match");
  });
  it("records a completed capture exactly once", () => {
    const db = generateSeed();
    db.suggestions[0].approvedAt = new Date().toISOString();
    const local = { ...order };
    settleOrder(db, local, capture);
    settleOrder(db, local, capture);
    expect(local.status).toBe("COMPLETED");
    expect(db.suggestions[0].status).toBe("paid");
    expect(
      db.transactions.filter((t) => t.id === "capture-CAPTURE123"),
    ).toHaveLength(1);
  });
});
