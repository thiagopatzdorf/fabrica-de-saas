import { getSql, type Sql } from "@/lib/db";
import { rid } from "./ids";
import { seedOrganization } from "./seed.server";

export type { Sql };

function flagged(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export async function withOrg<T>(
  userId: string,
  fn: (sql: Sql, orgId: string) => Promise<T>,
): Promise<T> {
  const sql = await getSql();
  const orgId = await ensureOrg(sql, userId);
  return fn(sql, orgId);
}

/**
 * Por padrão a primeira abertura de cada organização é preenchida com dados
 * fictícios (a "Oficina Norte": catálogo, pedidos e perguntas) para o app não
 * nascer vazio. HUB_SEED_DEMO=false cria a organização vazia.
 */
export function demoSeedEnabled(): boolean {
  return process.env.HUB_SEED_DEMO?.trim().toLowerCase() !== "false";
}

async function ensureOrg(sql: Sql, userId: string): Promise<string> {
  const demo = demoSeedEnabled();
  const orgName = demo ? "Oficina Norte (demo)" : "Minha organização";
  const existing = await sql<{ id: string; seeded: boolean }>`
    select id, seeded from organizations where user_id = ${userId}
  `;
  if (existing[0] && flagged(existing[0].seeded)) return existing[0].id;
  if (!existing[0]) {
    const id = rid("org");
    await sql`
      insert into organizations (id, user_id, name, trade_name, document, seeded)
      values (${id}, ${userId}, ${orgName}, ${orgName}, ${"00.000.000/0000-00"}, false)
      on conflict (user_id) do nothing
    `;
  }
  const org = (
    await sql<{ id: string; seeded: boolean }>`
      select id, seeded from organizations where user_id = ${userId}
    `
  )[0];
  if (!org) throw new Error("Não foi possível abrir a organização.");
  if (!flagged(org.seeded)) {
    if (demo) await seedOrganization(sql, org.id);
    await sql`update organizations set seeded = true where id = ${org.id}`;
  }
  return org.id;
}
