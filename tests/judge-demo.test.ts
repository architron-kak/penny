import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  judgeDemo,
  register,
  login,
  changePassword,
  getOverview,
  pennybotDraft,
  saveDraft,
  logout,
} from "../lib/private/routes";
import { withPrivateState, prunePrivateState } from "../lib/private/store";
import { requestIpHash } from "../lib/private/auth";
let directory: string;
const origin = "http://localhost:3000";
const req = (body?: unknown, cookie = "", requestOrigin = origin) =>
  new NextRequest(origin + "/api/account/demo", {
    method: body ? "POST" : "GET",
    headers: { Origin: requestOrigin, "Content-Type": "application/json", Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function demo(profile = "student", cookie = "") {
  const response = await judgeDemo(req({ profile }, cookie));
  expect(response.status).toBe(200);
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    user: (await response.json()).user,
    response,
  };
}
async function view(cookie: string) {
  return (await getOverview(req(undefined, cookie))).json();
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "penny-judge-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("REQUIRE_REMOTE_DATABASE", "false");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("LLM_API_KEY", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("one-click judge accounts", () => {
  it.each(["student", "family", "freelancer"])(
    "opens populated %s without credentials",
    async (profile) => {
      const d = await demo(profile),
        v = await view(d.cookie);
      expect(v.user.demoProfile).toBe(profile);
      expect(v.accounts).toHaveLength(3);
      expect(new Set(v.accounts.map((a: { currency: string }) => a.currency))).toEqual(
        new Set(["KZT", "USD", "EUR"]),
      );
      expect(v.entries).toHaveLength(11);
      expect(v.entries.some((e: { kind: string }) => e.kind === "income")).toBe(true);
      const groceries = v.entries.filter(
        (e: { description: string }) => e.description === "Продукты",
      );
      expect(new Set(groceries.map((e: { date: string }) => e.date)).size).toBe(3);
      expect(JSON.stringify(v)).not.toContain("passwordHash");
      expect(d.response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(d.response.headers.get("set-cookie")).toMatch(/Max-Age=86\d{3}/);
      const stored = await withPrivateState((s) => ({ user: s.users[0], session: s.sessions[0] }));
      expect(stored.user.passwordHash).toBe("");
      expect(stored.session.expiresAt).toBeLessThanOrEqual(stored.user.demoExpiresAt!);
    },
  );
  it("keeps each visitor's entries separate and preserves edits when resuming", async () => {
    const a = await demo(),
      b = await demo();
    expect(a.user.id).not.toBe(b.user.id);
    const va = await view(a.cookie),
      vb = await view(b.cookie);
    expect(va.accounts[0].id).not.toBe(vb.accounts[0].id);
    const fields = {
      accountId: va.accounts.find((a: { currency: string }) => a.currency === "KZT").id,
      message: "Купил продукты на 4500 ₸",
    };
    expect((await pennybotDraft(req(fields, b.cookie))).status).toBe(404);
    const draft = (await (await pennybotDraft(req(fields, a.cookie))).json()).draft;
    expect((await view(a.cookie)).entries).toHaveLength(11);
    await saveDraft(req({ confirmed: true }, a.cookie), {
      params: Promise.resolve({ id: draft.id }),
    });
    expect((await view(a.cookie)).entries).toHaveLength(12);
    expect((await view(b.cookie)).entries).toHaveLength(11);
    const resumed = await demo("student", a.cookie);
    expect(resumed.user.id).toBe(a.user.id);
    expect((await view(resumed.cookie)).entries).toHaveLength(12);
    expect((await getOverview(req(undefined, a.cookie))).status).toBe(401);
    await logout(req({}, resumed.cookie));
    expect((await getOverview(req(undefined, resumed.cookie))).status).toBe(401);
  });
  it("rejects foreign origins, arbitrary owners and unknown profiles", async () => {
    expect((await judgeDemo(req({ profile: "student" }, "", "https://attacker.test"))).status).toBe(
      403,
    );
    expect((await judgeDemo(req({ profile: "admin" }))).status).toBe(400);
    expect((await judgeDemo(req({ profile: "student", ownerId: "victim" }))).status).toBe(400);
    expect(await withPrivateState((s) => s.users.length)).toBe(0);
  });
  it("does not replace personal accounts or allow demo password login/change", async () => {
    const r = await register(
      req({
        name: "Real",
        email: "real@example.test",
        password: "A very strong personal password!",
      }),
    );
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    expect((await judgeDemo(req({ profile: "student" }, cookie))).status).toBe(409);
    expect((await view(cookie)).user.demoProfile).toBeUndefined();
    const d = await demo();
    expect(
      (
        await changePassword(
          req({ currentPassword: "anything", newPassword: "Another strong password!" }, d.cookie),
        )
      ).status,
    ).toBe(403);
    expect((await login(req({ email: d.user.email, password: "anything" }))).status).toBe(401);
  });
  it("expires and prunes only temporary demo data, including drafts and sessions", async () => {
    const r = await register(
      req({
        name: "Real",
        email: "real@example.test",
        password: "A very strong personal password!",
      }),
    );
    const realCookie = r.headers.get("set-cookie")!.split(";")[0],
      d = await demo();
    const v = await view(d.cookie);
    await pennybotDraft(req({ accountId: v.accounts[0].id, message: "Купил на 100 ₸" }, d.cookie));
    await withPrivateState((s) => {
      s.users.find((u) => u.id === d.user.id)!.demoExpiresAt = Date.now() - 1;
    });
    expect((await getOverview(req(undefined, d.cookie))).status).toBe(401);
    await withPrivateState((s) => prunePrivateState(s));
    const state = await withPrivateState((s) => s);
    expect(state.users).toHaveLength(1);
    expect(state.users[0].demoProfile).toBeUndefined();
    expect(state.accounts).toHaveLength(0);
    expect(state.entries).toHaveLength(0);
    expect(state.drafts).toHaveLength(0);
    expect(state.sessions).toHaveLength(1);
    expect((await getOverview(req(undefined, realCookie))).status).toBe(200);
  });
  it("persists the creation limit and caps active workspaces without deleting accounts", async () => {
    const key = `judge-demo:${requestIpHash(req())}`;
    await withPrivateState((s) => {
      s.limits.push({ key, count: 30, expiresAt: Date.now() + 60000 });
    });
    for (let i = 0; i < 2; i++)
      expect((await judgeDemo(req({ profile: "student" }))).status).toBe(429);
    await withPrivateState((s) => {
      s.limits = [];
    });
    const d = await demo();
    await withPrivateState((s) => {
      const u = s.users[0];
      for (let i = 1; i < 300; i++) s.users.push({ ...u, id: "capacity-" + i });
    });
    expect((await judgeDemo(req({ profile: "family" }))).status).toBe(503);
    expect((await demo("student", d.cookie)).user.id).toBe(d.user.id);
    expect(await withPrivateState((s) => s.users.length)).toBe(300);
  });
});
