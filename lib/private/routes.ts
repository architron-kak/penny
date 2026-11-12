import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, HttpError } from "../http";
import { privateApi, privateBody } from "./http";
import { withPrivateState, prunePrivateState } from "./store";
import {
  authCookieName,
  authenticatedUser,
  authThrottle,
  checkLoginPassword,
  consumeLimit,
  digest,
  hashPassword,
  issueSession,
  newUserId,
  publicUser,
  requestIpHash,
  setAuthCookie,
  verifyPassword,
} from "./auth";
import {
  accountSchema,
  currencySchema,
  accountBalance,
  calendarDay,
  confirmDraft,
  emailSchema,
  entrySchema,
  formatMinor,
  overview,
  ownedAccount,
  parseMinor,
  passwordSchema,
  prepareDraft,
} from "./ledger";
import { categorizeWithConsent, parseOperation } from "./pennybot";
import { seedJudgeWorkspace } from "./demo";
import { recordActivity } from "./activity";
const credentials = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const signup = credentials
  .extend({
    name: z.string().trim().min(1).max(60),
    password: passwordSchema,
    timeZone: z
      .string()
      .max(64)
      .default("Asia/Almaty")
      .refine((t) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: t });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .strict();
export function judgeDemo(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(
      request,
      z.object({ profile: z.enum(["student", "family", "freelancer"]) }).strict(),
    );
    const result = await withPrivateState((s) => {
      prunePrivateState(s);
      let current;
      try {
        current = authenticatedUser(s, request);
      } catch (e) {
        if (!(e instanceof HttpError) || e.status !== 401) throw e;
      }
      if (current && !current.demoProfile)
        throw new HttpError(409, "Sign out of your personal account before opening a demo.");
      // Commit rejected attempts too, so the request limit cannot be bypassed by rollback.
      if (!consumeLimit(s, `judge-demo:${requestIpHash(request)}`, 30, 3600000))
        return { error: "Too many demo starts. Please try again later.", status: 429 as const };
      if (
        current?.demoProfile !== input.profile &&
        s.users.filter((u) => u.demoProfile).length >= 300
      )
        return { error: "Demo capacity reached. Please try again shortly.", status: 503 as const };
      const user =
        current?.demoProfile === input.profile ? current : seedJudgeWorkspace(s, input.profile);
      const token = issueSession(s, user.id, request);
      return {
        user: publicUser(user),
        token,
        maxAge: Math.max(1, Math.floor((user.demoExpiresAt! - Date.now()) / 1000)),
      };
    });
    if ("error" in result)
      return NextResponse.json({ error: result.error }, { status: result.status });
    return setAuthCookie(NextResponse.json({ user: result.user }), result.token, result.maxAge);
  });
}
export function register(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(request, signup);
    await authThrottle(request, input.email, "register");
    const passwordHash = await hashPassword(input.password);
    const result = await withPrivateState((s) => {
      if (s.users.some((u) => u.email === input.email))
        throw new HttpError(
          409,
          "Unable to create an account. If you already have one, please sign in.",
        );
      const user = {
        id: newUserId(),
        name: input.name,
        email: input.email,
        passwordHash,
        timeZone: input.timeZone,
        createdAt: new Date().toISOString(),
      };
      s.users.push(user);
      return { user: publicUser(user), token: issueSession(s, user.id, request) };
    });
    return setAuthCookie(NextResponse.json({ user: result.user }, { status: 201 }), result.token);
  });
}
export function login(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(request, credentials);
    await authThrottle(request, input.email, "login");
    const user = await withPrivateState((s) => s.users.find((u) => u.email === input.email));
    const valid = await checkLoginPassword(input.password, user);
    if (!valid || !user) throw new HttpError(401, "Incorrect email or password.");
    const result = await withPrivateState((s) => {
      const current = s.users.find((u) => u.id === user.id && u.passwordHash === user.passwordHash);
      if (!current) throw new HttpError(401, "Please sign in again.");
      return { user: publicUser(current), token: issueSession(s, current.id, request) };
    });
    return setAuthCookie(NextResponse.json({ user: result.user }), result.token);
  });
}
export function logout(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const token = request.cookies.get(authCookieName())?.value;
    if (token)
      await withPrivateState((s) => {
        s.sessions = s.sessions.filter((x) => x.hash !== digest(token));
      });
    return setAuthCookie(NextResponse.json({ ok: true }), "");
  });
}
export function me(request: NextRequest) {
  return privateApi(async () =>
    withPrivateState((s) => ({ user: publicUser(authenticatedUser(s, request)) })),
  );
}
export function changePassword(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(
      request,
      z
        .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
        .strict(),
    );
    const user = await withPrivateState((s) => authenticatedUser(s, request));
    if (user.demoProfile)
      throw new HttpError(
        403,
        "Demo accounts have no password. Create a personal account for your own records.",
      );
    await authThrottle(request, user.email, "login");
    if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
      throw new HttpError(400, "Incorrect current password.");
    const hash = await hashPassword(input.newPassword);
    const token = await withPrivateState((s) => {
      const current = authenticatedUser(s, request);
      if (current.passwordHash !== user.passwordHash)
        throw new HttpError(409, "Your password has already changed. Please sign in again.");
      current.passwordHash = hash;
      s.sessions = s.sessions.filter((x) => x.userId !== user.id);
      return issueSession(s, user.id, request);
    });
    return setAuthCookie(NextResponse.json({ ok: true }), token);
  });
}
export function getOverview(request: NextRequest) {
  return privateApi(async () => withPrivateState((s) => overview(s, request)));
}
export function saveHomePlan(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(
      request,
      z
        .object({
          currency: currencySchema,
          debtAmount: z.string().max(32),
          goalName: z.string().trim().max(80),
          goalTarget: z.string().max(32),
          monthlyBudget: z.string().max(32).optional(),
          confirmed: z.literal(true),
        })
        .strict(),
    );
    const debtMinor = parseMinor(input.debtAmount),
      goalTargetMinor = parseMinor(input.goalTarget);
    if (goalTargetMinor > 0 && !input.goalName)
      throw new HttpError(400, "Please name your savings goal.");
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      user.homePlan ||= {};
      user.homePlan[input.currency] = {
        debtMinor,
        goalTargetMinor,
        goalName: goalTargetMinor ? input.goalName : "",
        ...(input.monthlyBudget !== undefined
          ? { monthlyBudgetMinor: parseMinor(input.monthlyBudget) }
          : user.homePlan[input.currency]?.monthlyBudgetMinor !== undefined
            ? { monthlyBudgetMinor: user.homePlan[input.currency]!.monthlyBudgetMinor }
            : {}),
      };
      recordActivity(
        s,
        user.id,
        "Financial plan updated",
        `${input.currency} savings goal, obligations and budget reviewed.`,
        "planning",
      );
      return { plan: user.homePlan[input.currency] };
    });
  });
}
export function createAccount(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(request, accountSchema);
    const openingMinor = parseMinor(input.openingBalance, true);
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      if (s.accounts.filter((a) => a.ownerId === user.id).length >= 30)
        throw new HttpError(409, "You can create up to 30 accounts.");
      const account = {
        id: randomUUID(),
        ownerId: user.id,
        name: input.name,
        kind: input.kind,
        currency: input.currency,
        openingMinor,
        createdAt: new Date().toISOString(),
      };
      s.accounts.push(account);
      recordActivity(
        s,
        user.id,
        "Account added",
        `${account.name} · ${account.currency}`,
        "account",
      );
      const { ownerId: _owner, ...view } = account;
      void _owner;
      return { account: { ...view, balanceMinor: accountBalance(s, account) } };
    });
  });
}
export function manualDraft(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(request, entrySchema);
    const amountMinor = parseMinor(input.amount);
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      prunePrivateState(s);
      const account = ownedAccount(s, user.id, input.accountId);
      return {
        draft: prepareDraft(
          s,
          user.id,
          {
            accountId: account.id,
            currency: account.currency,
            kind: input.kind,
            amountMinor,
            description: input.description,
            category: input.category,
            date: input.date,
          },
          "manual",
        ),
      };
    });
  });
}
export function pennybotDraft(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(
      request,
      z
        .object({
          accountId: z.string().uuid(),
          message: z.string().trim().min(1).max(1000),
          useAI: z.boolean().default(false),
        })
        .strict(),
    );
    const context = await withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      const account = ownedAccount(s, user.id, input.accountId);
      const allowed = consumeLimit(s, `pennybot:${user.id}`, 20, 60000);
      return { userId: user.id, account, allowed, day: calendarDay(user.timeZone) };
    });
    if (!context.allowed)
      throw new HttpError(429, "Too many pennybot requests. Please wait a minute.");
    if (
      /^(?:баланс|мой баланс|сколько.*(?:остал|счет|счёт)|balance|my balance|what.*balance)[?.!\s]*$/i.test(
        input.message,
      )
    )
      return withPrivateState((s) => {
        const user = authenticatedUser(s, request);
        const account = ownedAccount(s, user.id, input.accountId);
        return {
          kind: "answer",
          answer: `${account.name}: ${formatMinor(accountBalance(s, account), account.currency)}. This is the balance calculated from your records.`,
          mode: "rules",
        };
      });
    if (
      !/\d/.test(input.message) &&
      /adaptive home|explain|summar|spending|cash ?flow|subscriptions?|savings?|goals?|debts?|obligations?|weekly/i.test(
        input.message,
      )
    ) {
      return withPrivateState((s) => {
        const current = overview(s, request);
        const account = current.accounts.find((a) => a.id === input.accountId);
        if (!account) throw new HttpError(404, "Account not found.");
        const home = current.adaptiveHome[account.currency];
        const kind = /subscription/i.test(input.message)
          ? "subscriptions"
          : /saving|goal/i.test(input.message)
            ? "savings"
            : /debt|obligation/i.test(input.message)
              ? "debts"
              : /cash ?flow|spending/i.test(input.message)
                ? "cashflow"
                : /weekly/i.test(input.message)
                  ? "insight"
                  : undefined;
        const cards = kind
          ? home.cards.filter((c) => c.kind === kind)
          : home.cards.filter((c) => c.kind !== "habit").slice(0, 5);
        return {
          kind: "answer",
          answer:
            cards.map((c) => `${c.title}: ${c.value}. ${c.description}`).join("\n\n") ||
            "Add an account and a few transactions to personalize your Adaptive Home.",
          mode: "rules",
        };
      });
    }
    const fields = parseOperation(
      input.message,
      context.account.id,
      context.account.currency,
      context.day,
    );
    const classified = await categorizeWithConsent(input.message, fields, input.useAI);
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      if (user.id !== context.userId) throw new HttpError(401, "Please sign in again.");
      return {
        kind: "draft",
        draft: prepareDraft(s, user.id, classified.fields, "pennybot", classified.mode),
      };
    });
  });
}
export function saveDraft(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return privateApi(async () => {
    assertSameOrigin(request);
    await privateBody(request, z.object({ confirmed: z.literal(true) }).strict());
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Draft not found.");
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      return confirmDraft(s, user.id, id);
    });
  });
}

export function voidEntry(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return privateApi(async () => {
    assertSameOrigin(request);
    await privateBody(request, z.object({ confirmed: z.literal(true) }).strict());
    const { id } = await context.params;
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      const entry = s.entries.find((e) => e.id === id && e.ownerId === user.id);
      if (!entry) throw new HttpError(404, "Transaction not found.");
      const duplicate = !!entry.voidedAt;
      entry.voidedAt ||= new Date().toISOString();
      return { ok: true, duplicate };
    });
  });
}
