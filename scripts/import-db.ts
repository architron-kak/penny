import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { importPostgresDatabase, closePostgres } from "../lib/postgres-db";
import type { Database } from "../lib/types";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before importing.");
  const file =
    process.argv.find((arg) => arg.startsWith("--from="))?.slice(7) ||
    path.join(process.env.DATA_DIR || "./data/runtime", "pennybot.json");
  const raw: unknown = JSON.parse(await readFile(file, "utf8"));
  const schema = z
    .object({
      version: z.literal(1),
      seedDate: z.string(),
      personas: z.array(z.object({ id: z.string() }).passthrough()).min(1),
      transactions: z.array(z.object({ id: z.string() }).passthrough()),
      orders: z.array(z.object({ id: z.string() }).passthrough()),
      suggestions: z.array(z.object({ id: z.string() }).passthrough()),
      subscriptions: z.array(z.object({ id: z.string() }).passthrough()),
      activities: z.array(z.unknown()),
      classification: z.record(z.string(), z.unknown()),
      reasons: z.record(z.string(), z.unknown()),
      webhookIds: z.array(z.string()),
    })
    .passthrough();
  schema.parse(raw);
  await importPostgresDatabase(raw as Database);
  console.log(
    "Imported existing Penny state, including Sandbox history, into the empty PostgreSQL destination. Source file was not changed.",
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error && error.message.startsWith("The destination")
        ? error.message
        : "Import failed. Check DATABASE_URL, the source JSON file, and the database connection. No connection credentials are printed.",
    );
    process.exitCode = 1;
  })
  .finally(closePostgres);
