import { randomUUID } from "node:crypto";
import type { Activity, Database, PersonaId } from "./types";
import { readFileDatabase, withFileDatabase } from "./file-db";
export { dataDirectory } from "./file-db";

export function storageMode() {
  if (process.env.DATABASE_URL?.trim()) return "postgres" as const;
  if (process.env.REQUIRE_REMOTE_DATABASE === "true")
    throw new Error("DATABASE_URL is required for persistent storage on the free hosted service.");
  return "json" as const;
}
export async function withDatabase<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  if (storageMode() === "postgres") return (await import("./postgres-db")).withPostgresDatabase(fn);
  return withFileDatabase(fn);
}
export async function readDatabase(): Promise<Database> {
  if (storageMode() === "postgres") return (await import("./postgres-db")).readPostgresDatabase();
  return readFileDatabase();
}
export function logActivity(
  db: Database,
  userId: PersonaId,
  message: string,
  kind: Activity["kind"] = "analysis",
) {
  db.activities.unshift({
    id: randomUUID(),
    userId,
    message,
    kind,
    createdAt: new Date().toISOString(),
  });
  db.activities = db.activities.slice(0, 500);
}
