import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import {
  closePostgres,
  importPostgresDatabase,
  postgresConfig,
  readPostgresDatabase,
  withPostgresDatabase,
} from "../lib/postgres-db";
import { applyPlanningCommand } from "../lib/planning-actions";
import { generateSeed } from "../lib/seed";
const testUrl = process.env.PG_TEST_URL;
describe.runIf(!!testUrl)("PostgreSQL state persistence", () => {
  let fixture: Pool;
  beforeAll(() => {
    const host = new URL(testUrl!).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
      throw new Error("Integration tests require an isolated loopback PostgreSQL database.");
    fixture = new Pool(postgresConfig(testUrl!));
  });
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", testUrl!);
    await readPostgresDatabase();
    await fixture.query("DELETE FROM penny_state");
  });
  afterEach(async () => {
    await closePostgres();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await fixture.end();
  });
  it("retains saved changes across application connections", async () => {
    await withPostgresDatabase((db) => {
      db.planning!.profiles.student.balance = 321;
    });
    await closePostgres();
    expect((await readPostgresDatabase()).planning!.profiles.student.balance).toBe(321);
  });
  it("rolls back a failed action and never automatically retries its callback", async () => {
    await readPostgresDatabase();
    let calls = 0;
    await expect(
      withPostgresDatabase((db) => {
        calls++;
        db.planning!.profiles.student.balance = 0;
        throw new Error("action failed");
      }),
    ).rejects.toThrow("action failed");
    expect(calls).toBe(1);
    expect((await readPostgresDatabase()).planning!.profiles.student.balance).toBe(200);
  });
  it("serializes simultaneous balance changes without losing updates", async () => {
    await readPostgresDatabase();
    await Promise.all(
      Array.from({ length: 12 }, () =>
        withPostgresDatabase(async (db) => {
          const p = db.planning!.profiles.student;
          p.balance = p.balance! + 1;
          await new Promise((resolve) => setTimeout(resolve, 4));
        }),
      ),
    );
    expect((await readPostgresDatabase()).planning!.profiles.student.balance).toBe(212);
  });
  it("credits simultaneous confirmations of one refund exactly once", async () => {
    await readPostgresDatabase();
    const run = (id: string) =>
      withPostgresDatabase((db) =>
        applyPlanningCommand(
          db,
          "family",
          { type: "refund-received", refundId: "family-refund-demo" },
          id,
        ),
      );
    await Promise.all([run("one"), run("two")]);
    expect((await readPostgresDatabase()).planning!.profiles.family.balance).toBe(935);
  });
  it("imports legacy Sandbox history and refuses to overwrite existing state", async () => {
    const legacy = generateSeed(new Date("2026-10-25T12:00:00Z"));
    legacy.orders.push({
      id: "LEGACY-ORDER",
      suggestionId: "student-topup",
      userId: "student",
      amount: 45,
      currency: "USD",
      status: "COMPLETED",
      captureId: "LEGACY-CAPTURE",
      approvalUrl: "https://www.sandbox.paypal.com",
      createdAt: legacy.seedDate,
      updatedAt: legacy.seedDate,
    });
    await importPostgresDatabase(legacy);
    expect((await readPostgresDatabase()).orders[0].captureId).toBe("LEGACY-CAPTURE");
    await expect(importPostgresDatabase(generateSeed())).rejects.toThrow("already contains data");
    expect((await readPostgresDatabase()).orders[0].id).toBe("LEGACY-ORDER");
  });
});
