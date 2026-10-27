import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config própria dos testes: sem os plugins do TanStack Start/Nitro, que só
// importam para dev e build. O alias "@/" espelha o `paths` do tsconfig.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
