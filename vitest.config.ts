import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/components/ui/**",
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/app/organizations/page.tsx",
        "src/app/pull-requests/page.tsx",
        "src/app/admin/page.tsx",
        "src/components/theme-provider.tsx",
        "src/app/api/auth/**",
        "src/lib/auth-schema.ts",
        "src/lib/auth.ts",
        "src/lib/auth-client.ts",
        "src/features/issues/types/**",
        "src/features/issues/data/**",
        "src/features/organizations/types.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 92,
        functions: 95,
        lines: 95,
      },
    },
  },
});
