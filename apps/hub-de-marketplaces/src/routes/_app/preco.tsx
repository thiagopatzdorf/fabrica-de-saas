import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, LoadingLine, Page, Section, ToneText } from "@/components/ui";
import { applySuggestedPrices, loadPricing, savePriceRule } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { CHANNELS, channelLabel, isChannelId } from "@/lib/hub/channels";
import { bpsToInput, formatBRL, moneyToInput, parseBps, parseMoney, suggestPrice } from "@/lib/hub/format";

export const Route = createFileRoute("/_app/preco")({
  component: PricePage,
  head: () => ({ meta: [{ title: "Preço · Hub de Marketplaces" }] }),
});

function PricePage() {
  const query = useHubQuery(["pricing"], () => loadPricing());
  const [channel, setChannel] = useState("ml");
  const [productId, setProductId] = useState("");
  const save = useHubMut(savePriceRule, () => toast("Regra salva."));
  const apply = useHubMut(applySuggestedPrices, (result) => {
    toast(`${result.updated} anúncios atualizados.`);
    if (result.errors[0]) toast.error(result.errors[0]);
  });
  if (query.isLoading) return <Page title="Preço"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Preço"><ErrorLine message={hubError(query.error)} /></Page>;
  const rule = query.data.rules.find((item) => item.channel === channel) ?? query.data.rules[0];
  return (
    <Page title="Preço" lede="Custo + frete + comissão + imposto + margem. O sugerido sai disso, com piso e ,90.">
      <div className="flex flex-wrap gap-2">
        {CHANNELS.map((item) => (
          <button key={item.id} type="button" className={`h-11 border px-4 text-sm ${channel === item.id ? "border-fg text-fg" : "border-line text-muted"}`} onClick={() => setChannel(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {rule && isChannelId(rule.channel) ? (
        <RuleForm
          key={rule.channel}
          rule={rule}
          pending={save.isPending}
          onSave={(input) => save.mutate({ data: input })}
        />
      ) : null}
      <Section title="Simular um SKU">
        <select className="h-11 w-full max-w-md border border-line bg-bg px-3 text-sm" value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="">Escolher</option>
          {query.data.products.map((product) => (
            <option key={product.id} value={product.id}>{product.sku} · {product.title}</option>
          ))}
        </select>
        {productId && rule ? <Breakdown productId={productId} products={query.data.products} rule={rule} /> : null}
      </Section>
      <Button variant="primary" disabled={apply.isPending || !isChannelId(channel)} onClick={() => isChannelId(channel) && apply.mutate({ data: { channel } })}>
        {apply.isPending ? "Aplicando…" : `Aplicar sugerido em ${channelLabel(channel)}`}
      </Button>
    </Page>
  );
}

function RuleForm({
  rule,
  pending,
  onSave,
}: {
  rule: {
    channel: string;
    freightCents: number;
    commissionBps: number;
    taxBps: number;
    marginBps: number;
    markupBps: number;
    floorCents: number;
    round90: boolean;
    promoPct: number;
    promoStart: string | null;
    promoEnd: string | null;
  };
  pending: boolean;
  onSave: (input: {
    channel: "ml" | "shopee" | "amazon" | "magalu" | "store";
    freightCents: number;
    commissionBps: number;
    taxBps: number;
    marginBps: number;
    markupBps: number;
    floorCents: number;
    round90: boolean;
    promoPct: number;
    promoStart: string | null;
    promoEnd: string | null;
  }) => void;
}) {
  const [freight, setFreight] = useState(moneyToInput(rule.freightCents));
  const [commission, setCommission] = useState(bpsToInput(rule.commissionBps));
  const [tax, setTax] = useState(bpsToInput(rule.taxBps));
  const [margin, setMargin] = useState(bpsToInput(rule.marginBps));
  const [markup, setMarkup] = useState(bpsToInput(rule.markupBps));
  const [floor, setFloor] = useState(moneyToInput(rule.floorCents));
  const [round90, setRound90] = useState(rule.round90);
  const [promo, setPromo] = useState(String(rule.promoPct));
  const [start, setStart] = useState(rule.promoStart ?? "");
  const [end, setEnd] = useState(rule.promoEnd ?? "");
  if (!isChannelId(rule.channel)) return null;
  const channel = rule.channel;
  return (
    <form
      className="grid gap-4 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          channel,
          freightCents: parseMoney(freight),
          commissionBps: parseBps(commission),
          taxBps: parseBps(tax),
          marginBps: parseBps(margin),
          markupBps: parseBps(markup),
          floorCents: parseMoney(floor),
          round90,
          promoPct: Math.round(Number(promo) || 0),
          promoStart: start || null,
          promoEnd: end || null,
        });
      }}
    >
      <Num label="Frete (R$)" value={freight} onChange={setFreight} />
      <Num label="Comissão %" value={commission} onChange={setCommission} />
      <Num label="Imposto %" value={tax} onChange={setTax} />
      <Num label="Margem %" value={margin} onChange={setMargin} />
      <Num label="Markup % sobre o custo" value={markup} onChange={setMarkup} />
      <Num label="Piso (R$)" value={floor} onChange={setFloor} />
      <Num label="Promoção %" value={promo} onChange={setPromo} />
      <Num label="Início" value={start} onChange={setStart} type="date" />
      <Num label="Fim" value={end} onChange={setEnd} type="date" />
      <label className="flex h-11 items-center gap-3 text-sm md:col-span-2">
        <input type="checkbox" className="size-4" checked={round90} onChange={(event) => setRound90(event.target.checked)} />
        Arredondar para ,90
      </label>
      <Button variant="primary" type="submit" disabled={pending}>Salvar regra</Button>
    </form>
  );
}

function Num({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input className="mt-2 h-11 w-full border border-line bg-bg px-3 text-sm text-fg" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Breakdown({
  productId,
  products,
  rule,
}: {
  productId: string;
  products: { id: string; costCents: number; sku: string }[];
  rule: {
    freightCents: number;
    commissionBps: number;
    taxBps: number;
    marginBps: number;
    markupBps: number;
    floorCents: number;
    round90: boolean;
    promoPct: number;
    promoStart: string | null;
    promoEnd: string | null;
  };
}) {
  const product = products.find((item) => item.id === productId);
  const price = useMemo(() => {
    if (!product) return null;
    return suggestPrice({
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
    });
  }, [product, rule]);
  if (!product || !price) return null;
  const rows = [
    ["Custo", price.costCents],
    ["Markup", price.markupCents],
    ["Frete", price.freightCents],
    ["Comissão", price.commissionCents],
    ["Imposto", price.taxCents],
    ["Margem", price.marginCents],
  ] as const;
  return (
    <dl className="mt-4 max-w-md">
      {rows.map(([label, cents]) => (
        <div key={label} className="flex justify-between border-b border-line py-2 text-sm">
          <dt className="text-muted">{label}</dt>
          <dd>{label === "Margem" && cents < 0 ? <ToneText tone="danger">{formatBRL(cents)}</ToneText> : formatBRL(cents)}</dd>
        </div>
      ))}
      <div className="flex justify-between py-3 text-sm">
        <dt>Sugerido</dt>
        <dd className="font-display text-xl">{formatBRL(price.suggestedCents)}</dd>
      </div>
      {price.promoActive ? <p className="text-xs text-warn">Promoção ativa. Lista {formatBRL(price.listCents)}.</p> : null}
    </dl>
  );
}
