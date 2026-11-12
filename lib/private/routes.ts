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
  setAuthCookie,
  verifyPassword,
} from "./auth";
import {
  accountSchema,
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
export function register(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(request, signup);
    await authThrottle(request, input.email, "register");
    const passwordHash = await hashPassword(input.password);
    const result = await withPrivateState((s) => {
      if (s.users.some((u) => u.email === input.email))
        throw new HttpError(409, "Не удалось создать аккаунт. Если он уже существует, войдите.");
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
    if (!valid || !user) throw new HttpError(401, "Неверная почта или пароль.");
    const result = await withPrivateState((s) => {
      const current = s.users.find((u) => u.id === user.id && u.passwordHash === user.passwordHash);
      if (!current) throw new HttpError(401, "Повторите вход.");
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
    await authThrottle(request, user.email, "login");
    if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
      throw new HttpError(400, "Неверный текущий пароль.");
    const hash = await hashPassword(input.newPassword);
    const token = await withPrivateState((s) => {
      const current = authenticatedUser(s, request);
      if (current.passwordHash !== user.passwordHash)
        throw new HttpError(409, "Пароль уже изменился. Войдите снова.");
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
export function createAccount(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(request, accountSchema);
    const openingMinor = parseMinor(input.openingBalance, true);
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      if (s.accounts.filter((a) => a.ownerId === user.id).length >= 30)
        throw new HttpError(409, "Поддерживается до 30 счетов.");
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
      throw new HttpError(429, "Слишком много запросов к pennybot. Подождите минуту.");
    if (
      /^(?:баланс|мой баланс|сколько.*(?:остал|счет|счёт)|balance|what.*balance)[?.!\s]*$/i.test(
        input.message,
      )
    )
      return withPrivateState((s) => {
        const user = authenticatedUser(s, request);
        const account = ownedAccount(s, user.id, input.accountId);
        return {
          kind: "answer",
          answer: `${account.name}: ${formatMinor(accountBalance(s, account), account.currency)}. Это учётный баланс по вашим записям.`,
          mode: "rules",
        };
      });
    const fields = parseOperation(
      input.message,
      context.account.id,
      context.account.currency,
      context.day,
    );
    const classified = await categorizeWithConsent(input.message, fields, input.useAI);
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request);
      if (user.id !== context.userId) throw new HttpError(401, "Повторите вход.");
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
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Черновик не найден.");
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
      if (!entry) throw new HttpError(404, "Операция не найдена.");
      const duplicate = !!entry.voidedAt;
      entry.voidedAt ||= new Date().toISOString();
      return { ok: true, duplicate };
    });
  });
}
