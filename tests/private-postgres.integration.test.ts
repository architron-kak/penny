import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { postgresConfig, closePostgres } from "../lib/postgres-db";
import { withPrivateState } from "../lib/private/store";
import {
  register,
  createAccount,
  pennybotDraft,
  saveDraft,
  getOverview,
} from "../lib/private/routes";
const url = process.env.PG_TEST_URL;
describe.runIf(!!url)("private PostgreSQL persistence and atomic ledger", () => {
  let pool: Pool;
  beforeAll(() => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url!).hostname))
      throw Error("Isolated loopback PostgreSQL required");
    pool = new Pool(postgresConfig(url!));
  });
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("LLM_API_KEY", "");
    await withPrivateState((s) => {
      s.users = [];
      s.sessions = [];
      s.accounts = [];
      s.entries = [];
      s.drafts = [];
      s.limits = [];
    });
  });
  afterEach(async () => {
    await closePostgres();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await pool.end();
  });
  function req(body?: unknown, cookie = "") {
    return new NextRequest("http://localhost:3000/api/finance", {
      method: body ? "POST" : "GET",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  it("persists private records after reconnect and rolls back failed mutations", async () => {
    await withPrivateState((s) => {
      s.limits.push({ key: "retained", count: 1, expiresAt: Date.now() + 60000 });
    });
    await closePostgres();
    expect(await withPrivateState((s) => s.limits[0].key)).toBe("retained");
    await expect(
      withPrivateState((s) => {
        s.limits = [];
        throw Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await withPrivateState((s) => s.limits)).toHaveLength(1);
  });
  it("allows only one saved entry from concurrent confirmations and keeps private data outside the demo table", async () => {
    const signup = await register(
      req({
        name: "DB user",
        email: "db@example.test",
        password: "A secure database test password!",
      }),
    );
    expect(signup.status).toBe(201);
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    const account = (
      await (
        await createAccount(
          req({ name: "Card", kind: "bank", currency: "KZT", openingBalance: "50000" }, cookie),
        )
      ).json()
    ).account;
    const draft = (
      await (
        await pennybotDraft(
          req({ accountId: account.id, message: "Купил продукты на 4500 ₸" }, cookie),
        )
      ).json()
    ).draft;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        saveDraft(req({ confirmed: true }, cookie), { params: Promise.resolve({ id: draft.id }) }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const view = await (await getOverview(req(undefined, cookie))).json();
    expect(view.entries).toHaveLength(1);
    expect(view.accounts[0].balanceMinor).toBe(4550000);
    const table = await pool.query(
      "SELECT tablename FROM pg_tables WHERE tablename='penny_private_state'",
    );
    expect(table.rowCount).toBe(1);
  });
});
