import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { structuredLLM } from "../lib/llm";
const schema = z.object({ category: z.enum(["groceries", "other"]) });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("structured LLM fallback", () => {
  it("works without a key and makes no network call", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      await structuredLLM("classify", {}, schema, () => ({
        category: "other",
      })),
    ).toEqual({ data: { category: "other" }, mode: "rules" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retries invalid schema output exactly once then uses rules", async () => {
    vi.stubEnv("LLM_API_KEY", "test");
    vi.stubEnv("LLM_PROVIDER", "openai");
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"category":"invented"}' } }],
      }),
    });
    vi.stubGlobal("fetch", fetch);
    const result = await structuredLLM("classify", {}, schema, () => ({
      category: "other",
    }));
    expect(result.mode).toBe("rules");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("accepts schema-valid structured output", async () => {
    vi.stubEnv("LLM_API_KEY", "test");
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"category":"groceries"}' } }],
        }),
      }),
    );
    expect(
      (
        await structuredLLM("classify", {}, schema, () => ({
          category: "other",
        }))
      ).data.category,
    ).toBe("groceries");
  });
});
