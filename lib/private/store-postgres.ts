import { privatePostgresPool } from "../postgres-db";
import { emptyPrivateState } from "./store";
import type { PrivateState } from "./types";
// A separate table keeps anonymous demo access isolated from authentication and personal records.
export async function withPrivatePostgres<T>(
  fn: (state: PrivateState) => T | Promise<T>,
): Promise<T> {
  const client = await privatePostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='20s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
    await client.query("SELECT pg_advisory_xact_lock(73666922)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS penny_private_state (id smallint PRIMARY KEY CHECK(id=1),document jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())",
    );
    await client.query(
      "INSERT INTO penny_private_state (id,document) VALUES (1,$1::jsonb) ON CONFLICT(id) DO NOTHING",
      [JSON.stringify(emptyPrivateState())],
    );
    const result = await client.query<{ document: PrivateState }>(
      "SELECT document FROM penny_private_state WHERE id=1 FOR UPDATE",
    );
    const state = result.rows[0].document;
    const value = await fn(state);
    await client.query(
      "UPDATE penny_private_state SET document=$1::jsonb,updated_at=now() WHERE id=1",
      [JSON.stringify(state)],
    );
    await client.query("COMMIT");
    return value;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
