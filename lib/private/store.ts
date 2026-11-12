import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { storageMode, dataDirectory } from "../db";
import type { PrivateState } from "./types";
export const emptyPrivateState = (): PrivateState => ({
  version: 1,
  users: [],
  sessions: [],
  accounts: [],
  entries: [],
  drafts: [],
  limits: [],
});
// Private records never enter the public demo document or its API responses.
export async function withPrivateState<T>(fn: (state: PrivateState) => T | Promise<T>): Promise<T> {
  if (storageMode() === "postgres")
    return (await import("./store-postgres")).withPrivatePostgres(fn);
  await mkdir(dataDirectory(), { recursive: true });
  const file = path.join(dataDirectory(), "private-ledger.json"),
    lock = file + ".lock";
  const start = Date.now();
  while (true) {
    try {
      const handle = await open(lock, "wx", 0o600);
      await handle.close();
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (Date.now() - start > 20000) throw Error("Private storage busy");
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  try {
    let state: PrivateState;
    try {
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      state = emptyPrivateState();
    }
    const result = await fn(state);
    const temp = file + "." + randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, file);
    return result;
  } finally {
    await unlink(lock);
  }
}
export function prunePrivateState(s: PrivateState, now = Date.now()) {
  const expiredDemoIds = new Set(
    s.users
      .filter((u) => u.demoProfile && (!u.demoExpiresAt || u.demoExpiresAt <= now))
      .map((u) => u.id),
  );
  if (expiredDemoIds.size) {
    s.users = s.users.filter((u) => !expiredDemoIds.has(u.id));
    s.accounts = s.accounts.filter((a) => !expiredDemoIds.has(a.ownerId));
    s.entries = s.entries.filter((e) => !expiredDemoIds.has(e.ownerId));
    s.drafts = s.drafts.filter((d) => !expiredDemoIds.has(d.ownerId));
  }
  s.sessions = s.sessions.filter((x) => x.expiresAt > now && !expiredDemoIds.has(x.userId));
  s.drafts = s.drafts.filter((x) =>
    x.entryId ? x.createdAt > now - 7 * 86400000 : x.expiresAt > now,
  );
  s.limits = s.limits.filter((x) => x.expiresAt > now);
}
