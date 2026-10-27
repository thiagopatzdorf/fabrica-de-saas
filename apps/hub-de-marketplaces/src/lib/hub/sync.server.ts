import type { Sql } from "@/lib/db";
import { getAdapter } from "./adapters.server";
import { isChannelId } from "./channels";
import { num, rid } from "./ids";

const SAFETY = "Estoque na segurança";

export async function writeLog(
  sql: Sql,
  orgId: string,
  input: {
    channel?: string | null;
    accountId?: string | null;
    action: string;
    ok: boolean;
    detail: string;
  },
): Promise<void> {
  await sql`
    insert into sync_logs (id, org_id, channel, account_id, action, ok, detail)
    values (
      ${rid("log")},
      ${orgId},
      ${input.channel ?? null},
      ${input.accountId ?? null},
      ${input.action},
      ${input.ok},
      ${input.detail}
    )
  `;
}

type ListingSync = {
  id: string;
  channel: string;
  status: string;
  external_id: string | null;
  last_error: string | null;
  account_status: string;
  account_id: string;
};

export async function syncProductStock(
  sql: Sql,
  orgId: string,
  productId: string,
): Promise<{ available: number; paused: number; failed: number }> {
  const rows = await sql<{
    stock_physical: number;
    stock_reserved: number;
    stock_safety: number;
    sku: string;
  }>`
    select stock_physical, stock_reserved, stock_safety, sku
    from products where id = ${productId} and org_id = ${orgId}
  `;
  const product = rows[0];
  if (!product) throw new Error("Produto não está no catálogo.");
  const available = num(product.stock_physical) - num(product.stock_reserved);
  const hit = available <= num(product.stock_safety);
  const listings = await sql<ListingSync>`
    select l.id, l.channel, l.status, l.external_id, l.last_error,
           a.status as account_status, a.id as account_id
    from listings l
    join channel_accounts a on a.id = l.account_id
    where l.product_id = ${productId} and l.org_id = ${orgId}
  `;
  let paused = 0;
  let failed = 0;
  for (const listing of listings) {
    const synced = Math.max(available, 0);
    if (!isChannelId(listing.channel)) continue;
    if (listing.status === "draft" || listing.status === "review") {
      await sql`update listings set stock_synced = ${synced}, updated_at = now() where id = ${listing.id}`;
      continue;
    }
    if (listing.account_status !== "connected") {
      failed += 1;
      await sql`
        update listings set status = 'error', last_error = ${"Conta sem conexão."}, updated_at = now()
        where id = ${listing.id}
      `;
      await writeLog(sql, orgId, {
        channel: listing.channel,
        accountId: listing.account_id,
        action: "updateStock",
        ok: false,
        detail: `${product.sku}: conta sem conexão.`,
      });
      continue;
    }
    const result = await getAdapter(listing.channel).updateStock({
      externalId: listing.external_id || `${listing.channel}-${product.sku}`,
      sku: product.sku,
      stock: synced,
    });
    if (!result.ok) {
      failed += 1;
      await sql`
        update listings set status = 'error', last_error = ${result.error}, updated_at = now()
        where id = ${listing.id}
      `;
      await writeLog(sql, orgId, {
        channel: listing.channel,
        accountId: listing.account_id,
        action: "updateStock",
        ok: false,
        detail: `${product.sku}: ${result.error}`,
      });
      continue;
    }
    let status = listing.status;
    let lastError = listing.last_error;
    if (hit && (status === "published" || status === "error")) {
      status = "paused";
      lastError = SAFETY;
      paused += 1;
    } else if (!hit && status === "paused" && lastError === SAFETY) {
      status = "published";
      lastError = null;
    } else if (status === "error") {
      status = "published";
      lastError = null;
    }
    await sql`
      update listings
      set status = ${status}, last_error = ${lastError}, stock_synced = ${synced},
          external_id = ${result.externalId}, updated_at = now()
      where id = ${listing.id}
    `;
    await writeLog(sql, orgId, {
      channel: listing.channel,
      accountId: listing.account_id,
      action: "updateStock",
      ok: true,
      detail: `${product.sku}: saldo ${synced} no canal.`,
    });
  }
  return { available, paused, failed };
}
