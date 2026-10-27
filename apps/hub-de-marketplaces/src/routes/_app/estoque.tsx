import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, LoadingLine, Page, Section, TableWrap, td, th, ToneText } from "@/components/ui";
import { applyStockAdjustment, loadStock, queueStockAdjustment, resyncProduct } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { channelShort } from "@/lib/hub/channels";
import { formatWhen } from "@/lib/hub/format";

export const Route = createFileRoute("/_app/estoque")({
  component: StockPage,
  head: () => ({ meta: [{ title: "Estoque · Hub de Marketplaces" }] }),
});

function StockPage() {
  const query = useHubQuery(["stock"], () => loadStock());
  const [productId, setProductId] = useState("");
  const [delta, setDelta] = useState("-1");
  const [reason, setReason] = useState("");
  const queue = useHubMut(queueStockAdjustment, () => {
    toast("Ajuste na fila.");
    setReason("");
  });
  const apply = useHubMut(applyStockAdjustment, (result) => toast(`Aplicado. Disponível ${result.available}.`));
  const sync = useHubMut(resyncProduct, (result) => toast(`Sincronizado. Disponível ${result.available}.`));
  if (query.isLoading) return <Page title="Estoque"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Estoque"><ErrorLine message={hubError(query.error)} /></Page>;
  return (
    <Page title="Estoque" lede="Um saldo. Reserva por pedido. Na segurança, o anúncio pausa sozinho.">
      <Section title="Fila de ajuste">
        <div className="grid gap-3 md:grid-cols-4">
          <select className="h-11 border border-line bg-bg px-3 text-sm" value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">SKU</option>
            {query.data.products.map((product) => (
              <option key={product.id} value={product.id}>{product.sku}</option>
            ))}
          </select>
          <input className="h-11 border border-line bg-bg px-3 text-sm" value={delta} onChange={(event) => setDelta(event.target.value)} />
          <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="Motivo" value={reason} onChange={(event) => setReason(event.target.value)} />
          <Button
            variant="primary"
            disabled={queue.isPending}
            onClick={() => queue.mutate({ data: { productId, delta: Number(delta), reason } })}
          >
            Colocar na fila
          </Button>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {query.data.queue.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2">
              <span>{item.sku} · {item.delta > 0 ? `+${item.delta}` : item.delta} · {item.reason}</span>
              {item.status === "queued" ? (
                <button type="button" className="text-xs text-muted" disabled={apply.isPending} onClick={() => apply.mutate({ data: { id: item.id } })}>
                  Aplicar
                </button>
              ) : (
                <span className="text-xs text-ok">aplicado</span>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <TableWrap>
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className={th}>SKU</th>
              <th className={th}>Físico</th>
              <th className={th}>Reservado</th>
              <th className={th}>Segurança</th>
              <th className={th}>Disponível</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {query.data.products.map((product) => {
              const critical = product.available <= product.safety;
              return (
                <tr key={product.id} className="border-t border-line">
                  <td className={td}>{product.sku}</td>
                  <td className={td}>{product.physical}</td>
                  <td className={td}>{product.reserved}</td>
                  <td className={td}>{product.safety}</td>
                  <td className={td}><ToneText tone={critical ? "warn" : "ok"}>{product.available}</ToneText></td>
                  <td className={td}>
                    <button type="button" className="text-xs text-muted" disabled={sync.isPending} onClick={() => sync.mutate({ data: { id: product.id } })}>
                      Sincronizar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Section title="Log de sync">
        <ul className="space-y-2 text-sm">
          {query.data.logs.map((log) => (
            <li key={log.id} className="flex flex-wrap gap-3 border-b border-line py-2">
              <span className="text-muted">{formatWhen(log.createdAt)}</span>
              <span>{log.channel ? channelShort(log.channel) : "—"}</span>
              <span>{log.action}</span>
              <ToneText tone={log.ok ? "ok" : "danger"}>{log.ok ? "ok" : log.detail}</ToneText>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
