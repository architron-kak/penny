import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { generateSeed } from "../lib/seed";
import { dataDirectory, withDatabase } from "../lib/db";

loadEnvConfig(process.cwd());

async function main() {
  const requestedDate = process.argv
    .find((arg) => arg.startsWith("--date="))
    ?.slice(7);
  const date = requestedDate ? new Date(requestedDate) : new Date();
  if (Number.isNaN(date.getTime()))
    throw new Error("Invalid --date. Use YYYY-MM-DD.");
  const seed = generateSeed(date);
  await mkdir("data/seed", { recursive: true });
  for (const persona of seed.personas)
    await writeFile(
      path.join("data/seed", `${persona.id}.json`),
      JSON.stringify(
        {
          persona,
          transactions: seed.transactions.filter(
            (t) => t.userId === persona.id,
          ),
          subscriptions: seed.subscriptions.filter(
            (s) => s.userId === persona.id,
          ),
        },
        null,
        2,
      ),
    );
  await withDatabase((db) => {
    if (db.orders.length && !process.argv.includes("--reset"))
      throw new Error(
        "Existing payment records found. Use --reset only if you intend to erase local demo records.",
      );
    Object.assign(db, seed);
  });
  console.log(
    `Seeded ${seed.transactions.length} synthetic transactions across 3 personas in ${dataDirectory()}. As of ${seed.seedDate.slice(0, 10)}.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
