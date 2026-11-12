import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { HttpError } from "../http";
import { appOrigin } from "../origin";
import { withPrivateState, prunePrivateState } from "./store";
import type { PrivateState, PrivateUser, PublicUser } from "./types";
export const authCookieName = () =>
  appOrigin().startsWith("https://") ? "__Host-penny-auth" : "penny-auth";
const lifetime = 7 * 86400000;
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const publicUser = (u: PrivateUser): PublicUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  timeZone: u.timeZone,
  ...(u.demoProfile ? { demoProfile: u.demoProfile, demoExpiresAt: u.demoExpiresAt } : {}),
});
let activeHashes = 0;
async function derive(password: string, salt: Buffer) {
  if (activeHashes >= 2) throw new HttpError(429, "Слишком много попыток. Повторите чуть позже.");
  activeHashes++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        salt,
        64,
        { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    activeHashes--;
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$32768$8$3$${salt.toString("hex")}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, N, r, p, salt, hash] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    N !== "32768" ||
    r !== "8" ||
    p !== "3" ||
    !/^[a-f0-9]{32}$/.test(salt || "") ||
    !/^[a-f0-9]{128}$/.test(hash || "")
  )
    return false;
  return timingSafeEqual(
    await derive(password, Buffer.from(salt, "hex")),
    Buffer.from(hash, "hex"),
  );
}
// An unknown email still performs the same expensive password derivation.
const dummyHash = "scrypt$32768$8$3$00112233445566778899aabbccddeeff$" + "0".repeat(128);
export async function checkLoginPassword(password: string, user?: PrivateUser) {
  return verifyPassword(password, user?.passwordHash || dummyHash);
}
export function authenticatedUser(s: PrivateState, request: NextRequest): PrivateUser {
  const token = request.cookies.get(authCookieName())?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, "Войдите в личный кабинет.");
  const session = s.sessions.find((x) => x.hash === digest(token) && x.expiresAt > Date.now());
  const user = session && s.users.find((x) => x.id === session.userId);
  if (!user || (user.demoProfile && (!user.demoExpiresAt || user.demoExpiresAt <= Date.now())))
    throw new HttpError(401, "Сессия завершена. Войдите снова.");
  return user;
}
export function issueSession(s: PrivateState, userId: string, request: NextRequest) {
  const now = Date.now(),
    token = randomBytes(32).toString("hex"),
    previous = request.cookies.get(authCookieName())?.value;
  prunePrivateState(s, now);
  if (previous) s.sessions = s.sessions.filter((x) => x.hash !== digest(previous));
  const own = s.sessions
    .filter((x) => x.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 7);
  s.sessions = s.sessions.filter((x) => x.userId !== userId || own.some((v) => v.hash === x.hash));
  const user = s.users.find((u) => u.id === userId);
  s.sessions.push({
    hash: digest(token),
    userId,
    createdAt: now,
    expiresAt: Math.min(now + lifetime, user?.demoExpiresAt ?? Infinity),
  });
  return token;
}
export function setAuthCookie(response: NextResponse, token: string, maxAge = lifetime / 1000) {
  response.cookies.set(authCookieName(), token, {
    httpOnly: true,
    secure: appOrigin().startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: token ? maxAge : 0,
  });
  return response;
}
export function consumeLimit(s: PrivateState, key: string, max: number, windowMs: number) {
  const now = Date.now();
  s.limits = s.limits.filter((x) => x.expiresAt > now);
  let item = s.limits.find((x) => x.key === key);
  if (!item) {
    item = { key, count: 0, expiresAt: now + windowMs };
    s.limits.push(item);
  }
  if (item.count >= max) return false;
  item.count++;
  return true;
}
export async function authThrottle(
  request: NextRequest,
  email: string,
  action: "login" | "register",
) {
  const ip = requestIpHash(request);
  const allowed = await withPrivateState((s) => {
    prunePrivateState(s);
    const byIp = consumeLimit(
      s,
      `${action}:ip:${ip}`,
      action === "login" ? 30 : 10,
      action === "login" ? 900000 : 3600000,
    );
    const byEmail = consumeLimit(s, `${action}:email:${digest(email)}`, 10, 900000);
    return byIp && byEmail;
  });
  if (!allowed) throw new HttpError(429, "Слишком много попыток. Повторите позже.");
}
export function requestIpHash(request: NextRequest) {
  const forwarded =
    process.env.RENDER === "true"
      ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
      : "local";
  return digest((forwarded || "unknown").slice(0, 128));
}
export const newUserId = () => randomUUID();
