import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  register,
  login,
  logout,
  me,
  createAccount,
  getOverview,
  manualDraft,
  pennybotDraft,
  saveDraft,
  voidEntry,
  changePassword,
} from "../lib/private/routes";
import { withPrivateState } from "../lib/private/store";
import { parseMinor, calendarDay, sumMinor } from "../lib/private/ledger";
import { parseOperation, categorizeWithConsent } from "../lib/private/pennybot";
import { readDatabase } from "../lib/db";
let directory: string;
const origin = "http://localhost:3000",
  password = "A secure test password 2026!";
const request = (url: string, body?: unknown, cookie = "", overrideOrigin = origin) =>
  new NextRequest(origin + url, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: overrideOrigin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function signup(email = "alma@example.test", name = "Alma") {
  const r = await register(request("/api/account/register", { name, email, password }));
  expect(r.status).toBe(201);
  const body = await r.json();
  return { user: body.user, cookie: r.headers.get("set-cookie")!.split(";")[0] };
}
async function account(cookie: string, currency = "KZT", balance = "50000") {
  const r = await createAccount(
    request(
      "/api/finance/accounts",
      { name: "My " + currency, kind: "bank", currency, openingBalance: balance },
      cookie,
    ),
  );
  expect(r.status).toBe(200);
  return (await r.json()).account;
}
async function overview(cookie: string) {
  return (await getOverview(request("/api/finance/overview", undefined, cookie))).json();
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "penny-private-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("REQUIRE_REMOTE_DATABASE", "false");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("LLM_API_KEY", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});
describe("private authentication and ownership", () => {
  it("stores salted password and session hashes only and revokes a logged-out token", async () => {
    const a = await signup();
    const b = await signup("boris@example.test", "Boris");
    const raw = await readFile(path.join(directory, "private-ledger.json"), "utf8");
    expect(raw).not.toContain(password);
    expect(raw).not.toContain(a.cookie.split("=")[1]);
    const state = JSON.parse(raw);
    expect(state.users[0].passwordHash).not.toBe(state.users[1].passwordHash);
    expect(state.users[0].passwordHash).toContain("scrypt$32768$8$3$");
    expect(state.sessions).toHaveLength(2);
    expect((await stat(path.join(directory, "private-ledger.json"))).mode & 0o777).toBe(0o600);
    const view = await me(request("/api/account/me", undefined, a.cookie));
    expect(JSON.stringify(await view.json())).not.toContain("passwordHash");
    expect(view.headers.get("cache-control")).toBe("private, no-store");
    await logout(request("/api/account/logout", {}, a.cookie));
    expect((await me(request("/api/account/me", undefined, a.cookie))).status).toBe(401);
    expect((await me(request("/api/account/me", undefined, b.cookie))).status).toBe(200);
  });
  it("rejects invalid credentials, forged sessions, cross-origin requests, and weak passwords", async () => {
    await signup();
    expect(
      (
        await login(
          request("/api/account/login", {
            email: "alma@example.test",
            password: "incorrect password",
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await login(request("/api/account/login", { email: "nobody@example.test", password })))
        .status,
    ).toBe(401);
    expect(
      (await me(request("/api/account/me", undefined, "penny-auth=" + "a".repeat(64)))).status,
    ).toBe(401);
    expect(
      (
        await register(
          request("/register", { name: "Test", email: "test@example.test", password: "short" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await login(
          request("/login", { email: "alma@example.test", password }, "", "https://attacker.test"),
        )
      ).status,
    ).toBe(403);
  });
  it("applies login rate limits and never accepts a client-supplied owner", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (await login(request("/login", { email: "notthere@example.test", password: "wrong" })))
          .status,
      ).toBe(401);
    expect(
      (await login(request("/login", { email: "notthere@example.test", password: "wrong" })))
        .status,
    ).toBe(429);
    const a = await signup();
    expect(
      (
        await createAccount(
          request(
            "/accounts",
            { name: "Bad", kind: "bank", currency: "KZT", openingBalance: "0", ownerId: a.user.id },
            a.cookie,
          ),
        )
      ).status,
    ).toBe(400);
  });
  it("never exposes personal accounts to anonymous or other signed-in users", async () => {
    const a = await signup(),
      b = await signup("b@example.test", "B");
    const acc = await account(a.cookie);
    expect((await getOverview(request("/overview"))).status).toBe(401);
    const other = await overview(b.cookie);
    expect(other.accounts).toEqual([]);
    expect(other.entries).toEqual([]);
    const body = { accountId: acc.id, message: "Купил продукты на 4500 ₸" };
    expect((await pennybotDraft(request("/pennybot", body, b.cookie))).status).toBe(404);
    const original = await readDatabase();
    expect(JSON.stringify(original)).not.toContain("alma@example.test");
    expect(JSON.stringify(original)).not.toContain(acc.id);
  });
  it("changes a password and revokes every other session while keeping the current browser signed in", async () => {
    const a = await signup();
    const second = await login(request("/login", { email: "alma@example.test", password }));
    const cookie2 = second.headers.get("set-cookie")!.split(";")[0];
    const change = await changePassword(
      request(
        "/password",
        { currentPassword: password, newPassword: "Another very strong password 2027!" },
        a.cookie,
      ),
    );
    expect(change.status).toBe(200);
    const fresh = change.headers.get("set-cookie")!.split(";")[0];
    expect(fresh).not.toBe(a.cookie);
    expect((await me(request("/me", undefined, cookie2))).status).toBe(401);
    expect((await me(request("/me", undefined, a.cookie))).status).toBe(401);
    expect((await me(request("/me", undefined, fresh))).status).toBe(200);
    expect((await login(request("/login", { email: "alma@example.test", password }))).status).toBe(
      401,
    );
  });
  it("uses a Secure, HttpOnly, host-only cookie over HTTPS", async () => {
    vi.stubEnv("APP_URL", "https://penny.example");
    const r = await register(
      new NextRequest("https://penny.example/register", {
        method: "POST",
        headers: { Origin: "https://penny.example", "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Secure", email: "secure@example.test", password }),
      }),
    );
    expect(r.status).toBe(201);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toContain("__Host-penny-auth=");
    expect(cookie.toLowerCase()).toContain("secure");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).not.toContain("Domain=");
  });
});
describe("confirmed personal ledger", () => {
  it("previews a KZT expense, saves it exactly once concurrently, and keeps all currencies separate", async () => {
    const a = await signup();
    const kzt = await account(a.cookie),
      usd = await account(a.cookie, "USD", "100.10"),
      eur = await account(a.cookie, "EUR", "80.20");
    const r = await pennybotDraft(
      request("/bot", { accountId: kzt.id, message: "Купил продукты на 4500 ₸" }, a.cookie),
    );
    expect(r.status).toBe(200);
    const draft = (await r.json()).draft;
    expect(draft.amountMinor).toBe(450000);
    expect(draft.category).toBe("groceries");
    expect(draft.description).toBe("продукты");
    expect(draft.ownerId).toBeUndefined();
    expect((await overview(a.cookie)).entries).toEqual([]);
    const ctx = { params: Promise.resolve({ id: draft.id }) };
    expect((await saveDraft(request("/save", {}, a.cookie), ctx)).status).toBe(400);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        saveDraft(request("/save", { confirmed: true }, a.cookie), ctx),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(
      (await Promise.all(results.map((r) => r.json()))).filter((r) => !r.duplicate),
    ).toHaveLength(1);
    const after = await overview(a.cookie);
    expect(after.entries).toHaveLength(1);
    expect(after.accounts.find((x: { id: string }) => x.id === kzt.id).balanceMinor).toBe(4550000);
    expect(after.totals.USD.balanceMinor).toBe(10010);
    expect(after.totals.EUR.balanceMinor).toBe(8020);
    expect(after.accounts.find((x: { id: string }) => x.id === usd.id)).toBeDefined();
    expect(eur.currency).toBe("EUR");
  });
  it("does not allow another user to confirm or void a draft/entry", async () => {
    const a = await signup(),
      b = await signup("b@example.test", "B");
    const acc = await account(a.cookie);
    const draft = (
      await (
        await pennybotDraft(
          request("/bot", { accountId: acc.id, message: "Купил кофе на 500 ₸" }, a.cookie),
        )
      ).json()
    ).draft;
    const ctx = { params: Promise.resolve({ id: draft.id }) };
    expect((await saveDraft(request("/save", { confirmed: true }, b.cookie), ctx)).status).toBe(
      404,
    );
    const entry = (
      await (await saveDraft(request("/save", { confirmed: true }, a.cookie), ctx)).json()
    ).entry;
    expect(
      (
        await voidEntry(request("/void", { confirmed: true }, b.cookie), {
          params: Promise.resolve({ id: entry.id }),
        })
      ).status,
    ).toBe(404);
    expect((await overview(b.cookie)).entries).toEqual([]);
  });
  it("records income and reverses a mistaken entry once without deleting history", async () => {
    const a = await signup(),
      acc = await account(a.cookie, "USD", "0");
    const draft = (
      await (
        await pennybotDraft(
          request("/bot", { accountId: acc.id, message: "Received salary 10.25 USD" }, a.cookie),
        )
      ).json()
    ).draft;
    expect(draft.kind).toBe("income");
    const entry = (
      await (
        await saveDraft(request("/save", { confirmed: true }, a.cookie), {
          params: Promise.resolve({ id: draft.id }),
        })
      ).json()
    ).entry;
    expect((await overview(a.cookie)).totals.USD.incomeMinor).toBe(1025);
    const ctx = { params: Promise.resolve({ id: entry.id }) };
    await voidEntry(request("/void", { confirmed: true }, a.cookie), ctx);
    const repeat = await voidEntry(request("/void", { confirmed: true }, a.cookie), ctx);
    expect((await repeat.json()).duplicate).toBe(true);
    const result = await overview(a.cookie);
    expect(result.totals.USD.balanceMinor).toBe(0);
    expect(result.totals.USD.incomeMinor).toBe(0);
    expect(result.entries[0].voidedAt).toBeTruthy();
  });
  it("rejects stale drafts, missing confirmation and currency mismatch", async () => {
    const a = await signup(),
      acc = await account(a.cookie);
    expect(
      (
        await pennybotDraft(
          request("/bot", { accountId: acc.id, message: "Купил продукты на 25 EUR" }, a.cookie),
        )
      ).status,
    ).toBe(409);
    const draft = (
      await (
        await manualDraft(
          request(
            "/draft",
            {
              accountId: acc.id,
              kind: "expense",
              amount: "1.01",
              description: "Test",
              category: "other",
              date: calendarDay(),
            },
            a.cookie,
          ),
        )
      ).json()
    ).draft;
    await withPrivateState((s) => {
      s.drafts.find((d) => d.id === draft.id)!.expiresAt = Date.now() - 1;
    });
    expect(
      (
        await saveDraft(request("/save", { confirmed: true }, a.cookie), {
          params: Promise.resolve({ id: draft.id }),
        })
      ).status,
    ).toBe(410);
    expect((await overview(a.cookie)).entries).toEqual([]);
  });
  it("bounds the actual request body even if Content-Length is omitted", async () => {
    const a = await signup();
    const r = await createAccount(
      request(
        "/accounts",
        { name: "x".repeat(20000), kind: "bank", currency: "KZT", openingBalance: "0" },
        a.cookie,
      ),
    );
    expect(r.status).toBe(413);
  });
});
describe("money parsing and private AI consent", () => {
  it("sums signed balances exactly and rejects totals outside safe integer range", () => {
    expect(sumMinor([Number.MAX_SAFE_INTEGER, 2, -2])).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow();
    expect(() => sumMinor([Number.MIN_SAFE_INTEGER, -1])).toThrow();
    expect(sumMinor([])).toBe(0);
  });
  it("handles decimal minor units without binary floating point or currency conversion", () => {
    expect(parseMinor("4 500,50")).toBe(450050);
    expect(parseMinor("0.10")).toBe(10);
    expect(parseMinor("-100,01", true)).toBe(-10001);
    expect(() => parseMinor("1.234")).toThrow();
    expect(() => parseMinor("1e6")).toThrow();
  });
  it.each([
    ["Купил продукты на 4500 ₸", "KZT", 450000],
    ["Купил кофе за 4 500,50 ₸", "KZT", 450050],
    ["Paid for lunch $12.30", "USD", 1230],
    ["Bought groceries 25 EUR", "EUR", 2500],
    ["Получил зарплату 300000 тенге", "KZT", 30000000],
    ["Купил продукты на 4500 ₸.", "KZT", 450000],
    ["Купил продукты на 4500 тг", "KZT", 450000],
  ])("parses %s", (text, currency, minor) => {
    expect(parseOperation(text, "account", currency as "KZT" | "USD" | "EUR").amountMinor).toBe(
      minor,
    );
  });
  it.each([
    "Купил на -4500 ₸",
    "Paid 1e6 USD",
    "Купил продукты 4500 ₸ и кофе 500 ₸",
    "Купил на 4,500 ₸",
    "Купил на 1.234 ₸",
    "Купил продукты на 100 RUB",
    "Bought groceries for 100 CAD",
    "Купил на 100RUB",
  ])("refuses ambiguous or unsupported amounts: %s", (text) => {
    expect(() => parseOperation(text, "account", text.includes("USD") ? "USD" : "KZT")).toThrow();
  });
  it("does not send private text to an AI provider without explicit consent", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const fields = parseOperation("Купил продукты на 4500 ₸", "account", "KZT");
    const result = await categorizeWithConsent("private text", fields, false);
    expect(result.fields.amountMinor).toBe(450000);
    expect(spy).not.toHaveBeenCalled();
  });
  it("lets Gemini choose a category only, keeping the account, date and amount immutable", async () => {
    vi.stubEnv("LLM_API_KEY", "test");
    vi.stubEnv("LLM_PROVIDER", "openai");
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"category":"groceries","amountMinor":999999,"accountId":"attacker"}',
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetch);
    const fields = parseOperation("Купил продукты на 4500 ₸", "my-account", "KZT");
    const result = await categorizeWithConsent("Купил продукты на 4500 ₸", fields, true);
    expect(result.mode).toBe("llm");
    expect(result.fields).toEqual(fields);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(JSON.parse(body.messages[1].content)).toEqual({
      description: "Купил продукты на 4500 ₸",
    });
    expect(body.messages[1].content).not.toContain("my-account");
  });
});
