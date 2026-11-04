import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "./http";
const cookieName = "pennybot-session";
export async function ensureSession() {
  const jar = await cookies();
  if (!jar.has(cookieName))
    jar.set(cookieName, randomBytes(32).toString("hex"), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_URL?.startsWith("https://") || false,
      path: "/",
      maxAge: 86400 * 7,
    });
}
export async function sessionHash() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) throw new HttpError(403, "Refresh Penny before approving a payment.");
  return createHash("sha256").update(value).digest("hex");
}
