import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { appOrigin } from "../lib/origin";
import { assertSameOrigin } from "../lib/http";
afterEach(() => vi.unstubAllEnvs());
describe("deployment origin", () => {
  it("uses Render HTTPS URL for origin checks when APP_URL is unset", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://penny-demo.onrender.com");
    expect(appOrigin()).toBe("https://penny-demo.onrender.com");
    expect(() =>
      assertSameOrigin(
        new NextRequest("http://0.0.0.0:10000/api/planning", {
          headers: { origin: "https://penny-demo.onrender.com" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new NextRequest("http://0.0.0.0:10000/api/planning", {
          headers: { origin: "https://other.example" },
        }),
      ),
    ).toThrow();
  });
  it("prefers an explicit custom-domain APP_URL", () => {
    vi.stubEnv("APP_URL", "https://penny.example/");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://penny-demo.onrender.com");
    expect(appOrigin()).toBe("https://penny.example");
  });
  it("keeps the localhost default for local development", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
    expect(appOrigin()).toBe("http://localhost:3000");
  });
});
