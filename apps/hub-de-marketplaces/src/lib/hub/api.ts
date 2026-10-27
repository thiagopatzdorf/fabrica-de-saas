import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  adjustmentInput,
  applySuggestedInput,
  autoInput,
  bulkListingsInput,
  bulkOrdersInput,
  connectInput,
  createProductInput,
  idInput,
  idsInput,
  importCsvInput,
  listingStatusInput,
  priceRuleInput,
  publishInput,
  quickInput,
  removeTemplateInput,
  replyInput,
  saveAttributeInput,
  saveMapInput,
  shipInput,
  updateProductInput,
} from "./schemas";

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Dados inválidos.");
  return result.data;
}

export const loadShell = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.shell(context.userId);
  });

export const loadDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.dashboard(context.userId);
  });

export const loadCatalog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.catalog(context.userId);
  });

export const loadProduct = createServerFn({ method: "GET" })
  .validator((raw: unknown) => parse(idInput, raw).id)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.productDetail(context.userId, data);
  });

export const createProduct = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(createProductInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.createProduct(context.userId, data);
  });

export const updateProduct = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(updateProductInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.updateProduct(context.userId, data);
  });

export const importProducts = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(importCsvInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.importCsv(context.userId, data.csv);
  });

export const loadMappings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.mappings(context.userId);
  });

export const saveMap = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(saveMapInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.saveMap(context.userId, data);
  });

export const saveAttribute = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(saveAttributeInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.saveAttribute(context.userId, data);
  });

export const loadListings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.listings(context.userId);
  });

export const publishListings = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(publishInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.publish(context.userId, data);
  });

export const bulkEditListings = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(bulkListingsInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.bulkListings(context.userId, data);
  });

export const changeListingStatus = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(listingStatusInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.setListingStatus(context.userId, data);
  });

export const loadPricing = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.pricing(context.userId);
  });

export const savePriceRule = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(priceRuleInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.savePriceRule(context.userId, data);
  });

export const applySuggestedPrices = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(applySuggestedInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.applySuggested(context.userId, data.channel);
  });

export const loadStock = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.stock(context.userId);
  });

export const queueStockAdjustment = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(adjustmentInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.queueAdjustment(context.userId, data);
  });

export const applyStockAdjustment = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(idInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.applyAdjustment(context.userId, data.id);
  });

export const resyncProduct = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(idInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.resync(context.userId, data.id);
  });

export const loadOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.orders(context.userId);
  });

export const createMockSale = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(idInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.mockSale(context.userId, data.id);
  });

export const pullChannelOrders = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(idInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.pullOrders(context.userId, data.id);
  });

export const actOnOrders = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(bulkOrdersInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.bulkOrders(context.userId, data);
  });

export const loadExpedition = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.expedition(context.userId);
  });

export const loadLabels = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(idsInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.labels(context.userId, data.ids);
  });

export const dispatchOrders = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(shipInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.shipOrders(context.userId, data);
  });

export const issueInvoices = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(idsInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.emitInvoices(context.userId, data.ids);
  });

export const loadInvoices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.invoices(context.userId);
  });

export const loadAftersales = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.aftersales(context.userId);
  });

export const replyQuestion = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(replyInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.replyQuestion(context.userId, data);
  });

export const saveQuickReply = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(quickInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.saveQuick(context.userId, data);
  });

export const saveAutoReply = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(autoInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.saveAuto(context.userId, data);
  });

export const removeTemplate = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(removeTemplateInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.removeTemplate(context.userId, data);
  });

export const loadConnectors = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await import("./db.server");
    return db.connectors(context.userId);
  });

export const connectChannel = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(connectInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.connectAccount(context.userId, data);
  });

export const testChannel = createServerFn({ method: "POST" })
  .validator((raw: unknown) => parse(idInput, raw))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = await import("./db.server");
    return db.probeAccount(context.userId, data.id);
  });
