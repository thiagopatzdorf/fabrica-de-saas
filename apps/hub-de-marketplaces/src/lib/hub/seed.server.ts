import type { Sql } from "@/lib/db";
import {
  CATEGORY_KEYS,
  CATEGORY_NAMES,
  type CategoryKey,
  type ChannelId,
  remoteFor,
} from "./channels";

type Kind = "simple" | "parent" | "variation" | "kit";

type SeedProduct = {
  n: number;
  sku: string;
  kind: Kind;
  parent?: number;
  title: string;
  cat: CategoryKey;
  ncm: string;
  g: number;
  h: number;
  w: number;
  l: number;
  cost: number;
  price: number;
  stock: number;
  safety: number;
  components?: { sku: string; qty: number }[];
};

const PRODUCTS: SeedProduct[] = [
  { n: 1, sku: "MOC-ESC-18", kind: "simple", title: "Mochila escolar 18L grafite", cat: "mochilas", ncm: "42029200", g: 620, h: 42, w: 30, l: 16, cost: 7900, price: 16990, stock: 28, safety: 6 },
  { n: 2, sku: "MOC-TEC-15", kind: "simple", title: "Mochila técnica 15L", cat: "mochilas", ncm: "42029200", g: 780, h: 46, w: 31, l: 18, cost: 9800, price: 21990, stock: 16, safety: 4 },
  { n: 3, sku: "MOC-INF-12", kind: "simple", title: "Mochila infantil 12L", cat: "mochilas", ncm: "42029200", g: 480, h: 34, w: 24, l: 14, cost: 5400, price: 12990, stock: 22, safety: 5 },
  { n: 4, sku: "MOC-ROLL", kind: "simple", title: "Mochila com rodinha", cat: "mochilas", ncm: "42029200", g: 1100, h: 50, w: 32, l: 22, cost: 12400, price: 27990, stock: 9, safety: 3 },
  { n: 5, sku: "EST-DUP", kind: "simple", title: "Estojo duplo de lona", cat: "estojos", ncm: "42029200", g: 210, h: 8, w: 22, l: 8, cost: 1800, price: 4990, stock: 40, safety: 8 },
  { n: 6, sku: "EST-TRI", kind: "simple", title: "Estojo triplo", cat: "estojos", ncm: "42029200", g: 260, h: 8, w: 22, l: 10, cost: 2400, price: 6490, stock: 18, safety: 4 },
  { n: 7, sku: "CAD-UNI", kind: "simple", title: "Caderno universitário 96 folhas", cat: "cadernos", ncm: "48202000", g: 320, h: 28, w: 21, l: 2, cost: 900, price: 2490, stock: 60, safety: 12 },
  { n: 8, sku: "CAD-BRO", kind: "simple", title: "Caderno brochura 96 folhas", cat: "cadernos", ncm: "48202000", g: 280, h: 28, w: 20, l: 1, cost: 700, price: 1990, stock: 48, safety: 10 },
  { n: 9, sku: "LAP-GRA", kind: "simple", title: "Lápis grafite caixa 12", cat: "acessorios", ncm: "96091000", g: 180, h: 1, w: 8, l: 18, cost: 1100, price: 2990, stock: 30, safety: 8 },
  { n: 10, sku: "CAN-AZL", kind: "simple", title: "Caneta esferográfica azul caixa 12", cat: "acessorios", ncm: "96081000", g: 140, h: 1, w: 6, l: 14, cost: 980, price: 2790, stock: 36, safety: 10 },
  { n: 11, sku: "BOR-BRA", kind: "simple", title: "Borracha branca", cat: "acessorios", ncm: "40169200", g: 40, h: 1, w: 4, l: 6, cost: 280, price: 890, stock: 50, safety: 10 },
  { n: 12, sku: "REG-30", kind: "simple", title: "Régua 30 cm", cat: "acessorios", ncm: "90178090", g: 30, h: 1, w: 4, l: 31, cost: 220, price: 790, stock: 40, safety: 8 },
  { n: 13, sku: "TES-ESC", kind: "simple", title: "Tesoura escolar", cat: "acessorios", ncm: "82130000", g: 45, h: 1, w: 8, l: 13, cost: 450, price: 1490, stock: 24, safety: 6 },
  { n: 14, sku: "COL-BAS", kind: "simple", title: "Cola bastão", cat: "acessorios", ncm: "35061090", g: 50, h: 10, w: 3, l: 3, cost: 320, price: 990, stock: 44, safety: 8 },
  { n: 15, sku: "MOC-RUN", kind: "parent", title: "Mochila runner 25L", cat: "mochilas", ncm: "42029200", g: 900, h: 48, w: 32, l: 18, cost: 11200, price: 24990, stock: 0, safety: 0 },
  { n: 16, sku: "MOC-RUN-PTA", kind: "variation", parent: 15, title: "Mochila runner 25L preta", cat: "mochilas", ncm: "42029200", g: 900, h: 48, w: 32, l: 18, cost: 11200, price: 24990, stock: 14, safety: 4 },
  { n: 17, sku: "MOC-RUN-VER", kind: "variation", parent: 15, title: "Mochila runner 25L verde", cat: "mochilas", ncm: "42029200", g: 900, h: 48, w: 32, l: 18, cost: 11200, price: 24990, stock: 11, safety: 3 },
  { n: 18, sku: "MOC-RUN-MAR", kind: "variation", parent: 15, title: "Mochila runner 25L marinho", cat: "mochilas", ncm: "42029200", g: 900, h: 48, w: 32, l: 18, cost: 11200, price: 24990, stock: 8, safety: 3 },
  { n: 19, sku: "KIT-1ANO", kind: "kit", title: "Kit escolar 1º ano", cat: "kits", ncm: "96089900", g: 980, h: 32, w: 24, l: 12, cost: 4200, price: 9990, stock: 15, safety: 4, components: [{ sku: "CAD-UNI", qty: 2 }, { sku: "EST-DUP", qty: 1 }, { sku: "LAP-GRA", qty: 1 }, { sku: "BOR-BRA", qty: 1 }, { sku: "COL-BAS", qty: 1 }, { sku: "REG-30", qty: 1 }] },
  { n: 20, sku: "KIT-2ANO", kind: "kit", title: "Kit escolar 2º ano", cat: "kits", ncm: "96089900", g: 1020, h: 32, w: 24, l: 12, cost: 4600, price: 10990, stock: 12, safety: 3, components: [{ sku: "CAD-UNI", qty: 3 }, { sku: "EST-DUP", qty: 1 }, { sku: "LAP-GRA", qty: 1 }, { sku: "CAN-AZL", qty: 1 }] },
  { n: 21, sku: "KIT-5ANO", kind: "kit", title: "Kit escolar 5º ano", cat: "kits", ncm: "96089900", g: 1100, h: 34, w: 26, l: 14, cost: 5100, price: 12990, stock: 10, safety: 3, components: [{ sku: "CAD-BRO", qty: 4 }, { sku: "EST-TRI", qty: 1 }, { sku: "CAN-AZL", qty: 1 }, { sku: "TES-ESC", qty: 1 }] },
  { n: 22, sku: "KIT-MED", kind: "kit", title: "Kit ensino médio", cat: "kits", ncm: "96089900", g: 1400, h: 40, w: 28, l: 16, cost: 6400, price: 15990, stock: 8, safety: 2, components: [{ sku: "MOC-ESC-18", qty: 1 }, { sku: "CAD-UNI", qty: 5 }, { sku: "EST-TRI", qty: 1 }] },
  { n: 23, sku: "KIT-ART", kind: "kit", title: "Kit arte", cat: "kits", ncm: "96089900", g: 640, h: 30, w: 22, l: 8, cost: 2800, price: 7990, stock: 14, safety: 3, components: [{ sku: "CAD-UNI", qty: 1 }, { sku: "CAN-AZL", qty: 1 }, { sku: "TES-ESC", qty: 1 }, { sku: "COL-BAS", qty: 2 }] },
  { n: 24, sku: "KIT-PROF", kind: "kit", title: "Kit professor", cat: "kits", ncm: "96089900", g: 1600, h: 42, w: 30, l: 18, cost: 8900, price: 19990, stock: 6, safety: 2, components: [{ sku: "MOC-INF-12", qty: 1 }, { sku: "EST-TRI", qty: 1 }, { sku: "CAD-UNI", qty: 2 }] },
];

const ORDER_STATUSES = [
  "paid", "paid", "paid", "invoiced", "awaiting_payment",
  "paid", "invoiced", "shipped", "delivered", "awaiting_payment",
  "shipped", "shipped", "delivered", "delivered", "paid",
  "invoiced", "invoiced", "shipped", "delivered", "returned",
  "shipped", "delivered", "paid", "awaiting_payment", "invoiced",
  "shipped", "delivered", "cancelled", "shipped", "delivered",
  "paid", "invoiced", "shipped", "delivered", "returned",
  "awaiting_payment", "shipped", "delivered", "cancelled", "paid",
] as const;

const ORDER_DAYS = [
  0, 0, 0, 0, 0, 1, 1, 1, 2, 3,
  4, 5, 6, 8, 10, 12, 14, 18, 21, 25,
  28, 3, 4, 0, 1, 2, 6, 9, 11, 15,
  16, 19, 22, 26, 2, 5, 7, 13, 17, 20,
];

const BUYERS: [string, string][] = [
  ["Helena Voss", "Rua das Hortênsias, 120 — Caxias do Sul, RS"],
  ["Miguel Arendt", "Rua João Kochenborger, 88 — Nova Petrópolis, RS"],
  ["Lia Kempf", "Rua Coberta, 14 — Gramado, RS"],
  ["Theo Bianchi", "Rua Padre Chagas, 310 — Porto Alegre, RS"],
  ["Ana Duarte", "Rua Sinimbu, 540 — Caxias do Sul, RS"],
  ["Caio Lemes", "Rua Marechal Deodoro, 77 — Bento Gonçalves, RS"],
  ["Nina Prado", "Alameda Dr. Carlos de Carvalho, 200 — Curitiba, PR"],
  ["Rafael Mota", "Rua Bocaiúva, 1500 — Florianópolis, SC"],
  ["Eva Kunz", "Rua XV de Novembro, 640 — Blumenau, SC"],
  ["Otto Ferreira", "Rua Harmonia, 412 — São Paulo, SP"],
  ["Maya Ribeiro", "Rua Barão de Jaguara, 90 — Campinas, SP"],
  ["Davi Nunes", "Rua Visconde de Taunay, 33 — Joinville, SC"],
  ["Clara Schmidt", "Rua General Osório, 701 — Novo Hamburgo, RS"],
  ["Igor Paim", "Rua Sete de Setembro, 250 — Pelotas, RS"],
  ["Luna Alves", "SQN 205, bloco C — Brasília, DF"],
];

const RULES: Record<ChannelId, { freight: number; commission: number; tax: number; margin: number; floor: number }> = {
  ml: { freight: 0, commission: 1600, tax: 800, margin: 1800, floor: 1990 },
  shopee: { freight: 790, commission: 1400, tax: 800, margin: 1600, floor: 1990 },
  amazon: { freight: 1890, commission: 1500, tax: 800, margin: 1500, floor: 2990 },
  magalu: { freight: 990, commission: 1650, tax: 800, margin: 1400, floor: 1990 },
  store: { freight: 0, commission: 350, tax: 800, margin: 3500, floor: 1990 },
};

const ATTR_VALUES: Record<string, string> = {
  Marca: "Norte",
  Cor: "Variada",
  Material: "Poliéster",
  Formato: "Universitário",
  Gramatura: "90 g",
  Páginas: "96",
  "Ano escolar": "Fundamental",
};

function pid(orgId: string, n: number): string {
  return `${orgId}_p${String(n).padStart(2, "0")}`;
}

async function put(sql: Sql, text: string, params: unknown[]): Promise<void> {
  await sql.query(text, params);
}

export async function seedOrganization(sql: Sql, orgId: string): Promise<void> {
  const catId = (key: CategoryKey) => `${orgId}_cat_${key}`;

  for (const key of CATEGORY_KEYS) {
    await put(
      sql,
      `insert into categories (id, org_id, name, key) values ($1, $2, $3, $4) on conflict (id) do nothing`,
      [catId(key), orgId, CATEGORY_NAMES[key], key],
    );
  }

  const accounts: { id: string; channel: ChannelId; status: string; error: string | null }[] = [
    { id: `${orgId}_acc_ml`, channel: "ml", status: "connected", error: null },
    { id: `${orgId}_acc_shopee`, channel: "shopee", status: "connected", error: null },
    { id: `${orgId}_acc_magalu`, channel: "magalu", status: "token_expired", error: "O token venceu. Reconecte para publicar." },
  ];
  for (const account of accounts) {
    await put(
      sql,
      `insert into channel_accounts (id, org_id, channel, name, status, external_user, last_sync_at, last_error)
       values ($1, $2, $3, $4, $5, $6, case when $5 = 'connected' then now() else null end, $7)
       on conflict (id) do nothing`,
      [account.id, orgId, account.channel, "Oficina Norte", account.status, "oficina-norte", account.error],
    );
  }

  for (const channel of Object.keys(RULES) as ChannelId[]) {
    const rule = RULES[channel];
    await put(
      sql,
      `insert into price_rules (
         id, org_id, channel, freight_cents, commission_bps, tax_bps, margin_bps, markup_bps, floor_cents, round_90, promo_pct
       ) values ($1, $2, $3, $4, $5, $6, $7, 0, $8, true, 0)
       on conflict (id) do nothing`,
      [`${orgId}_rule_${channel}`, orgId, channel, rule.freight, rule.commission, rule.tax, rule.margin, rule.floor],
    );
  }

  for (const product of PRODUCTS) {
    const id = pid(orgId, product.n);
    const parent = product.parent ? pid(orgId, product.parent) : null;
    await put(
      sql,
      `insert into products (
         id, org_id, parent_id, kind, sku, ean, title, description, brand, ncm,
         weight_g, height_cm, width_cm, length_cm, cost_cents, price_cents,
         stock_physical, stock_safety, stock_reserved, category_id
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, 'Norte', $9,
         $10, $11, $12, $13, $14, $15, $16, $17, 0, $18
       ) on conflict (id) do nothing`,
      [
        id,
        orgId,
        parent,
        product.kind,
        product.sku,
        `789${String(product.n).padStart(10, "0")}`,
        product.title,
        `${product.title}. Peça do catálogo mestre da Oficina Norte.`,
        product.ncm,
        product.g,
        product.h,
        product.w,
        product.l,
        product.cost,
        product.price,
        product.stock,
        product.safety,
        catId(product.cat),
      ],
    );
    await put(
      sql,
      `insert into product_photos (id, product_id, sort, label, tone, url)
       values ($1, $2, 0, $3, 'ink', '') on conflict (id) do nothing`,
      [`${id}_photo`, id, product.sku.slice(0, 3)],
    );
  }

  for (const product of PRODUCTS) {
    if (!product.components) continue;
    const kit = pid(orgId, product.n);
    for (const component of product.components) {
      const found = PRODUCTS.find((item) => item.sku === component.sku);
      if (!found) continue;
      await put(
        sql,
        `insert into kit_items (id, kit_id, component_id, qty) values ($1, $2, $3, $4) on conflict (id) do nothing`,
        [`${kit}_${component.sku}`, kit, pid(orgId, found.n), component.qty],
      );
    }
  }

  await put(
    sql,
    `insert into sku_aliases (id, product_id, channel, alias) values ($1, $2, 'ml', 'MLB-MOC-ESC-18') on conflict (id) do nothing`,
    [`${orgId}_alias_esc_ml`, pid(orgId, 1)],
  );
  await put(
    sql,
    `insert into sku_aliases (id, product_id, channel, alias) values ($1, $2, 'shopee', 'SPE-MOC-ESC-18') on conflict (id) do nothing`,
    [`${orgId}_alias_esc_shopee`, pid(orgId, 1)],
  );

  for (const key of CATEGORY_KEYS) {
    if (key === "kits") continue;
    for (const channel of ["ml", "shopee", "amazon", "magalu", "store"] as ChannelId[]) {
      const remote = remoteFor(channel, key);
      const mapId = `${orgId}_map_${key}_${channel}`;
      await put(
        sql,
        `insert into category_maps (id, org_id, category_id, channel, channel_category_id, channel_category_name)
         values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
        [mapId, orgId, catId(key), channel, remote.id, remote.name],
      );
      for (const attribute of remote.attributes) {
        await put(
          sql,
          `insert into channel_attributes (id, org_id, category_map_id, name, required, value)
           values ($1, $2, $3, $4, true, $5) on conflict (id) do nothing`,
          [`${mapId}_${attribute}`, orgId, mapId, attribute, ATTR_VALUES[attribute] ?? "Norte"],
        );
      }
    }
  }

  const sellable = PRODUCTS.filter((product) => product.kind === "simple" || product.kind === "variation");
  const listingPlan: { channel: ChannelId; account: string; from: number; to: number; status: string; error: string | null }[] = [
    { channel: "ml", account: `${orgId}_acc_ml`, from: 0, to: 12, status: "published", error: null },
    { channel: "shopee", account: `${orgId}_acc_shopee`, from: 2, to: 10, status: "published", error: null },
    { channel: "magalu", account: `${orgId}_acc_magalu`, from: 0, to: 4, status: "error", error: "Token expirado." },
  ];
  for (const plan of listingPlan) {
    const slice = sellable.slice(plan.from, plan.to);
    for (let index = 0; index < slice.length; index += 1) {
      const product = slice[index];
      const id = `${orgId}_lst_${plan.channel}_${product.n}`;
      const kind = product.kind === "variation" ? "variation" : "simple";
      await put(
        sql,
        `insert into listings (
           id, org_id, product_id, account_id, channel, kind, title, price_cents, status, external_id, last_error, stock_synced
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (id) do nothing`,
        [
          id,
          orgId,
          pid(orgId, product.n),
          plan.account,
          plan.channel,
          kind,
          product.title,
          product.price + index * 300,
          plan.status,
          `${plan.channel.toUpperCase()}-${product.sku}`,
          plan.error,
          product.stock,
        ],
      );
    }
  }

  const pool = PRODUCTS.filter((product) => product.kind !== "parent");
  const channels: ChannelId[] = ["ml", "shopee", "ml", "shopee", "magalu"];
  const accountByChannel: Record<string, string> = {
    ml: `${orgId}_acc_ml`,
    shopee: `${orgId}_acc_shopee`,
    magalu: `${orgId}_acc_magalu`,
  };
  const carriers = ["Correios", "Jadlog", "Loggi", "Total Express"];

  for (let i = 0; i < 40; i += 1) {
    const product = pool[i % pool.length];
    const status = ORDER_STATUSES[i];
    const channel = channels[i % channels.length];
    const qty = i % 5 === 0 ? 2 : 1;
    const freight = i % 2 === 0 ? 1490 : 0;
    const total = product.price * qty + freight;
    const created = new Date(Date.now() - ORDER_DAYS[i] * 86_400_000 - i * 60_000);
    const sla = new Date(created.getTime() + (i === 4 ? -86_400_000 : 2 * 86_400_000));
    const buyer = BUYERS[i % BUYERS.length];
    const orderId = `${orgId}_ord_${String(i + 1).padStart(2, "0")}`;
    const number = `PED-${1040 + i}`;
    await put(
      sql,
      `insert into orders (
         id, org_id, account_id, channel, number, buyer_name, buyer_doc, status,
         freight_cents, total_cents, sla_at, address, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (id) do nothing`,
      [
        orderId,
        orgId,
        accountByChannel[channel],
        channel,
        number,
        buyer[0],
        "•••.000.000-••",
        status,
        freight,
        total,
        sla.toISOString(),
        buyer[1],
        created.toISOString(),
      ],
    );
    await put(
      sql,
      `insert into order_items (id, order_id, product_id, listing_id, sku, title, qty, price_cents)
       values ($1, $2, $3, null, $4, $5, $6, $7) on conflict (id) do nothing`,
      [`${orderId}_item`, orderId, pid(orgId, product.n), product.sku, product.title, qty, product.price],
    );

    const issued = status === "invoiced" || status === "shipped" || status === "delivered" || status === "returned";
    const queued = status === "paid";
    if (issued || queued) {
      const key = `43${String(i).padStart(42, "0")}`.slice(0, 44);
      await put(
        sql,
        `insert into invoices (id, org_id, order_id, status, number, access_key, issued_at)
         values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing`,
        [
          `${orderId}_nf`,
          orgId,
          orderId,
          issued ? "issued" : "queued",
          issued ? String(1200 + i).padStart(6, "0") : null,
          issued ? key.slice(0, 44) : null,
          issued ? created.toISOString() : null,
        ],
      );
    }
    if (status !== "cancelled" && status !== "awaiting_payment") {
      const shipped = status === "shipped" || status === "delivered" || status === "returned";
      await put(
        sql,
        `insert into shipments (id, org_id, order_id, carrier, tracking, label_ready, status, shipped_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing`,
        [
          `${orderId}_shp`,
          orgId,
          orderId,
          shipped ? carriers[i % carriers.length] : null,
          shipped ? `BR${1_000_000_000 + i}` : null,
          status !== "paid",
          shipped ? "shipped" : status === "paid" ? "waiting_invoice" : "ready",
          shipped ? new Date(created.getTime() + 86_400_000).toISOString() : null,
        ],
      );
    }
  }

  await sql.query(
    `update products p set stock_reserved = coalesce((
       select sum(oi.qty) from order_items oi
       join orders o on o.id = oi.order_id
       where oi.product_id = p.id and o.org_id = $1
         and o.status in ('awaiting_payment', 'paid', 'invoiced')
     ), 0)
     where p.org_id = $1`,
    [orgId],
  );

  for (const sku of ["MOC-ESC-18", "EST-DUP", "LAP-GRA"]) {
    await sql.query(
      `update products set stock_physical = stock_reserved + stock_safety where org_id = $1 and sku = $2`,
      [orgId, sku],
    );
  }
  await sql.query(
    `update products set stock_physical = stock_reserved where org_id = $1 and sku = 'CAN-AZL'`,
    [orgId],
  );

  await sql.query(
    `update listings l set stock_synced = greatest(p.stock_physical - p.stock_reserved, 0)
     from products p where p.id = l.product_id and l.org_id = $1`,
    [orgId],
  );
  await sql.query(
    `update listings l set status = 'paused', last_error = 'Estoque na segurança'
     from products p
     where p.id = l.product_id and l.org_id = $1 and l.status = 'published'
       and p.stock_physical - p.stock_reserved <= p.stock_safety`,
    [orgId],
  );
  await sql.query(
    `update listings set status = 'error', last_error = 'Token expirado.' where org_id = $1 and channel = 'magalu'`,
    [orgId],
  );
  await sql.query(
    `update listings set status = 'paused', last_error = null
     where org_id = $1 and channel = 'shopee' and product_id = $2`,
    [orgId, pid(orgId, 2)],
  );

  const questions: [string, string, string, string, string | null][] = [
    ["Helena Voss", "Qual o prazo de envio para o interior?", "open", "ml", null],
    ["Lia Kempf", "Tem a runner na cor verde em estoque?", "open", "shopee", null],
    ["Otto Ferreira", "O frete da mochila técnica está incluso?", "open", "ml", null],
    ["Maya Ribeiro", "O kit do 5º ano serve para escola particular?", "open", "magalu", null],
    ["Clara Schmidt", "A nota sai no mesmo dia do pagamento?", "answered", "ml", "A nota entra na fila assim que o pedido fica pago."],
    ["Davi Nunes", "Posso retirar em Caxias?", "answered", "shopee", "Por enquanto só despachamos. A retirada não está aberta."],
    ["Eva Kunz", "Qual o prazo se eu pagar hoje?", "open", "ml", null],
    ["Igor Paim", "A tesoura vai no kit arte?", "open", "shopee", null],
  ];
  for (let i = 0; i < questions.length; i += 1) {
    const [buyer, body, status, channel, answer] = questions[i];
    await put(
      sql,
      `insert into questions (id, org_id, account_id, channel, product_id, buyer_name, body, answer, status, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (id) do nothing`,
      [
        `${orgId}_q_${i + 1}`,
        orgId,
        accountByChannel[channel] ?? `${orgId}_acc_ml`,
        channel,
        pid(orgId, (i % 14) + 1),
        buyer,
        body,
        answer,
        status,
        new Date(Date.now() - i * 3_600_000).toISOString(),
      ],
    );
  }

  const quick = [
    ["Prazo de envio", "Despachamos em até 1 dia útil depois da nota."],
    ["Troca", "A troca volta pelo mesmo canal. Guarde a embalagem até a coleta."],
    ["Nota fiscal", "A nota é emitida quando o pagamento confirma. A chave fica no pedido."],
  ];
  for (let i = 0; i < quick.length; i += 1) {
    await put(
      sql,
      `insert into quick_replies (id, org_id, title, body) values ($1, $2, $3, $4) on conflict (id) do nothing`,
      [`${orgId}_qr_${i + 1}`, orgId, quick[i][0], quick[i][1]],
    );
  }
  await put(
    sql,
    `insert into auto_replies (id, org_id, keyword, body, active) values ($1, $2, 'prazo', $3, true) on conflict (id) do nothing`,
    [`${orgId}_ar_prazo`, orgId, "Despachamos em até 1 dia útil após a nota. A engenharia acompanha daqui."],
  );
  await put(
    sql,
    `insert into auto_replies (id, org_id, keyword, body, active) values ($1, $2, 'frete', $3, true) on conflict (id) do nothing`,
    [`${orgId}_ar_frete`, orgId, "O frete desta conta está no anúncio. Se veio zerado, a campanha cobre."],
  );

  const logs: [string, boolean, string][] = [
    ["updateStock", true, "Estoque da mochila escolar sincronizado."],
    ["updatePrice", true, "Preço da Shopee confirmado."],
    ["publish", true, "Anúncio publicado no Mercado Livre."],
    ["pullOrders", true, "Inbox puxada sem novidade além do que já está na mesa."],
    ["updateStock", false, "Magalu recusou. Token expirado."],
    ["pushTracking", true, "Rastreio aceito pelos Correios."],
    ["answerQuestion", true, "Resposta entregue no Mercado Livre."],
    ["publish", false, "Falha ocasional ao publicar. O canal não confirmou."],
  ];
  for (let i = 0; i < logs.length; i += 1) {
    await put(
      sql,
      `insert into sync_logs (id, org_id, channel, account_id, action, ok, detail, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing`,
      [
        `${orgId}_log_${i + 1}`,
        orgId,
        i % 2 === 0 ? "ml" : "shopee",
        i % 2 === 0 ? `${orgId}_acc_ml` : `${orgId}_acc_shopee`,
        logs[i][0],
        logs[i][1],
        logs[i][2],
        new Date(Date.now() - i * 7_200_000).toISOString(),
      ],
    );
  }

  await put(
    sql,
    `insert into stock_adjustments (id, org_id, product_id, delta, reason, status)
     values ($1, $2, $3, -2, 'Contagem de prateleira', 'queued') on conflict (id) do nothing`,
    [`${orgId}_adj_1`, orgId, pid(orgId, 4)],
  );
  await put(
    sql,
    `insert into stock_adjustments (id, org_id, product_id, delta, reason, status)
     values ($1, $2, $3, 6, 'Recebimento do fornecedor', 'queued') on conflict (id) do nothing`,
    [`${orgId}_adj_2`, orgId, pid(orgId, 7)],
  );
}
