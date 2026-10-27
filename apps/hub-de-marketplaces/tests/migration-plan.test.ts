import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMigrationFile, migrationName, pendingMigrations } from "../scripts/migration-plan.mjs";

describe("controle de migrations", () => {
  it("identifica a migration pelo nome do arquivo, não pelo caminho", () => {
    expect(migrationName("/migrations/0002_hub.sql")).toBe("0002_hub.sql");
    expect(migrationName("0001_auth.sql")).toBe("0001_auth.sql");
  });

  it("não reaplica arquivo que já consta como aplicado, venha de onde vier", () => {
    expect(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"])).toEqual([]);
  });

  it("devolve as pendentes em ordem de nome", () => {
    expect(
      pendingMigrations(
        ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
        ["0001_a.sql"],
      ),
    ).toEqual([
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ]);
  });

  it("ignora o que não é .sql (pastas, README)", () => {
    expect(isMigrationFile("auth")).toBe(false);
    expect(pendingMigrations(["auth", "README.md"], [])).toEqual([]);
  });

  it("o repositório traz o esquema de auth e o do hub, nesta ordem", () => {
    const files = readdirSync(join(__dirname, "..", "migrations"));
    expect(pendingMigrations(files, []).map((m) => m.name)).toEqual(["0001_auth.sql", "0002_hub.sql"]);
  });
});
