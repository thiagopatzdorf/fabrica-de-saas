export const CHANNELS = [
  { id: "ml", label: "Mercado Livre", short: "ML" },
  { id: "shopee", label: "Shopee", short: "SPE" },
  { id: "amazon", label: "Amazon", short: "AMZ" },
  { id: "magalu", label: "Magalu", short: "MAG" },
  { id: "store", label: "Loja própria", short: "LOJ" },
] as const;

export type ChannelId = (typeof CHANNELS)[number]["id"];

export function isChannelId(value: string): value is ChannelId {
  return CHANNELS.some((channel) => channel.id === value);
}

export function channelLabel(id: string): string {
  return CHANNELS.find((channel) => channel.id === id)?.label ?? id;
}

export function channelShort(id: string): string {
  return CHANNELS.find((channel) => channel.id === id)?.short ?? id;
}

export type ChannelCategory = {
  id: string;
  name: string;
  attributes: string[];
};

export const CHANNEL_CATEGORIES: Record<ChannelId, ChannelCategory[]> = {
  ml: [
    { id: "MLB1912", name: "Mochilas", attributes: ["Marca", "Cor", "Material"] },
    { id: "MLB1914", name: "Estojos", attributes: ["Marca", "Material"] },
    { id: "MLB1222", name: "Cadernos", attributes: ["Marca", "Formato"] },
    { id: "MLB4550", name: "Kits escolares", attributes: ["Marca", "Ano escolar"] },
    { id: "MLB2679", name: "Material escolar", attributes: ["Marca"] },
  ],
  shopee: [
    { id: "SHP-BAG", name: "Mochilas e malas", attributes: ["Marca", "Material"] },
    { id: "SHP-CASE", name: "Estojos", attributes: ["Marca", "Material"] },
    { id: "SHP-NOTE", name: "Cadernos", attributes: ["Marca", "Gramatura"] },
    { id: "SHP-KIT", name: "Kits escolares", attributes: ["Marca", "Ano escolar"] },
    { id: "SHP-STAT", name: "Papelaria", attributes: ["Marca"] },
  ],
  amazon: [
    { id: "AMZ-BACK", name: "Backpacks", attributes: ["Marca", "Cor"] },
    { id: "AMZ-CASE", name: "Pencil cases", attributes: ["Marca"] },
    { id: "AMZ-NOTE", name: "Notebooks", attributes: ["Marca", "Páginas"] },
    { id: "AMZ-KIT", name: "School kits", attributes: ["Marca", "Ano escolar"] },
    { id: "AMZ-STAT", name: "School supplies", attributes: ["Marca"] },
  ],
  magalu: [
    { id: "MAG-MOC", name: "Mochilas", attributes: ["Marca", "Cor"] },
    { id: "MAG-EST", name: "Estojos", attributes: ["Marca"] },
    { id: "MAG-CAD", name: "Cadernos", attributes: ["Marca"] },
    { id: "MAG-KIT", name: "Kits escolares", attributes: ["Marca", "Ano escolar"] },
    { id: "MAG-ACE", name: "Acessórios escolares", attributes: ["Marca"] },
  ],
  store: [
    { id: "LOJA-MOC", name: "Mochilas", attributes: ["Marca"] },
    { id: "LOJA-EST", name: "Estojos", attributes: ["Marca"] },
    { id: "LOJA-CAD", name: "Cadernos", attributes: ["Marca"] },
    { id: "LOJA-KIT", name: "Kits", attributes: ["Marca", "Ano escolar"] },
    { id: "LOJA-ACE", name: "Acessórios", attributes: ["Marca"] },
  ],
};

export const CATEGORY_KEYS = ["mochilas", "estojos", "cadernos", "kits", "acessorios"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_NAMES: Record<CategoryKey, string> = {
  mochilas: "Mochilas",
  estojos: "Estojos",
  cadernos: "Cadernos",
  kits: "Kits escolares",
  acessorios: "Acessórios",
};

export function remoteFor(channel: ChannelId, key: CategoryKey): ChannelCategory {
  const index = CATEGORY_KEYS.indexOf(key);
  return CHANNEL_CATEGORIES[channel][index] ?? CHANNEL_CATEGORIES[channel][0];
}

export const CARRIERS = ["Correios", "Jadlog", "Loggi", "Total Express"] as const;
export type Carrier = (typeof CARRIERS)[number];
