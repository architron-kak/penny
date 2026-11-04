import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    env: { DATABASE_URL: "", REQUIRE_REMOTE_DATABASE: "false" },
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
