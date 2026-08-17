import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` exists to fail the build when a server module is pulled
      // into a client bundle. Under vitest we ARE the server, so it is stubbed
      // out — otherwise importing route handlers and the admin client throws.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Playwright specs live in tests/e2e and are driven by `pnpm test:e2e`.
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    clearMocks: true,
    restoreMocks: true,
  },
});
