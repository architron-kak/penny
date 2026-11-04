import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as approve } from "../app/api/suggestions/[id]/approve/route";
import { POST as capture } from "../app/api/paypal/capture/route";
import { createOrder, getOrder, captureOrder } from "../lib/paypal";
import { readDatabase, withDatabase } from "../lib/db";
vi.mock("../lib/session", () => ({ sessionHash: async () => "browser-owner" }));
vi.mock("../lib/paypal", () => ({
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  captureOrder: vi.fn(),
}));
let directory: string;
const context = { params: Promise.resolve({ id: "student-topup" }) };
function post(route: string, body: unknown, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000${route}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const remote = {
  id: "SANDBOXORDER123",
  status: "APPROVED",
  purchase_units: [
    {
      custom_id: "student-topup",
      amount: { currency_code: "USD", value: "45.00" },
    },
  ],
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "pennybot-routes-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("APP_URL", "");
  vi.mocked(createOrder).mockResolvedValue({
    id: remote.id,
    status: "CREATED",
    approvalUrl:
      "https://www.sandbox.paypal.com/checkoutnow?token=SANDBOXORDER123",
  });
  vi.mocked(getOrder).mockResolvedValue(remote);
  vi.mocked(captureOrder).mockResolvedValue({
    ...remote,
    status: "COMPLETED",
    purchase_units: [
      {
        ...remote.purchase_units[0],
        payments: {
          captures: [
            {
              id: "CAPTURE123",
              status: "COMPLETED",
              amount: { currency_code: "USD", value: "45.00" },
            },
          ],
        },
      },
    ],
  });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
async function approvedOrder() {
  return approve(
    post("/api/suggestions/student-topup/approve", {
      user: "student",
      approved: true,
    }),
    context,
  );
}
describe("payment route consent and persistence", () => {
  it("refuses cross-origin mutations before calling PayPal", async () => {
    const response = await approve(
      post(
        "/api/suggestions/student-topup/approve",
        { user: "student", approved: true },
        "https://foreign.example",
      ),
      context,
    );
    expect(response.status).toBe(403);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("requires literal approval and never captures on order creation", async () => {
    expect(
      (
        await approve(
          post("/api/suggestions/student-topup/approve", {
            user: "student",
            approved: false,
          }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(createOrder).not.toHaveBeenCalled();
    expect((await approvedOrder()).status).toBe(200);
    expect(captureOrder).not.toHaveBeenCalled();
    expect((await readDatabase()).suggestions[0].approvedAt).toBeTruthy();
  });
  it("reuses the stored order on approval retries", async () => {
    await approvedOrder();
    await approvedOrder();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect((await readDatabase()).orders).toHaveLength(1);
  });
  it("rejects capture without the explicit return-page action", async () => {
    await approvedOrder();
    const response = await capture(
      post("/api/paypal/capture", { orderId: remote.id }),
    );
    expect(response.status).toBe(400);
    expect(captureOrder).not.toHaveBeenCalled();
  });
  it("rejects capture in a different browser session", async () => {
    await approvedOrder();
    await withDatabase((db) => {
      db.orders[0].sessionHash = "another-browser";
    });
    const response = await capture(
      post("/api/paypal/capture", { orderId: remote.id, userApproved: true }),
    );
    expect(response.status).toBe(403);
    expect(getOrder).not.toHaveBeenCalled();
    expect(captureOrder).not.toHaveBeenCalled();
  });
  it("checks PayPal approval before capture", async () => {
    await approvedOrder();
    vi.mocked(getOrder).mockResolvedValue({ ...remote, status: "CREATED" });
    const response = await capture(
      post("/api/paypal/capture", { orderId: remote.id, userApproved: true }),
    );
    expect(response.status).toBe(409);
    expect(captureOrder).not.toHaveBeenCalled();
  });
  it("captures an approved matching order once and persists completion", async () => {
    await approvedOrder();
    const body = { orderId: remote.id, userApproved: true };
    expect((await capture(post("/api/paypal/capture", body))).status).toBe(200);
    expect((await capture(post("/api/paypal/capture", body))).status).toBe(200);
    expect(captureOrder).toHaveBeenCalledTimes(1);
    const db = await readDatabase();
    expect(db.orders[0].status).toBe("COMPLETED");
    expect(db.suggestions[0].status).toBe("paid");
    expect(
      db.transactions.filter((t) => t.source === "paypal-sandbox"),
    ).toHaveLength(1);
  });
});
