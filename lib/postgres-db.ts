import { Pool, type PoolClient, type PoolConfig } from "pg";
import { generateSeed } from "./seed";
import { ensurePlanning } from "./planning-seed";
import type { Database } from "./types";

export function postgresConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && url.searchParams.get("sslmode") === "disable")
    throw new Error("Hosted PostgreSQL connections require verified TLS.");
  // URL SSL parameters can override pg's SSL object; retain strict certificate verification.
  for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(name);
  return {
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true, servername: url.hostname },
    enableChannelBinding: true,
    max: 2,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  };
}
let pool: Pool | undefined;
let poolUrl: string | undefined;
let schemaReady: Promise<void> | undefined;
function getPool() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured.");
  if (pool && poolUrl !== url) throw new Error("Restart the process after changing DATABASE_URL.");
  if (!pool) {
    pool = new Pool(postgresConfig(url));
    poolUrl = url;
    pool.on("error", () => console.error("PostgreSQL background connection failed."));
  }
  return pool;
}
// Shared TLS-verified pool; personal records live in a separate table.
export function privatePostgresPool() {
  return getPool();
}
async function initializeSchema() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '20s'");
    // Cross-worker lock makes first-run CREATE TABLE safe, including transaction poolers.
    await client.query("SELECT pg_advisory_xact_lock(73666921)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS penny_state (id smallint PRIMARY KEY CHECK (id = 1), document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())",
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
async function ready() {
  if (!schemaReady)
    schemaReady = initializeSchema().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  await schemaReady;
}
async function ensureDocument(client: PoolClient) {
  await client.query(
    "INSERT INTO penny_state (id, document) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",
    [JSON.stringify(generateSeed())],
  );
}
export async function withPostgresDatabase<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  await ready();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '20s'");
    // Awaited PayPal calls stay inside this same transaction/client: never retry fn automatically.
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '120s'");
    await ensureDocument(client);
    const result = await client.query<{ document: Database }>(
      "SELECT document FROM penny_state WHERE id = 1 FOR UPDATE",
    );
    const db = result.rows[0].document;
    ensurePlanning(db);
    const value = await fn(db);
    await client.query(
      "UPDATE penny_state SET document = $1::jsonb, updated_at = now() WHERE id = 1",
      [JSON.stringify(db)],
    );
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export async function readPostgresDatabase(): Promise<Database> {
  await ready();
  const result = await getPool().query<{ document: Database }>(
    "SELECT document FROM penny_state WHERE id = 1",
  );
  if (!result.rows.length) return withPostgresDatabase((db) => structuredClone(db));
  const db = result.rows[0].document;
  ensurePlanning(db);
  return db;
}
export async function importPostgresDatabase(db: Database) {
  await ready();
  ensurePlanning(db);
  const result = await getPool().query(
    "INSERT INTO penny_state (id, document) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id",
    [JSON.stringify(db)],
  );
  if (!result.rowCount)
    throw new Error("The destination already contains data. No records were overwritten.");
}
export async function closePostgres() {
  await pool?.end();
  pool = undefined;
  poolUrl = undefined;
  schemaReady = undefined;
}
