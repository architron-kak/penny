import { afterEach, describe, expect, it, vi } from "vitest";
import { storageMode } from "../lib/db";
import { postgresConfig } from "../lib/postgres-db";
import { GET as health } from "../app/api/health/route";
afterEach(() => vi.unstubAllEnvs());
describe("free hosted storage", () => {
  it("refuses ephemeral JSON when remote storage is required", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REQUIRE_REMOTE_DATABASE", "true");
    expect(() => storageMode()).toThrow("DATABASE_URL");
    expect(health().status).toBe(503);
  });
  it("keeps local JSON and selects PostgreSQL only with a configured URL", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REQUIRE_REMOTE_DATABASE", "false");
    expect(storageMode()).toBe("json");
    vi.stubEnv("DATABASE_URL", "postgres://user:example@db.example/penny");
    expect(storageMode()).toBe("postgres");
  });
  it("verifies remote TLS even when a provider URL includes sslmode", () => {
    const config = postgresConfig(
      "postgresql://user:example@db.example/penny?sslmode=require&channel_binding=require",
    );
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true, servername: "db.example" });
    expect(config.connectionString).not.toContain("sslmode");
    expect(config.max).toBe(2);
  });
  it("rejects disabled remote TLS and permits a loopback-only test database", () => {
    expect(() =>
      postgresConfig("postgresql://user:example@db.example/penny?sslmode=disable"),
    ).toThrow("verified TLS");
    expect(postgresConfig("postgresql://test@127.0.0.1:55439/postgres").ssl).toBe(false);
  });
});
