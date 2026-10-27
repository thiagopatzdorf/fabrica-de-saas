import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, LoadingLine, orderLabel, Page, TableWrap, td, th, ToneText } from "@/components/ui";
import { actOnOrders, issueInvoices, loadOrders } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { channelShort } from "@/lib/hub/channels";
import { formatBRL, formatWhen } from "@/lib/hub/format";
import { ORDER_STATUS, orderTone } from "@/lib/hub/labels";

export const Route = createFileRoute("/_app/pedidos")({
  component: OrdersPage,
  head: () => ({ meta: [{ title: "Pedidos · Hub de Marketplaces" }] }),
});

function OrdersPage() {
  const query = useHubQuery(["orders"], () => loadOrders());
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const act = useHubMut(actOnOrders, (result) => {
    toast("Pedidos atualizados.");
    if (result.errors[0]) toast.error(result.errors[0]);
    setSelected([]);
  });
  const emit = useHubMut(issueInvoices, (result) => {
    const first = result.issued[0];
    toast(first ? `Nota ${first.number}` : "Nada emitido.");
  });
  if (query.isLoading) return <Page title="Pedidos"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Pedidos"><ErrorLine message={hubError(query.error)} /></Page>;
  const needle = q.trim().toLowerCase();
  const orders = query.data.orders.filter((order) => {
    if (status !== "all" && order.status !== status) return false;
    if (!needle) return true;
    return `${order.number} ${order.buyer} ${order.items.map((item) => item.sku).join(" ")}`.toLowerCase().includes(needle);
  });
  return (
    <Page title="Pedidos" lede="Uma inbox. Canal, conta, comprador, itens, frete, SLA.">
      <div className="flex flex-wrap gap-3">
        <input className="h-11 min-w-48 flex-1 border border-line bg-bg px-3 text-sm" placeholder="Buscar" value={q} onChange={(event) => setQ(event.target.value)} />
        <select className="h-11 border border-line bg-bg px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Todos</option>
          {Object.entries(ORDER_STATUS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      {selected.length ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={act.isPending} onClick={() => act.mutate({ data: { ids: selected, action: "pay" } })}>Marcar pago</Button>
          <Button disabled={act.isPending} onClick={() => act.mutate({ data: { ids: selected, action: "cancel" } })}>Cancelar</Button>
          <Button disabled={act.isPending} onClick={() => act.mutate({ data: { ids: selected, action: "deliver" } })}>Marcar entregue</Button>
        </div>
      ) : null}
      <TableWrap>
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              <th className={th} />
              <th className={th}>Pedido</th>
              <th className={th}>Canal</th>
              <th className={th}>Conta</th>
              <th className={th}>Comprador</th>
              <th className={th}>Valor</th>
              <th className={th}>Frete</th>
              <th className={th}>Status</th>
              <th className={th}>SLA</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const late = order.slaAt ? new Date(order.slaAt).getTime() < Date.now() && ["awaiting_payment", "paid", "invoiced"].includes(order.status) : false;
              return (
                <Fragment key={order.id}>
                  <tr className="border-t border-line">
                    <td className={td}>
                      <input type="checkbox" className="size-4" checked={selected.includes(order.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id))} />
                    </td>
                    <td className={td}>
                      <button type="button" onClick={() => setOpen(open === order.id ? null : order.id)}>{order.number}</button>
                    </td>
                    <td className={td}>{channelShort(order.channel)}</td>
                    <td className={td}>{order.accountName ?? "—"}</td>
                    <td className={td}>{order.buyer}</td>
                    <td className={td}>{formatBRL(order.totalCents)}</td>
                    <td className={td}>{formatBRL(order.freightCents)}</td>
                    <td className={td}><ToneText tone={orderTone(order.status)}>{orderLabel(order.status)}</ToneText></td>
                    <td className={td}><ToneText tone={late ? "warn" : "mute"}>{formatWhen(order.slaAt)}</ToneText></td>
                  </tr>
                  {open === order.id ? (
                    <tr className="border-t border-line">
                      <td className={td} colSpan={9}>
                        <p className="whitespace-normal">{order.address}</p>
                        <ul className="mt-2 space-y-1">
                          {order.items.map((item) => (
                            <li key={item.sku}>{item.qty}× {item.sku} · {item.title} · {formatBRL(item.priceCents)}</li>
                          ))}
                        </ul>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs">
                          {order.status === "paid" ? (
                            <button type="button" className="text-muted" disabled={emit.isPending} onClick={() => emit.mutate({ data: { ids: [order.id] } })}>Emitir nota</button>
                          ) : null}
                          {order.status === "invoiced" ? <Link to="/expedicao" className="text-muted">Ir para expedição</Link> : null}
                          {(order.status === "shipped" || order.status === "delivered") ? (
                            <button type="button" className="text-muted" onClick={() => act.mutate({ data: { ids: [order.id], action: "return" } })}>Devolver</button>
                          ) : null}
                          <span className="text-muted">{formatWhen(order.createdAt)}</span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </Page>
  );
}
