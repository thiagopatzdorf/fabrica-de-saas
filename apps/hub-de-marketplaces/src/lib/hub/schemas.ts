import { z } from "zod";

export const channelId = z.enum(["ml", "shopee", "amazon", "magalu", "store"]);

const productShape = {
  kind: z.enum(["simple", "parent", "variation", "kit"]),
  parentId: z.string().nullable().optional(),
  sku: z.string().trim().min(1, "Informe o SKU.").max(40),
  ean: z.string().trim().max(20).optional().default(""),
  title: z.string().trim().min(1, "Informe o título.").max(180),
  description: z.string().trim().max(4000).optional().default(""),
  brand: z.string().trim().max(80).optional().default(""),
  ncm: z.string().trim().max(12).optional().default(""),
  weightG: z.number().int().nonnegative(),
  heightCm: z.number().int().nonnegative(),
  widthCm: z.number().int().nonnegative(),
  lengthCm: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative(),
  priceCents: z.number().int().nonnegative(),
  stockPhysical: z.number().int().nonnegative(),
  stockSafety: z.number().int().nonnegative(),
  categoryId: z.string().nullable().optional(),
  aliases: z
    .array(z.object({ channel: channelId, alias: z.string().trim().max(60) }))
    .max(5),
  components: z
    .array(z.object({ componentId: z.string().min(1), qty: z.number().int().positive() }))
    .max(30),
  photoUrl: z.string().trim().max(500).optional().default(""),
};

export const createProductInput = z.object(productShape);
export const updateProductInput = z.object({ ...productShape, id: z.string().min(1) });

export const importCsvInput = z.object({
  csv: z.string().min(1, "O arquivo está vazio.").max(500_000),
});

export const saveMapInput = z.object({
  categoryId: z.string().min(1),
  channel: channelId,
  channelCategoryId: z.string().min(1),
});

export const saveAttributeInput = z.object({
  attributeId: z.string().min(1),
  value: z.string().trim().max(120),
});

export const publishInput = z.object({
  productId: z.string().min(1),
  kind: z.enum(["simple", "variation", "catalog"]),
  title: z.string().trim().min(1).max(180),
  targets: z
    .array(z.object({ accountId: z.string().min(1), priceCents: z.number().int().positive() }))
    .min(1, "Escolha ao menos um canal.")
    .max(8),
});

export const bulkListingsInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  priceCents: z.number().int().positive().nullable(),
  stockPhysical: z.number().int().nonnegative().nullable(),
  titleFind: z.string().max(120),
  titleReplace: z.string().max(120),
});

export const listingStatusInput = z.object({
  id: z.string().min(1),
  status: z.enum(["published", "paused", "draft"]),
});

export const priceRuleInput = z.object({
  channel: channelId,
  freightCents: z.number().int().nonnegative(),
  commissionBps: z.number().int().min(0).max(8000),
  taxBps: z.number().int().min(0).max(8000),
  marginBps: z.number().int().min(0).max(8000),
  markupBps: z.number().int().min(0).max(8000),
  floorCents: z.number().int().nonnegative(),
  round90: z.boolean(),
  promoPct: z.number().int().min(0).max(90),
  promoStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  promoEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const applySuggestedInput = z.object({ channel: channelId });

export const adjustmentInput = z.object({
  productId: z.string().min(1),
  delta: z.number().int().refine((value) => value !== 0, "O ajuste não pode ser zero."),
  reason: z.string().trim().min(1, "Diga o motivo.").max(180),
});

export const idInput = z.object({ id: z.string().min(1) });
export const idsInput = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });

export const bulkOrdersInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["pay", "cancel", "deliver", "return"]),
});

export const shipInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  carrier: z.enum(["Correios", "Jadlog", "Loggi", "Total Express"]),
});

export const replyInput = z.object({
  questionId: z.string().min(1),
  body: z.string().trim().max(2000),
  mode: z.enum(["manual", "auto"]),
});

export const quickInput = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2000),
});

export const autoInput = z.object({
  keyword: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(2000),
});

export const removeTemplateInput = z.object({
  id: z.string().min(1),
  kind: z.enum(["quick", "auto"]),
});

export const connectInput = z.object({
  channel: channelId,
  name: z.string().trim().min(1, "Dê um nome à conta.").max(80),
});

export type ProductInput = z.infer<typeof createProductInput>;
export type UpdateProductInput = z.infer<typeof updateProductInput>;
export type PublishInput = z.infer<typeof publishInput>;
export type BulkListingsInput = z.infer<typeof bulkListingsInput>;
export type PriceRuleInput = z.infer<typeof priceRuleInput>;
export type AdjustmentInput = z.infer<typeof adjustmentInput>;
export type ShipInput = z.infer<typeof shipInput>;
export type ReplyInput = z.infer<typeof replyInput>;
export type ConnectInput = z.infer<typeof connectInput>;
