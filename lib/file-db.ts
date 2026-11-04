import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensurePlanning } from "./planning-seed";
import { generateSeed } from "./seed";
import type { Database } from "./types";

export function dataDirectory() {
  return path.resolve(process.env.DATA_DIR || "./data/runtime");
}
const file = () => path.join(dataDirectory(), "pennybot.json");
async function persist(db: Database) {
  const temporary = `${file()}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(db), { mode: 0o600 });
  await rename(temporary, file());
}
// Serializes writes across Next.js workers/processes on a single persistent disk.
export async function withFileDatabase<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  await mkdir(dataDirectory(), { recursive: true });
  const lock = `${file()}.lock`;
  const start = Date.now();
  let acquired = false;
  while (!acquired) {
    try {
      const handle = await open(lock, "wx", 0o600);
      await handle.close();
      acquired = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(lock)).mtimeMs > 120000) await unlink(lock);
      } catch {
        /* A concurrent worker may have released it. */
      }
      if (Date.now() - start > 20000) throw new Error("Data is busy. Please retry.");
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
  }
  try {
    let db: Database;
    try {
      db = JSON.parse(await readFile(file(), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      db = generateSeed();
    }
    ensurePlanning(db);
    const result = await fn(db);
    await persist(db);
    return result;
  } finally {
    await unlink(lock);
  }
}
export async function readFileDatabase(): Promise<Database> {
  try {
    const db: Database = JSON.parse(await readFile(file(), "utf8"));
    ensurePlanning(db);
    return db;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return withFileDatabase((db) => structuredClone(db));
  }
}
