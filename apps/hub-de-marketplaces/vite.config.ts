import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

/** Os arquivos que `src/lib/db.ts` lê: mesma pasta, sem recursão. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Termina a abertura do PGlite durante o setup do servidor de desenvolvimento
 * (antes do primeiro request). Em produção, `src/lib/db` faz isso ao ser importado.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "hub:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
        ensureDbReady?: () => Promise<void>;
      };
      if (typeof mod.ensureDbReady === "function") await mod.ensureDbReady();
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // O código de servidor lê `process.env`, e o Vite só expõe `.env` ao cliente
  // (prefixo VITE_). Copiamos o `.env` para o processo sem sobrescrever o que o
  // ambiente já definiu.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    process.env[key] ??= value;
  }
  return {
    server: { host: "0.0.0.0", port: 8080, strictPort: true },
    preview: { host: "127.0.0.1", port: 8081, strictPort: true },
    resolve: { tsconfigPaths: true },
    plugins: [
      pgliteBootstrapPlugin(),
      tailwindcss(),
      tanstackStart(),
      // Saída de produção: servidor Node (`node .output/server/index.mjs`).
      // `traceDeps`: o PGlite lê `pglite.data`/`pglite.wasm` do disco em runtime. Empacotado
      // no bundle, esses arquivos somem e o modo sem DATABASE_URL quebra em produção.
      ...(command === "build"
        ? [nitro({ preset: "node-server", traceDeps: ["@electric-sql/pglite*"] })]
        : []),
      viteReact(),
    ],
  };
});
