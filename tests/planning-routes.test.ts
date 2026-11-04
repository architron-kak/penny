import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as save } from "../app/api/planning/route";
import { POST as preview } from "../app/api/planning/preview/route";
import { POST as chat } from "../app/api/chat/route";
import { readDatabase } from "../lib/db";
let directory: string;
const post = (route: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${route}`, {
    method: "POST",
    headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "penny-planning-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("LLM_API_KEY", "");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("planning routes", () => {
  it("requires explicit confirmation and keeps trial mutations out of the database", async () => {
    const db = await readDatabase(),
      command = {
        type: "debt-create",
        person: "Ali",
        direction: "payable",
        amount: 40,
        installments: [{ date: db.planning!.profiles.student.asOf, amount: 40 }],
      };
    expect(
      (await save(post("/api/planning", { user: "student", command, requestId: randomUUID() })))
        .status,
    ).toBe(400);
    const response = await preview(post("/api/planning/preview", { user: "student", command }));
    expect(response.status).toBe(200);
    expect((await response.json()).planning.purchase.limit).toBe(60);
    expect((await readDatabase()).planning!.debts.some((d) => d.userId === "student")).toBe(false);
  });
  it("deduplicates a confirmed debt repayment while preserving the $60 purchase limit", async () => {
    const db = await readDatabase(),
      debt = {
        type: "debt-create",
        person: "Ali",
        direction: "payable",
        amount: 40,
        installments: [{ date: db.planning!.profiles.student.asOf, amount: 40 }],
      };
    await save(
      post("/api/planning", {
        user: "student",
        command: debt,
        requestId: randomUUID(),
        confirmed: true,
      }),
    );
    const d = (await readDatabase()).planning!.debts.find((d) => d.userId === "student")!;
    const body = {
      user: "student",
      command: {
        type: "debt-payment",
        debtId: d.id,
        amount: 40,
        date: db.planning!.profiles.student.asOf,
      },
      requestId: randomUUID(),
      confirmed: true,
    };
    const responses = await Promise.all([
      save(post("/api/planning", body)),
      save(post("/api/planning", body)),
    ]);
    for (const r of responses) {
      expect(r.status).toBe(200);
      const v = await r.json();
      expect(v.planning.purchase.limit).toBe(60);
      expect(v.planning.profile.balance).toBe(160);
    }
    expect(
      (await readDatabase()).planning!.debts.find((x) => x.id === d.id)!.repayments,
    ).toHaveLength(1);
  });
  it("does not create orders for voice-style text, mismatched amount or recipient", async () => {
    for (const message of ["Pay groceries 20", "Pay Ali $45", "Pay groceries $45 EUR"]) {
      const response = await chat(
        post("/api/chat", {
          user: "student",
          message,
          context: { topic: "payment", entityId: "student-topup" },
        }),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).actions).toBeUndefined();
    }
    const db = await readDatabase();
    expect(db.orders).toHaveLength(0);
    expect(db.suggestions[0].status).toBe("proposed");
  });
  it("keeps a debt draft through a due-date clarification", async () => {
    const first = await chat(post("/api/chat", { user: "student", message: "Ali owes me $25" }));
    const draft = await first.json();
    expect(draft.context.debtDraft.amount).toBe(25);
    const second = await chat(
      post("/api/chat", { user: "student", message: "Friday", context: draft.context }),
    );
    const result = await second.json();
    expect(result.actions[0].command).toMatchObject({
      type: "debt-create",
      person: "Ali",
      direction: "receivable",
      amount: 25,
    });
  });
});
