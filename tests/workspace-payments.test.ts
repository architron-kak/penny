import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { judgeDemo, getOverview } from "../lib/private/routes";
import { createWorkspacePayment, captureWorkspacePayment } from "../lib/private/payments";
import { withPrivateState } from "../lib/private/store";
import { createOrder, getOrder, captureOrder } from "../lib/paypal";
import { POST as flagSubscription } from "../app/api/finance/subscriptions/review/route";
vi.mock("../lib/paypal", () => ({
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  captureOrder: vi.fn(),
}));
const origin = "http://localhost:3000";
const req = (body?: unknown, cookie = "", requestOrigin = origin) =>
  new NextRequest(origin + "/api/finance/payments", {
    method: body ? "POST" : "GET",
    headers: { Origin: requestOrigin, Cookie: cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
let directory: string, cookie: string;
async function demo() {
  const r = await judgeDemo(req({ profile: "student" }));
  expect(r.status).toBe(200);
  return r.headers.get("set-cookie")!.split(";")[0];
}
const overview = async (c = cookie) => (await getOverview(req(undefined, c))).json();
const input = () => ({
  requestId: randomUUID(),
  amount: "24.50",
  description: "Groceries",
  confirmed: true,
});
function remote(id: string, status = "APPROVED", amount = "24.50") {
  return {
    id: "PAYPAL123456789",
    status,
    purchase_units: [
      {
        custom_id: id,
        amount: { currency_code: "USD", value: amount },
        ...(status === "COMPLETED"
          ? {
              payments: {
                captures: [
                  {
                    id: "CAPTURE123",
                    status: "COMPLETED",
                    amount: { currency_code: "USD", value: amount },
                  },
                ],
              },
            }
          : {}),
      },
    ],
  };
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "penny-workspace-pay-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("REQUIRE_REMOTE_DATABASE", "false");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("LLM_API_KEY", "");
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-secret");
  vi.mocked(createOrder).mockReset().mockResolvedValue({
    id: "PAYPAL123456789",
    status: "CREATED",
    approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL123456789",
  });
  vi.mocked(getOrder).mockReset();
  vi.mocked(captureOrder).mockReset();
  cookie = await demo();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("private workspace Sandbox payments", () => {
  it("provides charts and subscriptions from the same owned ledger", async () => {
    const v = await overview();
    expect(v.analytics.USD.monthly).toHaveLength(6);
    expect(v.analytics.USD.monthly.at(-1).expenseMinor).toBe(v.totals.USD.expenseMinor);
    expect(
      v.analytics.USD.categories.reduce(
        (sum: number, c: { amountMinor: number }) => sum + c.amountMinor,
        0,
      ),
    ).toBe(v.totals.USD.expenseMinor);
    expect(v.subscriptions).toHaveLength(1);
    expect(v.subscriptions[0].name).toBe("Music subscription");
    expect(v.subscriptions[0].monthMinor).toBe(999);
    expect(
      v.analytics.KZT.monthly.every((m: { expenseMinor: number }) => m.expenseMinor === 0),
    ).toBe(true);
  });
  it("saves review flags only for the current user's subscriptions", async () => {
    const v = await overview(),
      key = v.subscriptions[0].key,
      other = await demo();
    expect((await flagSubscription(req({ key, reviewRequested: true }, cookie))).status).toBe(200);
    expect((await overview()).subscriptions[0].reviewRequested).toBe(true);
    expect((await overview(other)).subscriptions[0].reviewRequested).toBe(false);
    expect(
      (await flagSubscription(req({ key: "USD:unowned", reviewRequested: true }, cookie))).status,
    ).toBe(404);
    expect(
      (await flagSubscription(req({ key, reviewRequested: true, ownerId: v.user.id }, cookie)))
        .status,
    ).toBe(400);
    expect(
      (await flagSubscription(req({ key, reviewRequested: true }, cookie, "https://attacker.test")))
        .status,
    ).toBe(403);
    expect(
      (await overview(other)).activity.some(
        (a: { title: string }) => a.title === "Subscription flagged for review",
      ),
    ).toBe(false);
  });
  it("serializes repeated concurrent order reservations and completion events", async () => {
    const body = input();
    const created = await Promise.all([
      createWorkspacePayment(req(body, cookie)),
      createWorkspacePayment(req(body, cookie)),
    ]);
    expect(created.every((r) => r.status === 200)).toBe(true);
    expect((await overview()).payments).toHaveLength(1);
    expect(vi.mocked(createOrder).mock.calls.every((args) => args[0].id === body.requestId)).toBe(
      true,
    );
    vi.mocked(getOrder).mockResolvedValue(remote(body.requestId, "COMPLETED"));
    const context = { params: Promise.resolve({ id: body.requestId }) };
    const completed = await Promise.all([
      captureWorkspacePayment(req({ confirmed: true }, cookie), context),
      captureWorkspacePayment(req({ confirmed: true }, cookie), context),
    ]);
    expect(completed.every((r) => r.status === 200)).toBe(true);
    expect(
      (await overview()).activity.filter(
        (a: { title: string }) => a.title === "Sandbox payment completed",
      ),
    ).toHaveLength(1);
    expect(captureOrder).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation and the correct origin before any provider request", async () => {
    expect(
      (await createWorkspacePayment(req({ ...input(), confirmed: false }, cookie))).status,
    ).toBe(400);
    expect(
      (await createWorkspacePayment(req(input(), cookie, "https://attacker.test"))).status,
    ).toBe(403);
    expect((await createWorkspacePayment(req(input()))).status).toBe(401);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("creates once, preserves reviewed fields on retry and uses a private return path", async () => {
    const body = input(),
      before = await overview();
    const r = await createWorkspacePayment(req(body, cookie));
    expect(r.status).toBe(200);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: body.requestId, amount: 24.5, title: "Groceries" }),
      "/cabinet",
    );
    expect((await createWorkspacePayment(req(body, cookie))).status).toBe(200);
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect((await createWorkspacePayment(req({ ...body, amount: "99" }, cookie))).status).toBe(409);
    const after = await overview();
    expect(after.payments).toHaveLength(1);
    expect(after.totals).toEqual(before.totals);
    expect(after.entries).toEqual(before.entries);
    expect(JSON.stringify(after.payments)).not.toContain("ownerId");
  });
  it("rejects a changed habit amount and accepts the server-computed shortcut", async () => {
    const v = await overview(),
      card = v.adaptiveHome.USD.cards.find((c: { kind: string }) => c.kind === "habit");
    expect(
      (
        await createWorkspacePayment(
          req({ ...input(), amount: "100", description: card.title, cardId: card.id }, cookie),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await createWorkspacePayment(
          req(
            {
              ...input(),
              amount: (card.entry.amountMinor / 100).toFixed(2),
              description: card.title,
              cardId: card.id,
            },
            cookie,
          ),
        )
      ).status,
    ).toBe(200);
  });
  it("never reveals or captures another visitor's order", async () => {
    const body = input();
    await createWorkspacePayment(req(body, cookie));
    const other = await demo();
    expect((await overview(other)).payments).toHaveLength(0);
    expect((await createWorkspacePayment(req(body, other))).status).toBe(404);
    expect(
      (
        await captureWorkspacePayment(req({ confirmed: true }, other), {
          params: Promise.resolve({ id: body.requestId }),
        })
      ).status,
    ).toBe(404);
    expect(getOrder).not.toHaveBeenCalled();
    expect(captureOrder).not.toHaveBeenCalled();
  });
  it("requires remote PayPal approval and rejects mismatched amounts", async () => {
    const body = input();
    await createWorkspacePayment(req(body, cookie));
    vi.mocked(getOrder).mockResolvedValue(remote(body.requestId, "CREATED"));
    const context = { params: Promise.resolve({ id: body.requestId }) };
    expect((await captureWorkspacePayment(req({ confirmed: true }, cookie), context)).status).toBe(
      409,
    );
    vi.mocked(getOrder).mockResolvedValue(remote(body.requestId, "APPROVED", "99.99"));
    expect((await captureWorkspacePayment(req({ confirmed: true }, cookie), context)).status).toBe(
      409,
    );
    expect(captureOrder).not.toHaveBeenCalled();
  });
  it("captures explicitly once, keeps ledger balances intact and records activity", async () => {
    const body = input();
    await createWorkspacePayment(req(body, cookie));
    const before = await overview();
    vi.mocked(getOrder).mockResolvedValue(remote(body.requestId));
    // PayPal capture responses may omit purchase-unit amount/custom_id, unlike GET.
    const completed = remote(body.requestId, "COMPLETED");
    vi.mocked(captureOrder).mockResolvedValue({
      id: completed.id,
      status: completed.status,
      purchase_units: [{ payments: completed.purchase_units[0].payments }],
    });
    const context = { params: Promise.resolve({ id: body.requestId }) };
    expect((await captureWorkspacePayment(req({ confirmed: false }, cookie), context)).status).toBe(
      400,
    );
    expect((await captureWorkspacePayment(req({ confirmed: true }, cookie), context)).status).toBe(
      200,
    );
    const again = await captureWorkspacePayment(req({ confirmed: true }, cookie), context);
    expect((await again.json()).duplicate).toBe(true);
    expect(captureOrder).toHaveBeenCalledTimes(1);
    const after = await overview();
    expect(after.totals).toEqual(before.totals);
    expect(after.entries).toEqual(before.entries);
    expect(after.payments[0].status).toBe("COMPLETED");
    expect(
      after.activity.filter((a: { title: string }) => a.title === "Sandbox payment completed"),
    ).toHaveLength(1);
  });
  it("keeps failed creation retryable with the same provider idempotency identifier", async () => {
    const body = input();
    vi.mocked(createOrder).mockRejectedValueOnce(new Error("network"));
    expect((await createWorkspacePayment(req(body, cookie))).status).toBe(500);
    expect((await overview()).payments[0].status).toBe("FAILED");
    expect((await createWorkspacePayment(req(body, cookie))).status).toBe(200);
    expect(vi.mocked(createOrder).mock.calls[0][0].id).toBe(
      vi.mocked(createOrder).mock.calls[1][0].id,
    );
  });
  it("refuses mismatched capture amounts and preserves an unsettled order", async () => {
    const body = input();
    await createWorkspacePayment(req(body, cookie));
    vi.mocked(getOrder).mockResolvedValue(remote(body.requestId));
    vi.mocked(captureOrder).mockResolvedValue(remote(body.requestId, "COMPLETED", "20.00"));
    expect(
      (
        await captureWorkspacePayment(req({ confirmed: true }, cookie), {
          params: Promise.resolve({ id: body.requestId }),
        })
      ).status,
    ).toBe(409);
    expect((await overview()).payments[0].status).toBe("CREATED");
  });
  it("bounds checkout requests and rejects unsupported client currency fields", async () => {
    expect(
      (await createWorkspacePayment(req({ ...input(), currency: "EUR" }, cookie))).status,
    ).toBe(400);
    expect(
      (await createWorkspacePayment(req({ ...input(), amount: "5000.01" }, cookie))).status,
    ).toBe(400);
    const owner = (await overview()).user.id;
    await withPrivateState((s) => {
      s.limits.push({ key: `checkout:${owner}`, count: 15, expiresAt: Date.now() + 60000 });
    });
    expect((await createWorkspacePayment(req(input(), cookie))).status).toBe(429);
    expect(createOrder).not.toHaveBeenCalled();
  });
});
