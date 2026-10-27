create table if not exists organizations (
  id text primary key,
  user_id text not null unique,
  name text not null,
  trade_name text not null,
  document text not null,
  seeded boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists channel_accounts (
  id text primary key,
  org_id text not null references organizations (id),
  channel text not null,
  name text not null,
  status text not null,
  external_user text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists channel_accounts_org_idx on channel_accounts (org_id);

create table if not exists categories (
  id text primary key,
  org_id text not null references organizations (id),
  name text not null,
  key text not null
);
create index if not exists categories_org_idx on categories (org_id);

create table if not exists category_maps (
  id text primary key,
  org_id text not null references organizations (id),
  category_id text not null,
  channel text not null,
  channel_category_id text not null,
  channel_category_name text not null,
  unique (category_id, channel)
);

create table if not exists channel_attributes (
  id text primary key,
  org_id text not null references organizations (id),
  category_map_id text not null,
  name text not null,
  required boolean not null default true,
  value text not null default ''
);

create table if not exists products (
  id text primary key,
  org_id text not null references organizations (id),
  parent_id text,
  kind text not null,
  sku text not null,
  ean text not null default '',
  title text not null,
  description text not null default '',
  brand text not null default '',
  ncm text not null default '',
  weight_g integer not null default 0,
  height_cm integer not null default 0,
  width_cm integer not null default 0,
  length_cm integer not null default 0,
  cost_cents integer not null default 0,
  price_cents integer not null default 0,
  stock_physical integer not null default 0,
  stock_safety integer not null default 0,
  stock_reserved integer not null default 0,
  category_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, sku)
);
create index if not exists products_org_idx on products (org_id);

create table if not exists product_photos (
  id text primary key,
  product_id text not null,
  sort integer not null default 0,
  label text not null,
  tone text not null default 'ink',
  url text not null default ''
);

create table if not exists kit_items (
  id text primary key,
  kit_id text not null,
  component_id text not null,
  qty integer not null
);

create table if not exists sku_aliases (
  id text primary key,
  product_id text not null,
  channel text not null,
  alias text not null,
  unique (product_id, channel)
);

create table if not exists price_rules (
  id text primary key,
  org_id text not null references organizations (id),
  channel text not null,
  freight_cents integer not null default 0,
  commission_bps integer not null default 0,
  tax_bps integer not null default 0,
  margin_bps integer not null default 0,
  markup_bps integer not null default 0,
  floor_cents integer not null default 0,
  round_90 boolean not null default true,
  promo_pct integer not null default 0,
  promo_start date,
  promo_end date,
  unique (org_id, channel)
);

create table if not exists listings (
  id text primary key,
  org_id text not null references organizations (id),
  product_id text not null,
  account_id text not null,
  channel text not null,
  kind text not null,
  title text not null,
  price_cents integer not null,
  status text not null,
  external_id text,
  last_error text,
  stock_synced integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, account_id)
);
create index if not exists listings_org_idx on listings (org_id);

create table if not exists orders (
  id text primary key,
  org_id text not null references organizations (id),
  account_id text,
  channel text not null,
  number text not null,
  buyer_name text not null,
  buyer_doc text not null default '',
  status text not null,
  freight_cents integer not null default 0,
  total_cents integer not null default 0,
  sla_at timestamptz,
  address text not null default '',
  created_at timestamptz not null default now(),
  unique (org_id, number)
);
create index if not exists orders_org_idx on orders (org_id, created_at);

create table if not exists order_items (
  id text primary key,
  order_id text not null,
  product_id text,
  listing_id text,
  sku text not null,
  title text not null,
  qty integer not null,
  price_cents integer not null
);

create table if not exists invoices (
  id text primary key,
  org_id text not null references organizations (id),
  order_id text not null unique,
  status text not null,
  number text,
  access_key text,
  issued_at timestamptz
);

create table if not exists shipments (
  id text primary key,
  org_id text not null references organizations (id),
  order_id text not null unique,
  carrier text,
  tracking text,
  label_ready boolean not null default false,
  status text not null,
  shipped_at timestamptz
);

create table if not exists questions (
  id text primary key,
  org_id text not null references organizations (id),
  account_id text,
  channel text not null,
  product_id text,
  buyer_name text not null,
  body text not null,
  answer text,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists quick_replies (
  id text primary key,
  org_id text not null references organizations (id),
  title text not null,
  body text not null
);

create table if not exists auto_replies (
  id text primary key,
  org_id text not null references organizations (id),
  keyword text not null,
  body text not null,
  active boolean not null default true
);

create table if not exists stock_adjustments (
  id text primary key,
  org_id text not null references organizations (id),
  product_id text not null,
  delta integer not null,
  reason text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists sync_logs (
  id text primary key,
  org_id text not null references organizations (id),
  channel text,
  account_id text,
  action text not null,
  ok boolean not null,
  detail text not null,
  created_at timestamptz not null default now()
);
create index if not exists sync_logs_org_idx on sync_logs (org_id, created_at);
