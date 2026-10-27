import { CHANNELS, channelLabel, isChannelId } from "./channels";
import { parseCsv } from "./csv";
import { parseDecimal } from "./format";
import { daysAgo, iso, num, rid, startOfTodayBR } from "./ids";
import type {
  AdjustmentInput,
  BulkListingsInput,
  ConnectInput,
  PriceRuleInput,
  ProductInput,
  PublishInput,
  ReplyInput,
  ShipInput,
  UpdateProductInput,
} from "./schemas";
import { withOrg } from "./scope.server";
import { syncProductStock, writeLog } from "./sync.server";
import { getAdapter, probeChannel, type ListingKind } from "./adapters.server";

function cleanSku(sku: string): string {
  return sku.trim().toUpperCase();
}

function cleanPhoto(url: string): string {
  const value = url.trim();
  if (!value) return "";
  if (!/^https:\/\/\S+$/i.test(value)) throw new Error("A foto precisa ser um link https.");
  return value;
}

function disconnected(status: string): string {
  if (status === "token_expired") return "Token expirado. Reconecte a conta em Conectores.";
  return "A conta está com erro. Teste a conexão de novo.";
}

function chave(seed: string): string {
  let out = "43";
  for (let i = 0; i < 42; i += 1) out += String((seed.charCodeAt(i % seed.length) + i * 7) % 10);
  return out;
}

function trackingCode(): string {
  let out = "BR";
  for (let i = 0; i < 11; i += 1) out += Math.floor(Math.random() * 10);
  return out;
}

async function availableOf(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
  productId: string,
): Promise<number> {
  const rows = await sql<{ stock_physical: number; stock_reserved: number }>`
    select stock_physical, stock_reserved from products where id = ${productId} and org_id = ${orgId}
  `;
  const row = rows[0];
  if (!row) return 0;
  return num(row.stock_physical) - num(row.stock_reserved);
}

async function reserve(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
  productId: string,
  qty: number,
): Promise<void> {
  const updated = await sql<{ id: string }>`
    update products
    set stock_reserved = stock_reserved + ${qty}
    where id = ${productId} and org_id = ${orgId}
      and stock_physical - stock_reserved >= ${qty}
    returning id
  `;
  if (!updated[0]) throw new Error("Sem saldo disponível para reservar.");
}

async function release(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
  productId: string,
  qty: number,
): Promise<void> {
  await sql`
    update products
    set stock_reserved = greatest(stock_reserved - ${qty}, 0)
    where id = ${productId} and org_id = ${orgId}
  `;
}

export function shell(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const org = await sql<{ trade_name: string; document: string }>`
      select trade_name, document from organizations where id = ${orgId}
    `;
    const counts = await sql<{ open_orders: number; errors: number; questions: number }>`
      select
        (select count(*) from orders where org_id = ${orgId} and status in ('awaiting_payment', 'paid', 'invoiced')) as open_orders,
        (select count(*) from listings where org_id = ${orgId} and status = 'error') as errors,
        (select count(*) from questions where org_id = ${orgId} and status = 'open') as questions
    `;
    const row = counts[0];
    return {
      tradeName: org[0]?.trade_name ?? "Organização",
      document: org[0]?.document ?? "",
      openOrders: num(row?.open_orders),
      errors: num(row?.errors),
      questions: num(row?.questions),
    };
  });
}

export function dashboard(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const since7 = daysAgo(7);
    const since30 = daysAgo(30);
    const today = startOfTodayBR();
    const org = await sql<{ trade_name: string }>`select trade_name from organizations where id = ${orgId}`;
    const todayRows = await sql<{ c: number }>`
      select count(*) as c from orders where org_id = ${orgId} and created_at >= ${today}
    `;
    const gmvRows = await sql<{ gmv7: number; gmv30: number }>`
      select
        coalesce(sum(total_cents) filter (
          where created_at >= ${since7} and status not in ('cancelled', 'awaiting_payment')
        ), 0) as gmv7,
        coalesce(sum(total_cents) filter (
          where created_at >= ${since30} and status not in ('cancelled', 'awaiting_payment')
        ), 0) as gmv30
      from orders where org_id = ${orgId}
    `;
    const critical = await sql<{ c: number }>`
      select count(*) as c from products
      where org_id = ${orgId} and kind <> 'parent'
        and stock_physical - stock_reserved <= stock_safety
    `;
    const paused = await sql<{ c: number }>`
      select count(*) as c from listings where org_id = ${orgId} and status = 'paused'
    `;
    const errors = await sql<{ c: number }>`
      select
        (select count(*) from listings where org_id = ${orgId} and status = 'error')
        + (select count(*) from channel_accounts where org_id = ${orgId} and status in ('error', 'token_expired'))
        + (select count(*) from sync_logs where org_id = ${orgId} and ok = false and created_at >= ${daysAgo(1)})
        as c
    `;
    const byChannel = await sql<{ channel: string; gmv7: number; gmv30: number; orders: number }>`
      select channel,
        coalesce(sum(total_cents) filter (
          where created_at >= ${since7} and status not in ('cancelled', 'awaiting_payment')
        ), 0) as gmv7,
        coalesce(sum(total_cents) filter (
          where created_at >= ${since30} and status not in ('cancelled', 'awaiting_payment')
        ), 0) as gmv30,
        count(*) filter (
          where created_at >= ${since30} and status not in ('cancelled', 'awaiting_payment')
        ) as orders
      from orders where org_id = ${orgId}
      group by channel
    `;
    const criticalItems = await sql<{
      sku: string;
      title: string;
      stock_physical: number;
      stock_reserved: number;
      stock_safety: number;
    }>`
      select sku, title, stock_physical, stock_reserved, stock_safety
      from products
      where org_id = ${orgId} and kind <> 'parent'
        and stock_physical - stock_reserved <= stock_safety
      order by (stock_physical - stock_reserved) - stock_safety
      limit 6
    `;
    const recent = await sql<{
      id: string;
      number: string;
      channel: string;
      buyer_name: string;
      total_cents: number;
      status: string;
      created_at: string;
    }>`
      select id, number, channel, buyer_name, total_cents, status, created_at
      from orders where org_id = ${orgId}
      order by created_at desc limit 8
    `;
    const queue = await sql<{ id: string; label: string; detail: string; at: string; kind: string }>`
      select id, label, detail, at, kind from (
        select l.id, l.title as label, coalesce(l.last_error, '') as detail, l.updated_at as at, 'anúncio' as kind
        from listings l where l.org_id = ${orgId} and l.status = 'error'
        union all
        select s.id, s.action as label, s.detail, s.created_at as at, 'sync' as kind
        from sync_logs s where s.org_id = ${orgId} and s.ok = false
      ) q
      order by at desc
      limit 8
    `;
    const gmv = gmvRows[0];
    return {
      tradeName: org[0]?.trade_name ?? "",
      ordersToday: num(todayRows[0]?.c),
      gmv7: num(gmv?.gmv7),
      gmv30: num(gmv?.gmv30),
      critical: num(critical[0]?.c),
      paused: num(paused[0]?.c),
      errors: num(errors[0]?.c),
      byChannel: CHANNELS.map((channel) => {
        const found = byChannel.find((row) => row.channel === channel.id);
        return {
          channel: channel.id,
          label: channel.label,
          gmv7: num(found?.gmv7),
          gmv30: num(found?.gmv30),
          orders: num(found?.orders),
        };
      }),
      criticalItems: criticalItems.map((row) => ({
        sku: row.sku,
        title: row.title,
        available: num(row.stock_physical) - num(row.stock_reserved),
        safety: num(row.stock_safety),
      })),
      recentOrders: recent.map((row) => ({
        id: row.id,
        number: row.number,
        channel: row.channel,
        buyer: row.buyer_name,
        totalCents: num(row.total_cents),
        status: row.status,
        createdAt: iso(row.created_at) ?? "",
      })),
      errorQueue: queue.map((row) => ({
        id: row.id,
        label: row.label,
        detail: row.detail,
        at: iso(row.at) ?? "",
        kind: row.kind,
      })),
    };
  });
}

export function catalog(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const products = await sql<{
      id: string;
      sku: string;
      title: string;
      kind: string;
      price_cents: number;
      cost_cents: number;
      stock_physical: number;
      stock_reserved: number;
      stock_safety: number;
      category_name: string | null;
      listings: number;
    }>`
      select p.id, p.sku, p.title, p.kind, p.price_cents, p.cost_cents,
             p.stock_physical, p.stock_reserved, p.stock_safety,
             c.name as category_name,
             (select count(*) from listings l where l.product_id = p.id) as listings
      from products p
      left join categories c on c.id = p.category_id
      where p.org_id = ${orgId}
      order by p.sku
    `;
    const categories = await sql<{ id: string; name: string }>`
      select id, name from categories where org_id = ${orgId} order by name
    `;
    return {
      categories,
      products: products.map((row) => ({
        id: row.id,
        sku: row.sku,
        title: row.title,
        kind: row.kind,
        priceCents: num(row.price_cents),
        costCents: num(row.cost_cents),
        available: num(row.stock_physical) - num(row.stock_reserved),
        safety: num(row.stock_safety),
        categoryName: row.category_name,
        listings: num(row.listings),
      })),
    };
  });
}

export function productDetail(userId: string, id: string) {
  return withOrg(userId, async (sql, orgId) => {
    const rows = await sql<{
      id: string;
      parent_id: string | null;
      kind: string;
      sku: string;
      ean: string;
      title: string;
      description: string;
      brand: string;
      ncm: string;
      weight_g: number;
      height_cm: number;
      width_cm: number;
      length_cm: number;
      cost_cents: number;
      price_cents: number;
      stock_physical: number;
      stock_safety: number;
      stock_reserved: number;
      category_id: string | null;
    }>`
      select id, parent_id, kind, sku, ean, title, description, brand, ncm,
             weight_g, height_cm, width_cm, length_cm, cost_cents, price_cents,
             stock_physical, stock_safety, stock_reserved, category_id
      from products where id = ${id} and org_id = ${orgId}
    `;
    const product = rows[0];
    if (!product) throw new Error("Produto não está no catálogo.");
    const aliases = await sql<{ channel: string; alias: string }>`
      select channel, alias from sku_aliases where product_id = ${id} order by channel
    `;
    const components = await sql<{ component_id: string; qty: number; sku: string; title: string }>`
      select k.component_id, k.qty, p.sku, p.title
      from kit_items k join products p on p.id = k.component_id
      where k.kit_id = ${id}
    `;
    const photos = await sql<{ url: string; label: string }>`
      select url, label from product_photos where product_id = ${id} order by sort
    `;
    const children = await sql<{ id: string; sku: string; title: string; stock_physical: number; stock_reserved: number }>`
      select id, sku, title, stock_physical, stock_reserved from products where parent_id = ${id} and org_id = ${orgId} order by sku
    `;
    const listings = await sql<{ id: string; channel: string; status: string; price_cents: number; account_name: string; stock_synced: number }>`
      select l.id, l.channel, l.status, l.price_cents, a.name as account_name, l.stock_synced
      from listings l join channel_accounts a on a.id = l.account_id
      where l.product_id = ${id}
      order by l.channel
    `;
    const categories = await sql<{ id: string; name: string }>`
      select id, name from categories where org_id = ${orgId} order by name
    `;
    const options = await sql<{ id: string; sku: string; title: string; kind: string }>`
      select id, sku, title, kind from products where org_id = ${orgId} and id <> ${id} order by sku
    `;
    return {
      categories,
      options,
      product: {
        id: product.id,
        parentId: product.parent_id,
        kind: product.kind,
        sku: product.sku,
        ean: product.ean,
        title: product.title,
        description: product.description,
        brand: product.brand,
        ncm: product.ncm,
        weightG: num(product.weight_g),
        heightCm: num(product.height_cm),
        widthCm: num(product.width_cm),
        lengthCm: num(product.length_cm),
        costCents: num(product.cost_cents),
        priceCents: num(product.price_cents),
        stockPhysical: num(product.stock_physical),
        stockSafety: num(product.stock_safety),
        stockReserved: num(product.stock_reserved),
        categoryId: product.category_id,
        photoUrl: photos[0]?.url ?? "",
      },
      aliases,
      components: components.map((row) => ({
        componentId: row.component_id,
        qty: num(row.qty),
        sku: row.sku,
        title: row.title,
      })),
      children: children.map((row) => ({
        id: row.id,
        sku: row.sku,
        title: row.title,
        available: num(row.stock_physical) - num(row.stock_reserved),
      })),
      listings: listings.map((row) => ({
        id: row.id,
        channel: row.channel,
        status: row.status,
        priceCents: num(row.price_cents),
        accountName: row.account_name,
        stockSynced: num(row.stock_synced),
      })),
    };
  });
}

async function assertProductRefs(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
  input: ProductInput,
  selfId?: string,
): Promise<void> {
  if (input.kind === "variation") {
    if (!input.parentId) throw new Error("Variação precisa de um produto pai.");
    const parent = await sql<{ kind: string }>`
      select kind from products where id = ${input.parentId} and org_id = ${orgId}
    `;
    if (parent[0]?.kind !== "parent") throw new Error("O pai precisa ser do tipo pai.");
  }
  if (input.categoryId) {
    const category = await sql<{ id: string }>`
      select id from categories where id = ${input.categoryId} and org_id = ${orgId}
    `;
    if (!category[0]) throw new Error("Categoria não encontrada.");
  }
  const seen = new Set<string>();
  for (const component of input.kind === "kit" ? input.components : []) {
    if (component.componentId === selfId) throw new Error("Um kit não pode conter a si mesmo.");
    if (seen.has(component.componentId)) throw new Error("Componente repetido no kit.");
    seen.add(component.componentId);
    const row = await sql<{ kind: string }>`
      select kind from products where id = ${component.componentId} and org_id = ${orgId}
    `;
    if (!row[0]) throw new Error("Componente fora do catálogo.");
    if (row[0].kind === "kit" || row[0].kind === "parent") {
      throw new Error("O kit recebe simples ou variação, não outro kit.");
    }
  }
}

async function writeExtras(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  await sql`delete from sku_aliases where product_id = ${productId}`;
  await sql`delete from kit_items where kit_id = ${productId}`;
  await sql`delete from product_photos where product_id = ${productId}`;
  for (const alias of input.aliases) {
    if (!alias.alias.trim()) continue;
    await sql`
      insert into sku_aliases (id, product_id, channel, alias)
      values (${rid("als")}, ${productId}, ${alias.channel}, ${alias.alias.trim()})
    `;
  }
  if (input.kind === "kit") {
    for (const component of input.components) {
      await sql`
        insert into kit_items (id, kit_id, component_id, qty)
        values (${rid("kit")}, ${productId}, ${component.componentId}, ${component.qty})
      `;
    }
  }
  await sql`
    insert into product_photos (id, product_id, sort, label, tone, url)
    values (${rid("pht")}, ${productId}, 0, ${cleanSku(input.sku).slice(0, 3)}, 'ink', ${cleanPhoto(input.photoUrl)})
  `;
  void orgId;
}

export function createProduct(userId: string, input: ProductInput) {
  return withOrg(userId, async (sql, orgId) => {
    await assertProductRefs(sql, orgId, input);
    const id = rid("prd");
    const sku = cleanSku(input.sku);
    try {
      await sql`
        insert into products (
          id, org_id, parent_id, kind, sku, ean, title, description, brand, ncm,
          weight_g, height_cm, width_cm, length_cm, cost_cents, price_cents,
          stock_physical, stock_safety, stock_reserved, category_id
        ) values (
          ${id}, ${orgId}, ${input.kind === "variation" ? (input.parentId ?? null) : null}, ${input.kind},
          ${sku}, ${input.ean}, ${input.title}, ${input.description}, ${input.brand}, ${input.ncm},
          ${input.weightG}, ${input.heightCm}, ${input.widthCm}, ${input.lengthCm},
          ${input.costCents}, ${input.priceCents}, ${input.stockPhysical}, ${input.stockSafety}, 0,
          ${input.categoryId ?? null}
        )
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("unique") || message.toLowerCase().includes("duplicate")) {
        throw new Error("Já existe um SKU com esse código.");
      }
      throw error;
    }
    await writeExtras(sql, orgId, id, input);
    return { id };
  });
}

export function updateProduct(userId: string, input: UpdateProductInput) {
  return withOrg(userId, async (sql, orgId) => {
    const current = await sql<{ stock_reserved: number }>`
      select stock_reserved from products where id = ${input.id} and org_id = ${orgId}
    `;
    if (!current[0]) throw new Error("Produto não está no catálogo.");
    if (input.stockPhysical < num(current[0].stock_reserved)) {
      throw new Error("O estoque físico não pode ficar abaixo do reservado.");
    }
    await assertProductRefs(sql, orgId, input, input.id);
    const sku = cleanSku(input.sku);
    try {
      await sql`
        update products set
          parent_id = ${input.kind === "variation" ? (input.parentId ?? null) : null},
          kind = ${input.kind},
          sku = ${sku},
          ean = ${input.ean},
          title = ${input.title},
          description = ${input.description},
          brand = ${input.brand},
          ncm = ${input.ncm},
          weight_g = ${input.weightG},
          height_cm = ${input.heightCm},
          width_cm = ${input.widthCm},
          length_cm = ${input.lengthCm},
          cost_cents = ${input.costCents},
          price_cents = ${input.priceCents},
          stock_physical = ${input.stockPhysical},
          stock_safety = ${input.stockSafety},
          category_id = ${input.categoryId ?? null}
        where id = ${input.id} and org_id = ${orgId}
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("unique") || message.toLowerCase().includes("duplicate")) {
        throw new Error("Já existe um SKU com esse código.");
      }
      throw error;
    }
    await writeExtras(sql, orgId, input.id, input);
    await syncProductStock(sql, orgId, input.id);
    return { id: input.id };
  });
}

export function importCsv(userId: string, csv: string) {
  return withOrg(userId, async (sql, orgId) => {
    const rows = parseCsv(csv);
    if (!rows.length) throw new Error("Nenhuma linha no CSV.");
    const categories = await sql<{ id: string; name: string }>`
      select id, name from categories where org_id = ${orgId}
    `;
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const sku = cleanSku(row.sku ?? "");
      const title = (row.titulo ?? "").trim();
      if (!sku || !title) {
        errors.push(`Linha ${line}: SKU e título são obrigatórios.`);
        continue;
      }
      const exists = await sql<{ id: string }>`
        select id from products where org_id = ${orgId} and sku = ${sku}
      `;
      if (exists[0]) {
        skipped += 1;
        continue;
      }
      const tipo = (row.tipo ?? "simples").toLowerCase();
      const kind = tipo === "kit" ? "kit" : tipo === "pai" || tipo === "parent" ? "parent" : "simple";
      if (tipo.startsWith("var")) {
        errors.push(`Linha ${line}: variação precisa nascer no cadastro, com um pai.`);
        continue;
      }
      const categoryName = (row.categoria ?? "").trim().toLowerCase();
      const category = categories.find((item) => item.name.toLowerCase() === categoryName);
      if (categoryName && !category) {
        errors.push(`Linha ${line}: categoria desconhecida.`);
        continue;
      }
      try {
        await sql`
          insert into products (
            id, org_id, kind, sku, ean, title, description, brand, ncm,
            weight_g, height_cm, width_cm, length_cm, cost_cents, price_cents,
            stock_physical, stock_safety, category_id
          ) values (
            ${rid("prd")}, ${orgId}, ${kind}, ${sku}, ${row.ean ?? ""}, ${title},
            ${row.descricao ?? ""}, ${row.marca ?? ""}, ${row.ncm ?? ""},
            ${Math.round(parseDecimal(row.peso_g ?? "0"))},
            ${Math.round(parseDecimal(row.altura_cm ?? "0"))},
            ${Math.round(parseDecimal(row.largura_cm ?? "0"))},
            ${Math.round(parseDecimal(row.comprimento_cm ?? "0"))},
            ${Math.round(parseDecimal(row.custo ?? "0") * 100)},
            ${Math.round(parseDecimal(row.preco ?? "0") * 100)},
            ${Math.round(parseDecimal(row.estoque ?? "0"))},
            ${Math.round(parseDecimal(row.seguranca ?? "0"))},
            ${category?.id ?? null}
          )
        `;
        created += 1;
      } catch (error) {
        errors.push(`Linha ${line}: ${error instanceof Error ? error.message : "falha"}`);
      }
    }
    return { created, skipped, errors };
  });
}

export function mappings(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const categories = await sql<{ id: string; name: string; key: string }>`
      select id, name, key from categories where org_id = ${orgId} order by name
    `;
    const maps = await sql<{
      id: string;
      category_id: string;
      channel: string;
      channel_category_id: string;
      channel_category_name: string;
    }>`
      select id, category_id, channel, channel_category_id, channel_category_name
      from category_maps where org_id = ${orgId}
    `;
    const attributes = await sql<{ id: string; category_map_id: string; name: string; value: string }>`
      select id, category_map_id, name, value from channel_attributes where org_id = ${orgId} order by name
    `;
    const counts = await sql<{ category_id: string | null; c: number }>`
      select category_id, count(*) as c from products
      where org_id = ${orgId} and kind <> 'parent' group by category_id
    `;
    const countOf = (categoryId: string | null) =>
      num(counts.find((row) => row.category_id === categoryId)?.c);
    const gaps = categories.flatMap((category) =>
      CHANNELS.filter(
        (channel) => !maps.some((map) => map.category_id === category.id && map.channel === channel.id),
      ).map((channel) => ({
        categoryId: category.id,
        categoryName: category.name,
        channel: channel.id,
        skus: countOf(category.id),
      })),
    );
    const uncategorized = countOf(null);
    return {
      uncategorized,
      gaps: gaps.filter((gap) => gap.skus > 0),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        key: category.key,
        skus: countOf(category.id),
        maps: CHANNELS.map((channel) => {
          const map = maps.find((item) => item.category_id === category.id && item.channel === channel.id);
          return {
            channel: channel.id,
            mapId: map?.id ?? null,
            channelCategoryId: map?.channel_category_id ?? "",
            channelCategoryName: map?.channel_category_name ?? "",
            attributes: map
              ? attributes
                  .filter((attribute) => attribute.category_map_id === map.id)
                  .map((attribute) => ({ id: attribute.id, name: attribute.name, value: attribute.value }))
              : [],
          };
        }),
      })),
    };
  });
}

export function saveMap(
  userId: string,
  input: { categoryId: string; channel: string; channelCategoryId: string },
) {
  return withOrg(userId, async (sql, orgId) => {
    if (!isChannelId(input.channel)) throw new Error("Canal inválido.");
    const { CHANNEL_CATEGORIES } = await import("./channels");
    const remote = CHANNEL_CATEGORIES[input.channel].find((item) => item.id === input.channelCategoryId);
    if (!remote) throw new Error("Categoria do canal não existe.");
    const category = await sql<{ id: string }>`
      select id from categories where id = ${input.categoryId} and org_id = ${orgId}
    `;
    if (!category[0]) throw new Error("Categoria interna não encontrada.");
    const existing = await sql<{ id: string; channel_category_id: string }>`
      select id, channel_category_id from category_maps
      where category_id = ${input.categoryId} and channel = ${input.channel}
    `;
    let mapId = existing[0]?.id;
    if (!mapId) {
      mapId = rid("map");
      await sql`
        insert into category_maps (id, org_id, category_id, channel, channel_category_id, channel_category_name)
        values (${mapId}, ${orgId}, ${input.categoryId}, ${input.channel}, ${remote.id}, ${remote.name})
      `;
    } else if (existing[0]?.channel_category_id !== remote.id) {
      await sql`
        update category_maps set channel_category_id = ${remote.id}, channel_category_name = ${remote.name}
        where id = ${mapId}
      `;
    }
    if (!existing[0] || existing[0].channel_category_id !== remote.id) {
      await sql`delete from channel_attributes where category_map_id = ${mapId}`;
      for (const name of remote.attributes) {
        await sql`
          insert into channel_attributes (id, org_id, category_map_id, name, required, value)
          values (${rid("atr")}, ${orgId}, ${mapId}, ${name}, true, '')
        `;
      }
    }
    return { ok: true as const };
  });
}

export function saveAttribute(userId: string, input: { attributeId: string; value: string }) {
  return withOrg(userId, async (sql, orgId) => {
    const updated = await sql<{ id: string }>`
      update channel_attributes set value = ${input.value}
      where id = ${input.attributeId} and org_id = ${orgId}
      returning id
    `;
    if (!updated[0]) throw new Error("Atributo não encontrado.");
    return { ok: true as const };
  });
}

export function listings(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const rows = await sql<{
      id: string;
      product_id: string;
      sku: string;
      channel: string;
      account_id: string;
      account_name: string;
      account_status: string;
      kind: string;
      title: string;
      price_cents: number;
      status: string;
      external_id: string | null;
      last_error: string | null;
      stock_synced: number;
    }>`
      select l.id, l.product_id, p.sku, l.channel, l.account_id, a.name as account_name,
             a.status as account_status, l.kind, l.title, l.price_cents, l.status,
             l.external_id, l.last_error, l.stock_synced
      from listings l
      join products p on p.id = l.product_id
      join channel_accounts a on a.id = l.account_id
      where l.org_id = ${orgId}
      order by p.sku, l.channel
    `;
    const products = await sql<{
      id: string;
      sku: string;
      title: string;
      kind: string;
      cost_cents: number;
      price_cents: number;
      stock_physical: number;
      stock_reserved: number;
      category_id: string | null;
    }>`
      select id, sku, title, kind, cost_cents, price_cents, stock_physical, stock_reserved, category_id
      from products where org_id = ${orgId} and kind <> 'parent' order by sku
    `;
    const accounts = await sql<{ id: string; channel: string; name: string; status: string }>`
      select id, channel, name, status from channel_accounts where org_id = ${orgId} order by channel
    `;
    const rules = await priceRuleRows(sql, orgId);
    return {
      listings: rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        sku: row.sku,
        channel: row.channel,
        accountId: row.account_id,
        accountName: row.account_name,
        accountStatus: row.account_status,
        kind: row.kind,
        title: row.title,
        priceCents: num(row.price_cents),
        status: row.status,
        externalId: row.external_id,
        lastError: row.last_error,
        stockSynced: num(row.stock_synced),
      })),
      products: products.map((row) => ({
        id: row.id,
        sku: row.sku,
        title: row.title,
        kind: row.kind,
        costCents: num(row.cost_cents),
        priceCents: num(row.price_cents),
        available: num(row.stock_physical) - num(row.stock_reserved),
        categoryId: row.category_id,
      })),
      accounts,
      rules,
    };
  });
}

async function priceRuleRows(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
) {
  const rows = await sql<{
    channel: string;
    freight_cents: number;
    commission_bps: number;
    tax_bps: number;
    margin_bps: number;
    markup_bps: number;
    floor_cents: number;
    round_90: boolean;
    promo_pct: number;
    promo_start: string | null;
    promo_end: string | null;
  }>`
    select channel, freight_cents, commission_bps, tax_bps, margin_bps, markup_bps,
           floor_cents, round_90, promo_pct, promo_start, promo_end
    from price_rules where org_id = ${orgId}
  `;
  return rows.map((row) => ({
    channel: row.channel,
    freightCents: num(row.freight_cents),
    commissionBps: num(row.commission_bps),
    taxBps: num(row.tax_bps),
    marginBps: num(row.margin_bps),
    markupBps: num(row.markup_bps),
    floorCents: num(row.floor_cents),
    round90: row.round_90 === true || String(row.round_90) === "t" || String(row.round_90) === "true",
    promoPct: num(row.promo_pct),
    promoStart: row.promo_start ? String(row.promo_start).slice(0, 10) : null,
    promoEnd: row.promo_end ? String(row.promo_end).slice(0, 10) : null,
  }));
}

async function requireMap(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
  categoryId: string | null,
  channel: string,
): Promise<string | null> {
  if (!categoryId) return "O SKU está sem categoria interna.";
  const map = await sql<{ id: string }>`
    select id from category_maps where org_id = ${orgId} and category_id = ${categoryId} and channel = ${channel}
  `;
  if (!map[0]) return `Sem mapa de categoria em ${channelLabel(channel)}.`;
  const missing = await sql<{ name: string }>`
    select name from channel_attributes
    where category_map_id = ${map[0].id} and required = true and (value is null or value = '')
  `;
  if (missing.length) return `Atributo obrigatório: ${missing.map((row) => row.name).join(", ")}.`;
  return null;
}

export function publish(userId: string, input: PublishInput) {
  return withOrg(userId, async (sql, orgId) => {
    const products = await sql<{
      id: string;
      sku: string;
      category_id: string | null;
      stock_physical: number;
      stock_reserved: number;
    }>`
      select id, sku, category_id, stock_physical, stock_reserved
      from products where id = ${input.productId} and org_id = ${orgId}
    `;
    const product = products[0];
    if (!product) throw new Error("Produto não está no catálogo.");
    const results: { accountId: string; channel: string; ok: boolean; error?: string }[] = [];
    for (const target of input.targets) {
      const accounts = await sql<{ id: string; channel: string; status: string; name: string }>`
        select id, channel, status, name from channel_accounts where id = ${target.accountId} and org_id = ${orgId}
      `;
      const account = accounts[0];
      if (!account || !isChannelId(account.channel)) {
        results.push({ accountId: target.accountId, channel: "", ok: false, error: "Conta não encontrada." });
        continue;
      }
      const blocked = await requireMap(sql, orgId, product.category_id, account.channel);
      if (blocked) {
        const existing = await sql<{ id: string }>`
          select id from listings where product_id = ${product.id} and account_id = ${account.id}
        `;
        if (existing[0]) {
          await sql`
            update listings set status = 'review', last_error = ${blocked}, title = ${input.title},
              kind = ${input.kind}, price_cents = ${target.priceCents}, updated_at = now()
            where id = ${existing[0].id}
          `;
        }
        results.push({ accountId: account.id, channel: account.channel, ok: false, error: blocked });
        continue;
      }
      if (account.status !== "connected") {
        results.push({
          accountId: account.id,
          channel: account.channel,
          ok: false,
          error: disconnected(account.status),
        });
        continue;
      }
      const stock = Math.max(num(product.stock_physical) - num(product.stock_reserved), 0);
      const previous = await sql<{ id: string; external_id: string | null }>`
        select id, external_id from listings where product_id = ${product.id} and account_id = ${account.id}
      `;
      const result = await getAdapter(account.channel).publish({
        sku: product.sku,
        title: input.title,
        priceCents: target.priceCents,
        stock,
        kind: input.kind as ListingKind,
      });
      const listingId = previous[0]?.id ?? rid("lst");
      if (!result.ok) {
        if (previous[0]) {
          await sql`
            update listings set status = 'error', last_error = ${result.error}, title = ${input.title},
              kind = ${input.kind}, price_cents = ${target.priceCents}, updated_at = now()
            where id = ${listingId}
          `;
        } else {
          await sql`
            insert into listings (
              id, org_id, product_id, account_id, channel, kind, title, price_cents, status, last_error, stock_synced
            ) values (
              ${listingId}, ${orgId}, ${product.id}, ${account.id}, ${account.channel}, ${input.kind},
              ${input.title}, ${target.priceCents}, 'error', ${result.error}, ${stock}
            )
          `;
        }
        await writeLog(sql, orgId, {
          channel: account.channel,
          accountId: account.id,
          action: "publish",
          ok: false,
          detail: `${product.sku}: ${result.error}`,
        });
        results.push({ accountId: account.id, channel: account.channel, ok: false, error: result.error });
        continue;
      }
      if (previous[0]) {
        await sql`
          update listings set status = 'published', last_error = null, external_id = ${result.externalId},
            title = ${input.title}, kind = ${input.kind}, price_cents = ${target.priceCents},
            stock_synced = ${stock}, updated_at = now()
          where id = ${listingId}
        `;
      } else {
        await sql`
          insert into listings (
            id, org_id, product_id, account_id, channel, kind, title, price_cents, status, external_id, stock_synced
          ) values (
            ${listingId}, ${orgId}, ${product.id}, ${account.id}, ${account.channel}, ${input.kind},
            ${input.title}, ${target.priceCents}, 'published', ${result.externalId}, ${stock}
          )
        `;
      }
      await writeLog(sql, orgId, {
        channel: account.channel,
        accountId: account.id,
        action: "publish",
        ok: true,
        detail: `${product.sku} publicado em ${channelLabel(account.channel)}.`,
      });
      results.push({ accountId: account.id, channel: account.channel, ok: true });
    }
    return { results };
  });
}

export function bulkListings(userId: string, input: BulkListingsInput) {
  return withOrg(userId, async (sql, orgId) => {
    const touched = new Set<string>();
    const errors: string[] = [];
    for (const id of input.ids) {
      const rows = await sql<{
        id: string;
        product_id: string;
        sku: string;
        title: string;
        channel: string;
        account_id: string;
        account_status: string;
        external_id: string | null;
        price_cents: number;
        stock_physical: number;
        stock_reserved: number;
      }>`
        select l.id, l.product_id, p.sku, l.title, l.channel, l.account_id, a.status as account_status,
               l.external_id, l.price_cents, p.stock_physical, p.stock_reserved
        from listings l
        join products p on p.id = l.product_id
        join channel_accounts a on a.id = l.account_id
        where l.id = ${id} and l.org_id = ${orgId}
      `;
      const listing = rows[0];
      if (!listing || !isChannelId(listing.channel)) continue;
      let title = listing.title;
      if (input.titleFind) title = title.split(input.titleFind).join(input.titleReplace);
      const price = input.priceCents ?? num(listing.price_cents);
      if (input.stockPhysical != null && !touched.has(listing.product_id)) {
        if (input.stockPhysical < num(listing.stock_reserved)) {
          errors.push(`${listing.sku}: físico abaixo do reservado.`);
        } else {
          await sql`
            update products set stock_physical = ${input.stockPhysical}
            where id = ${listing.product_id} and org_id = ${orgId}
          `;
          touched.add(listing.product_id);
        }
      }
      if (listing.account_status !== "connected") {
        errors.push(`${listing.sku}: ${disconnected(listing.account_status)}`);
        continue;
      }
      if (input.priceCents != null) {
        const priced = await getAdapter(listing.channel).updatePrice({
          externalId: listing.external_id || listing.sku,
          sku: listing.sku,
          priceCents: price,
        });
        if (!priced.ok) {
          errors.push(`${listing.sku}: ${priced.error}`);
          await sql`update listings set status = 'error', last_error = ${priced.error}, updated_at = now() where id = ${listing.id}`;
          continue;
        }
      }
      await sql`
        update listings set title = ${title}, price_cents = ${price}, updated_at = now()
        where id = ${listing.id}
      `;
    }
    for (const productId of touched) await syncProductStock(sql, orgId, productId);
    return { errors };
  });
}

export function setListingStatus(userId: string, input: { id: string; status: "published" | "paused" | "draft" }) {
  return withOrg(userId, async (sql, orgId) => {
    const updated = await sql<{ id: string }>`
      update listings set status = ${input.status},
        last_error = case when ${input.status} = 'paused' then null else last_error end,
        updated_at = now()
      where id = ${input.id} and org_id = ${orgId}
      returning id
    `;
    if (!updated[0]) throw new Error("Anúncio não encontrado.");
    return { ok: true as const };
  });
}

export function pricing(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const products = await sql<{ id: string; sku: string; title: string; cost_cents: number }>`
      select id, sku, title, cost_cents from products
      where org_id = ${orgId} and kind <> 'parent' order by sku
    `;
    return {
      rules: await priceRuleRows(sql, orgId),
      products: products.map((row) => ({
        id: row.id,
        sku: row.sku,
        title: row.title,
        costCents: num(row.cost_cents),
      })),
    };
  });
}

export function savePriceRule(userId: string, input: PriceRuleInput) {
  return withOrg(userId, async (sql, orgId) => {
    if (input.commissionBps + input.taxBps + input.marginBps > 8000) {
      throw new Error("Comissão, imposto e margem juntos passam de 80%.");
    }
    const existing = await sql<{ id: string }>`
      select id from price_rules where org_id = ${orgId} and channel = ${input.channel}
    `;
    if (existing[0]) {
      await sql`
        update price_rules set
          freight_cents = ${input.freightCents},
          commission_bps = ${input.commissionBps},
          tax_bps = ${input.taxBps},
          margin_bps = ${input.marginBps},
          markup_bps = ${input.markupBps},
          floor_cents = ${input.floorCents},
          round_90 = ${input.round90},
          promo_pct = ${input.promoPct},
          promo_start = ${input.promoStart},
          promo_end = ${input.promoEnd}
        where id = ${existing[0].id}
      `;
    } else {
      await sql`
        insert into price_rules (
          id, org_id, channel, freight_cents, commission_bps, tax_bps, margin_bps, markup_bps,
          floor_cents, round_90, promo_pct, promo_start, promo_end
        ) values (
          ${rid("rul")}, ${orgId}, ${input.channel}, ${input.freightCents}, ${input.commissionBps},
          ${input.taxBps}, ${input.marginBps}, ${input.markupBps}, ${input.floorCents}, ${input.round90},
          ${input.promoPct}, ${input.promoStart}, ${input.promoEnd}
        )
      `;
    }
    return { ok: true as const };
  });
}

export function applySuggested(userId: string, channel: string) {
  return withOrg(userId, async (sql, orgId) => {
    if (!isChannelId(channel)) throw new Error("Canal inválido.");
    const rules = await priceRuleRows(sql, orgId);
    const rule = rules.find((item) => item.channel === channel);
    if (!rule) throw new Error("Este canal ainda não tem regra de preço.");
    const { suggestPrice } = await import("./format");
    const rows = await sql<{
      id: string;
      sku: string;
      external_id: string | null;
      account_status: string;
      account_id: string;
      cost_cents: number;
    }>`
      select l.id, p.sku, l.external_id, a.status as account_status, a.id as account_id, p.cost_cents
      from listings l
      join products p on p.id = l.product_id
      join channel_accounts a on a.id = l.account_id
      where l.org_id = ${orgId} and l.channel = ${channel} and l.status in ('published', 'paused')
    `;
    let updated = 0;
    const errors: string[] = [];
    for (const row of rows) {
      if (row.account_status !== "connected") {
        errors.push(`${row.sku}: ${disconnected(row.account_status)}`);
        continue;
      }
      const price = suggestPrice({
        costCents: num(row.cost_cents),
        freightCents: rule.freightCents,
        commissionBps: rule.commissionBps,
        taxBps: rule.taxBps,
        marginBps: rule.marginBps,
        markupBps: rule.markupBps,
        floorCents: rule.floorCents,
        round90: rule.round90,
        promoPct: rule.promoPct,
        promoStart: rule.promoStart,
        promoEnd: rule.promoEnd,
      }).suggestedCents;
      const result = await getAdapter(channel).updatePrice({
        externalId: row.external_id || row.sku,
        sku: row.sku,
        priceCents: price,
      });
      if (!result.ok) {
        errors.push(`${row.sku}: ${result.error}`);
        continue;
      }
      await sql`update listings set price_cents = ${price}, updated_at = now() where id = ${row.id}`;
      updated += 1;
    }
    return { updated, errors };
  });
}

export function stock(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const products = await sql<{
      id: string;
      sku: string;
      title: string;
      stock_physical: number;
      stock_reserved: number;
      stock_safety: number;
    }>`
      select id, sku, title, stock_physical, stock_reserved, stock_safety
      from products where org_id = ${orgId} and kind <> 'parent' order by sku
    `;
    const queue = await sql<{
      id: string;
      sku: string;
      delta: number;
      reason: string;
      status: string;
      created_at: string;
      product_id: string;
    }>`
      select a.id, p.sku, a.delta, a.reason, a.status, a.created_at, a.product_id
      from stock_adjustments a join products p on p.id = a.product_id
      where a.org_id = ${orgId}
      order by a.created_at desc limit 20
    `;
    const logs = await sql<{ id: string; channel: string | null; action: string; ok: boolean; detail: string; created_at: string }>`
      select id, channel, action, ok, detail, created_at from sync_logs
      where org_id = ${orgId} order by created_at desc limit 20
    `;
    return {
      products: products.map((row) => ({
        id: row.id,
        sku: row.sku,
        title: row.title,
        physical: num(row.stock_physical),
        reserved: num(row.stock_reserved),
        safety: num(row.stock_safety),
        available: num(row.stock_physical) - num(row.stock_reserved),
      })),
      queue: queue.map((row) => ({
        id: row.id,
        productId: row.product_id,
        sku: row.sku,
        delta: num(row.delta),
        reason: row.reason,
        status: row.status,
        createdAt: iso(row.created_at) ?? "",
      })),
      logs: logs.map((row) => ({
        id: row.id,
        channel: row.channel,
        action: row.action,
        ok: row.ok === true || String(row.ok) === "t" || String(row.ok) === "true",
        detail: row.detail,
        createdAt: iso(row.created_at) ?? "",
      })),
    };
  });
}

export function queueAdjustment(userId: string, input: AdjustmentInput) {
  return withOrg(userId, async (sql, orgId) => {
    const product = await sql<{ id: string }>`
      select id from products where id = ${input.productId} and org_id = ${orgId}
    `;
    if (!product[0]) throw new Error("Produto não está no catálogo.");
    const id = rid("adj");
    await sql`
      insert into stock_adjustments (id, org_id, product_id, delta, reason, status)
      values (${id}, ${orgId}, ${input.productId}, ${input.delta}, ${input.reason}, 'queued')
    `;
    return { id };
  });
}

export function applyAdjustment(userId: string, id: string) {
  return withOrg(userId, async (sql, orgId) => {
    const rows = await sql<{ product_id: string; delta: number; status: string }>`
      select product_id, delta, status from stock_adjustments where id = ${id} and org_id = ${orgId}
    `;
    const adjustment = rows[0];
    if (!adjustment) throw new Error("Ajuste não encontrado.");
    if (adjustment.status !== "queued") throw new Error("Esse ajuste já saiu da fila.");
    const product = await sql<{ stock_physical: number; stock_reserved: number }>`
      select stock_physical, stock_reserved from products where id = ${adjustment.product_id} and org_id = ${orgId}
    `;
    if (!product[0]) throw new Error("Produto não está no catálogo.");
    const next = num(product[0].stock_physical) + num(adjustment.delta);
    if (next < 0) throw new Error("Estoque não fica negativo.");
    if (next < num(product[0].stock_reserved)) throw new Error("O ajuste deixaria o físico abaixo do reservado.");
    await sql`update products set stock_physical = ${next} where id = ${adjustment.product_id}`;
    await sql`update stock_adjustments set status = 'applied' where id = ${id}`;
    const sync = await syncProductStock(sql, orgId, adjustment.product_id);
    return sync;
  });
}

export function resync(userId: string, productId: string) {
  return withOrg(userId, (sql, orgId) => syncProductStock(sql, orgId, productId));
}

async function orderBundle(sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>, orgId: string) {
  const orders = await sql<{
    id: string;
    number: string;
    channel: string;
    account_name: string | null;
    buyer_name: string;
    status: string;
    freight_cents: number;
    total_cents: number;
    sla_at: string | null;
    address: string;
    created_at: string;
  }>`
    select o.id, o.number, o.channel, a.name as account_name, o.buyer_name, o.status,
           o.freight_cents, o.total_cents, o.sla_at, o.address, o.created_at
    from orders o
    left join channel_accounts a on a.id = o.account_id
    where o.org_id = ${orgId}
    order by o.created_at desc
  `;
  const items = await sql<{
    order_id: string;
    sku: string;
    title: string;
    qty: number;
    price_cents: number;
    product_id: string | null;
  }>`
    select oi.order_id, oi.sku, oi.title, oi.qty, oi.price_cents, oi.product_id
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.org_id = ${orgId}
  `;
  return orders.map((order) => ({
    id: order.id,
    number: order.number,
    channel: order.channel,
    accountName: order.account_name,
    buyer: order.buyer_name,
    status: order.status,
    freightCents: num(order.freight_cents),
    totalCents: num(order.total_cents),
    slaAt: iso(order.sla_at),
    address: order.address,
    createdAt: iso(order.created_at) ?? "",
    items: items
      .filter((item) => item.order_id === order.id)
      .map((item) => ({
        sku: item.sku,
        title: item.title,
        qty: num(item.qty),
        priceCents: num(item.price_cents),
        productId: item.product_id,
      })),
  }));
}

export function orders(userId: string) {
  return withOrg(userId, async (sql, orgId) => ({ orders: await orderBundle(sql, orgId) }));
}

async function ensurePaidPaperwork(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
  orderId: string,
): Promise<void> {
  const invoice = await sql<{ id: string }>`select id from invoices where order_id = ${orderId}`;
  if (!invoice[0]) {
    await sql`
      insert into invoices (id, org_id, order_id, status) values (${rid("nf")}, ${orgId}, ${orderId}, 'queued')
    `;
  }
  const shipment = await sql<{ id: string }>`select id from shipments where order_id = ${orderId}`;
  if (!shipment[0]) {
    await sql`
      insert into shipments (id, org_id, order_id, label_ready, status)
      values (${rid("shp")}, ${orgId}, ${orderId}, false, 'waiting_invoice')
    `;
  }
}

export function mockSale(userId: string, listingId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const rows = await sql<{
      id: string;
      product_id: string;
      account_id: string;
      channel: string;
      status: string;
      price_cents: number;
      title: string;
      sku: string;
    }>`
      select l.id, l.product_id, l.account_id, l.channel, l.status, l.price_cents, l.title, p.sku
      from listings l join products p on p.id = l.product_id
      where l.id = ${listingId} and l.org_id = ${orgId}
    `;
    const listing = rows[0];
    if (!listing) throw new Error("Anúncio não encontrado.");
    if (listing.status !== "published") throw new Error("A venda mock só nasce de anúncio publicado.");
    await reserve(sql, orgId, listing.product_id, 1);
    const freightRow = await sql<{ freight_cents: number }>`
      select freight_cents from price_rules where org_id = ${orgId} and channel = ${listing.channel}
    `;
    const freight = num(freightRow[0]?.freight_cents);
    const orderId = rid("ord");
    const number = `MK-${Date.now().toString().slice(-8)}`;
    const sla = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await sql`
      insert into orders (
        id, org_id, account_id, channel, number, buyer_name, buyer_doc, status,
        freight_cents, total_cents, sla_at, address
      ) values (
        ${orderId}, ${orgId}, ${listing.account_id}, ${listing.channel}, ${number},
        ${"Comprador mock"}, ${"•••.000.000-••"}, 'paid', ${freight},
        ${num(listing.price_cents) + freight}, ${sla}, ${"Retirada simulada · Caxias do Sul, RS"}
      )
    `;
    await sql`
      insert into order_items (id, order_id, product_id, listing_id, sku, title, qty, price_cents)
      values (${rid("itm")}, ${orderId}, ${listing.product_id}, ${listing.id}, ${listing.sku}, ${listing.title}, 1, ${listing.price_cents})
    `;
    await ensurePaidPaperwork(sql, orgId, orderId);
    const sync = await syncProductStock(sql, orgId, listing.product_id);
    return { orderNumber: number, available: sync.available, paused: sync.paused, failed: sync.failed };
  });
}

export function pullOrders(userId: string, accountId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const accounts = await sql<{ id: string; channel: string; status: string; name: string }>`
      select id, channel, status, name from channel_accounts where id = ${accountId} and org_id = ${orgId}
    `;
    const account = accounts[0];
    if (!account || !isChannelId(account.channel)) throw new Error("Conta não encontrada.");
    if (account.status !== "connected") throw new Error(disconnected(account.status));
    const pulled = await getAdapter(account.channel).pullOrders();
    if (!pulled.ok) {
      await writeLog(sql, orgId, {
        channel: account.channel,
        accountId: account.id,
        action: "pullOrders",
        ok: false,
        detail: pulled.error,
      });
      throw new Error(pulled.error);
    }
    const listings = await sql<{
      id: string;
      product_id: string;
      price_cents: number;
      title: string;
      sku: string;
    }>`
      select l.id, l.product_id, l.price_cents, l.title, p.sku
      from listings l join products p on p.id = l.product_id
      where l.account_id = ${account.id} and l.status = 'published'
        and p.stock_physical - p.stock_reserved > 0
      limit 1
    `;
    const listing = listings[0];
    if (!listing) return { created: false as const, message: "Nenhum anúncio publicado com saldo nessa conta." };
    await reserve(sql, orgId, listing.product_id, 1);
    const orderId = rid("ord");
    const number = `PED-${Date.now().toString().slice(-6)}`;
    await sql`
      insert into orders (
        id, org_id, account_id, channel, number, buyer_name, buyer_doc, status,
        freight_cents, total_cents, sla_at, address
      ) values (
        ${orderId}, ${orgId}, ${account.id}, ${account.channel}, ${number},
        ${"Comprador do canal"}, ${"•••.000.000-••"}, 'awaiting_payment', 0,
        ${listing.price_cents}, ${new Date(Date.now() + 2 * 86_400_000).toISOString()},
        ${"Endereço ainda no canal"}
      )
    `;
    await sql`
      insert into order_items (id, order_id, product_id, listing_id, sku, title, qty, price_cents)
      values (${rid("itm")}, ${orderId}, ${listing.product_id}, ${listing.id}, ${listing.sku}, ${listing.title}, 1, ${listing.price_cents})
    `;
    await syncProductStock(sql, orgId, listing.product_id);
    await writeLog(sql, orgId, {
      channel: account.channel,
      accountId: account.id,
      action: "pullOrders",
      ok: true,
      detail: `Pedido ${number} entrou na inbox.`,
    });
    return { created: true as const, number };
  });
}

export function bulkOrders(userId: string, input: { ids: string[]; action: "pay" | "cancel" | "deliver" | "return" }) {
  return withOrg(userId, async (sql, orgId) => {
    const errors: string[] = [];
    for (const id of input.ids) {
      try {
        await applyOrderAction(sql, orgId, id, input.action);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Falha no pedido.");
      }
    }
    return { errors };
  });
}

async function applyOrderAction(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  orgId: string,
  orderId: string,
  action: "pay" | "cancel" | "deliver" | "return",
): Promise<void> {
  const orders = await sql<{ id: string; status: string; number: string }>`
    select id, status, number from orders where id = ${orderId} and org_id = ${orgId}
  `;
  const order = orders[0];
  if (!order) throw new Error("Pedido não encontrado.");
  const items = await sql<{ product_id: string | null; qty: number }>`
    select product_id, qty from order_items where order_id = ${orderId}
  `;
  if (action === "pay") {
    if (order.status !== "awaiting_payment") throw new Error(`${order.number} não está aguardando pagamento.`);
    await sql`update orders set status = 'paid' where id = ${orderId}`;
    await ensurePaidPaperwork(sql, orgId, orderId);
    return;
  }
  if (action === "cancel") {
    if (order.status !== "awaiting_payment" && order.status !== "paid") {
      throw new Error(`${order.number} já passou do ponto de cancelar por aqui.`);
    }
    for (const item of items) {
      if (item.product_id) await release(sql, orgId, item.product_id, num(item.qty));
    }
    await sql`update orders set status = 'cancelled' where id = ${orderId}`;
    await sql`delete from invoices where order_id = ${orderId} and status = 'queued'`;
    await sql`delete from shipments where order_id = ${orderId} and status = 'waiting_invoice'`;
    for (const item of items) {
      if (item.product_id) await syncProductStock(sql, orgId, item.product_id);
    }
    return;
  }
  if (action === "deliver") {
    if (order.status !== "shipped") throw new Error(`${order.number} ainda não foi despachado.`);
    await sql`update orders set status = 'delivered' where id = ${orderId}`;
    return;
  }
  if (order.status !== "shipped" && order.status !== "delivered") {
    throw new Error(`${order.number} não está em condição de devolução.`);
  }
  await sql`update orders set status = 'returned' where id = ${orderId}`;
  for (const item of items) {
    if (!item.product_id) continue;
    await sql`
      update products set stock_physical = stock_physical + ${num(item.qty)}
      where id = ${item.product_id} and org_id = ${orgId}
    `;
    await syncProductStock(sql, orgId, item.product_id);
  }
}

export function emitInvoices(userId: string, ids: string[]) {
  return withOrg(userId, async (sql, orgId) => {
    const issued: { orderId: string; number: string; accessKey: string }[] = [];
    const base = num(
      (
        await sql<{ c: number }>`
          select count(*) as c from invoices where org_id = ${orgId} and status = 'issued'
        `
      )[0]?.c,
    );
    let seq = base;
    for (const id of ids) {
      const orders = await sql<{ id: string; status: string; number: string }>`
        select id, status, number from orders where id = ${id} and org_id = ${orgId}
      `;
      const order = orders[0];
      if (!order) throw new Error("Pedido não encontrado.");
      if (order.status !== "paid") throw new Error(`${order.number} não está pago na fila.`);
      seq += 1;
      const number = String(seq).padStart(6, "0");
      const accessKey = chave(`${order.number}${number}`);
      const existing = await sql<{ id: string }>`select id from invoices where order_id = ${order.id}`;
      if (existing[0]) {
        await sql`
          update invoices set status = 'issued', number = ${number}, access_key = ${accessKey}, issued_at = now()
          where id = ${existing[0].id}
        `;
      } else {
        await sql`
          insert into invoices (id, org_id, order_id, status, number, access_key, issued_at)
          values (${rid("nf")}, ${orgId}, ${order.id}, 'issued', ${number}, ${accessKey}, now())
        `;
      }
      await sql`update orders set status = 'invoiced' where id = ${order.id}`;
      const shipment = await sql<{ id: string }>`select id from shipments where order_id = ${order.id}`;
      if (shipment[0]) {
        await sql`
          update shipments set label_ready = true, status = 'ready' where id = ${shipment[0].id}
        `;
      } else {
        await sql`
          insert into shipments (id, org_id, order_id, label_ready, status)
          values (${rid("shp")}, ${orgId}, ${order.id}, true, 'ready')
        `;
      }
      issued.push({ orderId: order.id, number, accessKey });
    }
    return { issued };
  });
}

export function expedition(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const rows = await sql<{
      id: string;
      number: string;
      channel: string;
      buyer_name: string;
      status: string;
      address: string;
      total_cents: number;
      label_ready: boolean | null;
      ship_status: string | null;
      carrier: string | null;
      tracking: string | null;
      invoice_number: string | null;
      access_key: string | null;
    }>`
      select o.id, o.number, o.channel, o.buyer_name, o.status, o.address, o.total_cents,
             s.label_ready, s.status as ship_status, s.carrier, s.tracking,
             i.number as invoice_number, i.access_key
      from orders o
      left join shipments s on s.order_id = o.id
      left join invoices i on i.order_id = o.id
      where o.org_id = ${orgId} and o.status in ('paid', 'invoiced', 'shipped')
      order by o.created_at desc
    `;
    const items = await sql<{ order_id: string; sku: string; title: string; qty: number }>`
      select oi.order_id, oi.sku, oi.title, oi.qty
      from order_items oi join orders o on o.id = oi.order_id
      where o.org_id = ${orgId}
    `;
    const mapped = rows.map((row) => ({
      id: row.id,
      number: row.number,
      channel: row.channel,
      buyer: row.buyer_name,
      status: row.status,
      address: row.address,
      totalCents: num(row.total_cents),
      labelReady: row.label_ready === true || String(row.label_ready) === "t",
      shipStatus: row.ship_status,
      carrier: row.carrier,
      tracking: row.tracking,
      invoiceNumber: row.invoice_number,
      accessKey: row.access_key,
      items: items
        .filter((item) => item.order_id === row.id)
        .map((item) => ({ sku: item.sku, title: item.title, qty: num(item.qty) })),
    }));
    return {
      waiting: mapped.filter((row) => row.status === "paid"),
      ready: mapped.filter((row) => row.status === "invoiced"),
      shipped: mapped.filter((row) => row.status === "shipped").slice(0, 12),
    };
  });
}

export function labels(userId: string, ids: string[]) {
  return withOrg(userId, async (sql, orgId) => {
    const pack = [];
    for (const id of ids) {
      const rows = await sql<{
        id: string;
        number: string;
        channel: string;
        buyer_name: string;
        address: string;
        label_ready: boolean | null;
        carrier: string | null;
        tracking: string | null;
        invoice_number: string | null;
        access_key: string | null;
      }>`
        select o.id, o.number, o.channel, o.buyer_name, o.address, s.label_ready, s.carrier, s.tracking,
               i.number as invoice_number, i.access_key
        from orders o
        left join shipments s on s.order_id = o.id
        left join invoices i on i.order_id = o.id
        where o.id = ${id} and o.org_id = ${orgId}
      `;
      const order = rows[0];
      if (!order) throw new Error("Pedido não encontrado.");
      const ready = order.label_ready === true || String(order.label_ready) === "t";
      if (!ready) throw new Error(`A nota do pedido ${order.number} ainda não liberou a etiqueta.`);
      const items = await sql<{ sku: string; title: string; qty: number }>`
        select sku, title, qty from order_items where order_id = ${order.id}
      `;
      pack.push({
        orderId: order.id,
        number: order.number,
        channel: order.channel,
        buyer: order.buyer_name,
        address: order.address,
        carrier: order.carrier,
        tracking: order.tracking,
        invoiceNumber: order.invoice_number,
        accessKey: order.access_key,
        items: items.map((item) => ({ sku: item.sku, title: item.title, qty: num(item.qty) })),
      });
    }
    return { labels: pack };
  });
}

export function shipOrders(userId: string, input: ShipInput) {
  return withOrg(userId, async (sql, orgId) => {
    const shipped: string[] = [];
    const errors: string[] = [];
    for (const id of input.ids) {
      const rows = await sql<{
        id: string;
        number: string;
        status: string;
        channel: string;
        account_id: string | null;
        account_status: string | null;
      }>`
        select o.id, o.number, o.status, o.channel, o.account_id, a.status as account_status
        from orders o left join channel_accounts a on a.id = o.account_id
        where o.id = ${id} and o.org_id = ${orgId}
      `;
      const order = rows[0];
      if (!order) {
        errors.push("Pedido não encontrado.");
        continue;
      }
      if (order.status !== "invoiced") {
        errors.push(`${order.number} ainda não está faturado.`);
        continue;
      }
      if (order.account_status && order.account_status !== "connected") {
        errors.push(`${order.number}: ${disconnected(order.account_status)}`);
        continue;
      }
      const code = trackingCode();
      if (order.account_status === "connected" && isChannelId(order.channel)) {
        const result = await getAdapter(order.channel).pushTracking({
          externalId: order.number,
          tracking: code,
          carrier: input.carrier,
        });
        await writeLog(sql, orgId, {
          channel: order.channel,
          accountId: order.account_id,
          action: "pushTracking",
          ok: result.ok,
          detail: result.ok ? `${order.number} · ${code}` : result.error,
        });
        if (!result.ok) {
          errors.push(`${order.number}: ${result.error}`);
          continue;
        }
      }
      await sql`
        update shipments set carrier = ${input.carrier}, tracking = ${code}, status = 'shipped', shipped_at = now()
        where order_id = ${order.id}
      `;
      await sql`update orders set status = 'shipped' where id = ${order.id}`;
      const items = await sql<{ product_id: string | null; qty: number }>`
        select product_id, qty from order_items where order_id = ${order.id}
      `;
      for (const item of items) {
        if (!item.product_id) continue;
        await sql`
          update products set
            stock_physical = greatest(stock_physical - ${num(item.qty)}, 0),
            stock_reserved = greatest(stock_reserved - ${num(item.qty)}, 0)
          where id = ${item.product_id} and org_id = ${orgId}
        `;
        await syncProductStock(sql, orgId, item.product_id);
      }
      shipped.push(order.number);
    }
    return { shipped, errors };
  });
}

export function aftersales(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const questions = await sql<{
      id: string;
      channel: string;
      buyer_name: string;
      body: string;
      answer: string | null;
      status: string;
      created_at: string;
      sku: string | null;
    }>`
      select q.id, q.channel, q.buyer_name, q.body, q.answer, q.status, q.created_at, p.sku
      from questions q left join products p on p.id = q.product_id
      where q.org_id = ${orgId}
      order by case when q.status = 'open' then 0 else 1 end, q.created_at desc
    `;
    const quick = await sql<{ id: string; title: string; body: string }>`
      select id, title, body from quick_replies where org_id = ${orgId} order by title
    `;
    const autos = await sql<{ id: string; keyword: string; body: string }>`
      select id, keyword, body from auto_replies where org_id = ${orgId} and active = true order by keyword
    `;
    return {
      questions: questions.map((row) => ({
        id: row.id,
        channel: row.channel,
        buyer: row.buyer_name,
        body: row.body,
        answer: row.answer,
        status: row.status,
        sku: row.sku,
        createdAt: iso(row.created_at) ?? "",
      })),
      quick,
      autos,
    };
  });
}

export function replyQuestion(userId: string, input: ReplyInput) {
  return withOrg(userId, async (sql, orgId) => {
    const rows = await sql<{ id: string; body: string; channel: string; account_id: string | null; status: string }>`
      select id, body, channel, account_id, status from questions where id = ${input.questionId} and org_id = ${orgId}
    `;
    const question = rows[0];
    if (!question) throw new Error("Pergunta não encontrada.");
    if (question.status !== "open") throw new Error("Essa pergunta já foi respondida.");
    let body = input.body.trim();
    if (input.mode === "auto") {
      const rules = await sql<{ keyword: string; body: string }>`
        select keyword, body from auto_replies where org_id = ${orgId} and active = true
      `;
      const hit = rules.find((rule) => question.body.toLowerCase().includes(rule.keyword.toLowerCase()));
      if (!hit) throw new Error("Nenhuma regra casa com essa pergunta.");
      body = hit.body;
    }
    if (!body) throw new Error("Escreva a resposta.");
    if (question.account_id && isChannelId(question.channel)) {
      const account = await sql<{ status: string }>`
        select status from channel_accounts where id = ${question.account_id}
      `;
      if (account[0]?.status !== "connected") throw new Error(disconnected(account[0]?.status ?? "error"));
      const result = await getAdapter(question.channel).answerQuestion({ externalId: question.id, body });
      await writeLog(sql, orgId, {
        channel: question.channel,
        accountId: question.account_id,
        action: "answerQuestion",
        ok: result.ok,
        detail: result.ok ? "Resposta entregue." : result.error,
      });
      if (!result.ok) throw new Error(result.error);
    }
    await sql`update questions set answer = ${body}, status = 'answered' where id = ${question.id}`;
    return { ok: true as const };
  });
}

export function saveQuick(userId: string, input: { title: string; body: string }) {
  return withOrg(userId, async (sql, orgId) => {
    await sql`
      insert into quick_replies (id, org_id, title, body) values (${rid("qr")}, ${orgId}, ${input.title}, ${input.body})
    `;
    return { ok: true as const };
  });
}

export function saveAuto(userId: string, input: { keyword: string; body: string }) {
  return withOrg(userId, async (sql, orgId) => {
    await sql`
      insert into auto_replies (id, org_id, keyword, body, active)
      values (${rid("ar")}, ${orgId}, ${input.keyword.toLowerCase()}, ${input.body}, true)
    `;
    return { ok: true as const };
  });
}

export function removeTemplate(userId: string, input: { id: string; kind: "quick" | "auto" }) {
  return withOrg(userId, async (sql, orgId) => {
    if (input.kind === "quick") {
      await sql`delete from quick_replies where id = ${input.id} and org_id = ${orgId}`;
    } else {
      await sql`delete from auto_replies where id = ${input.id} and org_id = ${orgId}`;
    }
    return { ok: true as const };
  });
}

export function invoices(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const rows = await sql<{
      id: string;
      number: string;
      channel: string;
      buyer_name: string;
      total_cents: number;
      status: string;
      invoice_status: string | null;
      invoice_number: string | null;
      access_key: string | null;
      issued_at: string | null;
    }>`
      select o.id, o.number, o.channel, o.buyer_name, o.total_cents, o.status,
             i.status as invoice_status, i.number as invoice_number, i.access_key, i.issued_at
      from orders o
      left join invoices i on i.order_id = o.id
      where o.org_id = ${orgId} and (o.status = 'paid' or i.id is not null)
      order by o.created_at desc
    `;
    return {
      notes: rows.map((row) => ({
        orderId: row.id,
        orderNumber: row.number,
        channel: row.channel,
        buyer: row.buyer_name,
        totalCents: num(row.total_cents),
        orderStatus: row.status,
        invoiceStatus: row.invoice_status,
        number: row.invoice_number,
        accessKey: row.access_key,
        issuedAt: iso(row.issued_at),
      })),
    };
  });
}

export function connectors(userId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const accounts = await sql<{
      id: string;
      channel: string;
      name: string;
      status: string;
      external_user: string | null;
      last_sync_at: string | null;
      last_error: string | null;
    }>`
      select id, channel, name, status, external_user, last_sync_at, last_error
      from channel_accounts where org_id = ${orgId} order by channel, name
    `;
    const logs = await sql<{ id: string; channel: string | null; action: string; ok: boolean; detail: string; created_at: string }>`
      select id, channel, action, ok, detail, created_at from sync_logs
      where org_id = ${orgId} order by created_at desc limit 12
    `;
    return {
      accounts: accounts.map((row) => ({
        id: row.id,
        channel: row.channel,
        name: row.name,
        status: row.status,
        externalUser: row.external_user,
        lastSyncAt: iso(row.last_sync_at),
        lastError: row.last_error,
      })),
      logs: logs.map((row) => ({
        id: row.id,
        channel: row.channel,
        action: row.action,
        ok: row.ok === true || String(row.ok) === "t" || String(row.ok) === "true",
        detail: row.detail,
        createdAt: iso(row.created_at) ?? "",
      })),
    };
  });
}

export function connectAccount(userId: string, input: ConnectInput) {
  return withOrg(userId, async (sql, orgId) => {
    const existing = await sql<{ id: string }>`
      select id from channel_accounts
      where org_id = ${orgId} and channel = ${input.channel} and name = ${input.name}
    `;
    if (existing[0]) {
      await sql`
        update channel_accounts
        set status = 'connected', last_error = null, last_sync_at = now()
        where id = ${existing[0].id}
      `;
      return { id: existing[0].id };
    }
    const id = rid("acc");
    await sql`
      insert into channel_accounts (id, org_id, channel, name, status, external_user, last_sync_at)
      values (${id}, ${orgId}, ${input.channel}, ${input.name}, 'connected', ${"conta-principal"}, now())
    `;
    await writeLog(sql, orgId, {
      channel: input.channel,
      accountId: id,
      action: "connect",
      ok: true,
      detail: `${input.name} conectada em modo mock.`,
    });
    return { id };
  });
}

export function probeAccount(userId: string, accountId: string) {
  return withOrg(userId, async (sql, orgId) => {
    const accounts = await sql<{ id: string; channel: string; status: string }>`
      select id, channel, status from channel_accounts where id = ${accountId} and org_id = ${orgId}
    `;
    const account = accounts[0];
    if (!account) throw new Error("Conta não encontrada.");
    const probe = await probeChannel();
    if (!probe.ok) {
      await sql`
        update channel_accounts set status = 'error', last_error = ${probe.error}, last_sync_at = now()
        where id = ${account.id}
      `;
      await writeLog(sql, orgId, {
        channel: account.channel,
        accountId: account.id,
        action: "probe",
        ok: false,
        detail: probe.error,
      });
      throw new Error(probe.error);
    }
    await sql`
      update channel_accounts set status = 'connected', last_error = null, last_sync_at = now()
      where id = ${account.id}
    `;
    await writeLog(sql, orgId, {
      channel: account.channel,
      accountId: account.id,
      action: "probe",
      ok: true,
      detail: "Conector respondeu.",
    });
    return { ok: true as const };
  });
}
