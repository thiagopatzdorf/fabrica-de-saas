import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, LoadingLine, Page, Section } from "@/components/ui";
import { dispatchOrders, issueInvoices, loadExpedition, loadLabels } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { CARRIERS, channelShort } from "@/lib/hub/channels";
import type { Carrier } from "@/lib/hub/channels";

export const Route = createFileRoute("/_app/expedicao")({
  component: ShipPage,
  head: () => ({ meta: [{ title: "Expedição · Hub de Marketplaces" }] }),
});

type Label = {
  orderId: string;
  number: string;
  channel: string;
  buyer: string;
  address: string;
  carrier: string | null;
  tracking: string | null;
  invoiceNumber: string | null;
  accessKey: string | null;
  items: { sku: string; title: string; qty: number }[];
};

function ShipPage() {
  const query = useHubQuery(["ship"], () => loadExpedition());
  const [picked, setPicked] = useState<string[]>([]);
  const [carrier, setCarrier] = useState<Carrier>("Correios");
  const [labels, setLabels] = useState<Label[]>([]);
  const emit = useHubMut(issueInvoices, (result) => toast(result.issued[0] ? `Nota ${result.issued[0].number} liberou a etiqueta.` : "Emitida."));
  const labelsMut = useHubMut(loadLabels, (result) => setLabels(result.labels));
  const ship = useHubMut(dispatchOrders, (result) => {
    if (result.shipped.length) toast(`Despachado: ${result.shipped.join(", ")}`);
    if (result.errors[0]) toast.error(result.errors[0]);
    setPicked([]);
  });
  if (query.isLoading) return <Page title="Expedição"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Expedição"><ErrorLine message={hubError(query.error)} /></Page>;
  const data = query.data;
  return (
    <Page title="Expedição" lede="A nota libera a etiqueta. Despachou, o status vai para o canal.">
      <Section title="Aguardando nota">
        {data.waiting.length === 0 ? <p className="text-sm text-muted">Nenhum pedido pago parado na nota.</p> : (
          <ul className="space-y-2 text-sm">
            {data.waiting.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2">
                <span>{order.number} · {channelShort(order.channel)} · {order.buyer}</span>
                <button type="button" className="text-xs text-muted" disabled={emit.isPending} onClick={() => emit.mutate({ data: { ids: [order.id] } })}>
                  Emitir nota
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Prontas para despacho">
        <div className="mb-3 flex flex-wrap gap-2">
          <select className="h-11 border border-line bg-bg px-3 text-sm" value={carrier} onChange={(event) => setCarrier(event.target.value as Carrier)}>
            {CARRIERS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <Button disabled={!picked.length || labelsMut.isPending} onClick={() => labelsMut.mutate({ data: { ids: picked } })}>
            Gerar etiquetas
          </Button>
          <Button variant="primary" disabled={!picked.length || ship.isPending} onClick={() => ship.mutate({ data: { ids: picked, carrier } })}>
            Marcar despachado
          </Button>
        </div>
        {data.ready.length === 0 ? <p className="text-sm text-muted">Nada faturado esperando coleta.</p> : (
          <ul className="space-y-2 text-sm">
            {data.ready.map((order) => (
              <li key={order.id} className="flex items-center gap-3 border-b border-line py-2">
                <input type="checkbox" className="size-4" checked={picked.includes(order.id)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id))} />
                <span>{order.number} · {order.buyer} · NF {order.invoiceNumber}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {labels.length ? (
        <div className="label-sheet grid gap-4 md:grid-cols-2">
          {labels.map((label) => (
            <article key={label.orderId} className="border border-line bg-bg p-4 text-fg">
              <p className="font-display text-xs tracking-brand">HUB DE MARKETPLACES</p>
              <p className="mt-1 text-xs text-muted">Etiqueta simulada · {channelShort(label.channel)}</p>
              <h3 className="mt-4 font-display text-xl">{label.number}</h3>
              <p className="mt-2 text-sm">{label.buyer}</p>
              <p className="text-sm text-muted">{label.address}</p>
              <ul className="mt-3 text-sm">
                {label.items.map((item) => <li key={item.sku}>{item.qty}× {item.sku}</li>)}
              </ul>
              <p className="mt-3 text-xs text-muted">NF {label.invoiceNumber ?? "—"}</p>
              <p className="break-all text-xs text-muted">{label.accessKey}</p>
              <Barcode seed={label.number} />
              <button type="button" className="mt-4 text-xs text-muted print:hidden" onClick={() => window.print()}>Imprimir lote</button>
            </article>
          ))}
        </div>
      ) : null}
      <Section title="Já despachados">
        <ul className="space-y-2 text-sm text-muted">
          {data.shipped.map((order) => (
            <li key={order.id}>{order.number} · {order.carrier} · {order.tracking}</li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}

function Barcode({ seed }: { seed: string }) {
  const bars = seed.split("").map((char, index) => (char.charCodeAt(0) + index) % 4 === 0 ? "w-1" : (char.charCodeAt(0) + index) % 2 === 0 ? "w-0.5" : "w-1.5");
  return (
    <div className="mt-4 flex h-10 items-end gap-px" aria-hidden="true">
      {bars.map((width, index) => (
        <span key={`${seed}-${index}`} className={`${width} h-full bg-fg`} />
      ))}
    </div>
  );
}
