import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, listingLabel, LoadingLine, Page, Section, TableWrap, td, th, ToneText } from "@/components/ui";
import { bulkEditListings, changeListingStatus, createMockSale, loadListings, publishListings } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { channelLabel } from "@/lib/hub/channels";
import { formatBRL, moneyToInput, parseMoney, suggestPrice } from "@/lib/hub/format";
import { accountTone, listingTone, LISTING_KIND, labelOf } from "@/lib/hub/labels";

export const Route = createFileRoute("/_app/anuncios")({
  component: AdsPage,
  head: () => ({ meta: [{ title: "Anúncios · Hub de Marketplaces" }] }),
});

function AdsPage() {
  const query = useHubQuery(["listings"], () => loadListings());
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"simple" | "variation" | "catalog">("simple");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");

  const publishMut = useHubMut(publishListings, (result) => {
    const ok = result.results.filter((item) => item.ok).length;
    const fail = result.results.filter((item) => !item.ok);
    toast(`${ok} canal(is) confirmaram.`);
    if (fail[0]?.error) toast.error(fail[0].error);
  });
  const saleMut = useHubMut(createMockSale, (result) => {
    toast(`${result.orderNumber} · disponível agora ${result.available}.`);
  });
  const statusMut = useHubMut(changeListingStatus, () => toast("Status atualizado."));
  const bulkMut = useHubMut(bulkEditListings, (result) => {
    toast("Edição aplicada.");
    if (result.errors[0]) toast.error(result.errors[0]);
    setSelected([]);
  });

  const data = query.data;
  const product = data?.products.find((item) => item.id === productId);
  const suggestions = useMemo(() => {
    if (!data || !product) return {};
    const next: Record<string, number> = {};
    for (const account of data.accounts) {
      const rule = data.rules.find((item) => item.channel === account.channel);
      const existing = data.listings.find((item) => item.productId === product.id && item.accountId === account.id);
      if (existing) next[account.id] = existing.priceCents;
      else if (rule) {
        next[account.id] = suggestPrice({
          costCents: product.costCents,
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
      } else next[account.id] = product.priceCents;
    }
    return next;
  }, [data, product]);

  if (query.isLoading) return <Page title="Anúncios"><LoadingLine /></Page>;
  if (query.isError || !data) return <Page title="Anúncios"><ErrorLine message={hubError(query.error)} /></Page>;

  function chooseProduct(id: string) {
    setProductId(id);
    const found = data?.products.find((item) => item.id === id);
    setTitle(found?.title ?? "");
    setKind(found?.kind === "variation" ? "variation" : found?.kind === "parent" ? "catalog" : "simple");
    setPrices({});
    const next: Record<string, boolean> = {};
    for (const account of data?.accounts ?? []) next[account.id] = account.status === "connected";
    setPicked(next);
  }

  return (
    <Page title="Anúncios" lede="O mesmo SKU, preços diferentes, cinco canais. Simples, variação ou catálogo.">
      <Section title="Publicar">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-xs text-muted">
            SKU
            <select className="mt-2 h-11 w-full border border-line bg-bg px-3 text-sm text-fg" value={productId} onChange={(event) => chooseProduct(event.target.value)}>
              <option value="">Escolher</option>
              {data.products.map((item) => (
                <option key={item.id} value={item.id}>{item.sku} · {item.title}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            Modelo
            <select className="mt-2 h-11 w-full border border-line bg-bg px-3 text-sm text-fg" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="simple">Simples</option>
              <option value="variation">Variação</option>
              <option value="catalog">Catálogo</option>
            </select>
          </label>
          <label className="block text-xs text-muted md:col-span-2">
            Título no anúncio
            <input className="mt-2 h-11 w-full border border-line bg-bg px-3 text-sm text-fg" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
        </div>
        {product ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted">Disponível {product.available}. O preço sugerido muda por canal.</p>
            {data.accounts.map((account) => {
              const suggested = suggestions[account.id] ?? product.priceCents;
              const value = prices[account.id] ?? moneyToInput(suggested);
              return (
                <label key={account.id} className="grid items-center gap-3 border border-line px-3 py-3 md:grid-cols-[auto_1fr_160px]">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={account.status !== "connected"}
                    checked={Boolean(picked[account.id]) && account.status === "connected"}
                    onChange={(event) => setPicked((current) => ({ ...current, [account.id]: event.target.checked }))}
                  />
                  <span className="text-sm">
                    {channelLabel(account.channel)} · {account.name}{" "}
                    <ToneText tone={accountTone(account.status)}>{account.status === "connected" ? "conectada" : account.status === "token_expired" ? "token expirado" : "erro"}</ToneText>
                  </span>
                  <input
                    className="h-11 border border-line bg-bg px-3 text-sm"
                    value={value}
                    onChange={(event) => setPrices((current) => ({ ...current, [account.id]: event.target.value }))}
                  />
                </label>
              );
            })}
            <Button
              variant="primary"
              disabled={publishMut.isPending || !title}
              onClick={() => {
                const targets = data.accounts
                  .filter((account) => picked[account.id] && account.status === "connected")
                  .map((account) => ({
                    accountId: account.id,
                    priceCents: parseMoney(prices[account.id] ?? moneyToInput(suggestions[account.id] ?? product.priceCents)),
                  }));
                if (!targets.length) {
                  toast.error("Escolha ao menos uma conta conectada.");
                  return;
                }
                publishMut.mutate({ data: { productId: product.id, kind, title, targets } });
              }}
            >
              {publishMut.isPending ? "Publicando…" : "Publicar nos canais marcados"}
            </Button>
          </div>
        ) : null}
      </Section>
      {selected.length ? (
        <Section title={`${selected.length} selecionados`}>
          <div className="grid gap-3 md:grid-cols-4">
            <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="Novo preço" value={bulkPrice} onChange={(event) => setBulkPrice(event.target.value)} />
            <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="Estoque físico" value={bulkStock} onChange={(event) => setBulkStock(event.target.value)} />
            <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="No título, achar" value={find} onChange={(event) => setFind(event.target.value)} />
            <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="Trocar por" value={replace} onChange={(event) => setReplace(event.target.value)} />
          </div>
          <Button
            className="mt-3"
            variant="primary"
            disabled={bulkMut.isPending}
            onClick={() =>
              bulkMut.mutate({
                data: {
                  ids: selected,
                  priceCents: bulkPrice ? parseMoney(bulkPrice) : null,
                  stockPhysical: bulkStock ? Number(bulkStock) : null,
                  titleFind: find,
                  titleReplace: replace,
                },
              })
            }
          >
            Aplicar
          </Button>
        </Section>
      ) : null}
      <TableWrap>
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              <th className={th} />
              <th className={th}>SKU</th>
              <th className={th}>Canal</th>
              <th className={th}>Título</th>
              <th className={th}>Modelo</th>
              <th className={th}>Preço</th>
              <th className={th}>Estoque</th>
              <th className={th}>Status</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {data.listings.map((listing) => (
              <tr key={listing.id} className="border-t border-line">
                <td className={td}>
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.includes(listing.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked ? [...current, listing.id] : current.filter((id) => id !== listing.id),
                      )
                    }
                  />
                </td>
                <td className={td}>{listing.sku}</td>
                <td className={td}>{channelLabel(listing.channel)}</td>
                <td className={td}>{listing.title}</td>
                <td className={td}>{labelOf(LISTING_KIND, listing.kind)}</td>
                <td className={td}>{formatBRL(listing.priceCents)}</td>
                <td className={td}>{listing.stockSynced}</td>
                <td className={td}>
                  <ToneText tone={listingTone(listing.status)}>{listingLabel(listing.status)}</ToneText>
                  {listing.lastError ? <p className="max-w-56 whitespace-normal text-xs text-muted">{listing.lastError}</p> : null}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    {listing.status === "published" ? (
                      <button type="button" className="text-xs text-muted" disabled={saleMut.isPending} onClick={() => saleMut.mutate({ data: { id: listing.id } })}>
                        Venda mock
                      </button>
                    ) : null}
                    {listing.status === "published" ? (
                      <button type="button" className="text-xs text-muted" onClick={() => statusMut.mutate({ data: { id: listing.id, status: "paused" } })}>
                        Pausar
                      </button>
                    ) : null}
                    {listing.status === "paused" || listing.status === "error" ? (
                      <button type="button" className="text-xs text-muted" onClick={() => statusMut.mutate({ data: { id: listing.id, status: "published" } })}>
                        Retomar
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Page>
  );
}
