import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";
import { ErrorLine, LoadingLine, Page, Section, TableWrap, td, th, ToneText, orderLabel } from "@/components/ui";
import { loadDashboard } from "@/lib/hub/api";
import { hubError, useHubQuery } from "@/lib/hub/client";
import { channelShort } from "@/lib/hub/channels";
import { formatBRL, formatWhen } from "@/lib/hub/format";
import { orderTone } from "@/lib/hub/labels";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Painel · Hub de Marketplaces" }] }),
});

function Dashboard() {
  const query = useHubQuery(["dashboard"], () => loadDashboard());
  const [window, setWindow] = useState<"7" | "30">("7");
  if (query.isLoading) return <Page title="Painel"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Painel"><ErrorLine message={hubError(query.error)} /></Page>;
  const data = query.data;
  const chart = data.byChannel.map((row) => ({
    name: channelShort(row.channel),
    gmv: (window === "7" ? row.gmv7 : row.gmv30) / 100,
  }));
  return (
    <Page title="Painel" lede={`${data.tradeName}. Pedidos, caixa e estoque do dia.`}>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Pedidos hoje" value={String(data.ordersToday)} />
        <Kpi label="GMV 7 dias" value={formatBRL(data.gmv7)} />
        <Kpi label="GMV 30 dias" value={formatBRL(data.gmv30)} />
        <Kpi label="Estoque crítico" value={String(data.critical)} tone={data.critical ? "warn" : "mute"} />
        <Kpi label="Anúncios pausados" value={String(data.paused)} tone={data.paused ? "warn" : "mute"} />
        <Kpi label="Fila com erro" value={String(data.errors)} tone={data.errors ? "danger" : "mute"} />
      </div>
      <Section
        title="Vendas por canal"
        action={
          <div className="flex gap-3 text-xs">
            <button type="button" className={window === "7" ? "text-fg" : "text-muted"} onClick={() => setWindow("7")}>7 dias</button>
            <button type="button" className={window === "30" ? "text-fg" : "text-muted"} onClick={() => setWindow("30")}>30 dias</button>
          </div>
        }
      >
        <div className="h-56 border border-line px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "var(--color-raise)" }}
                contentStyle={{ background: "var(--color-work)", border: "1px solid var(--color-line)", borderRadius: 0 }}
                formatter={(value) => formatBRL(Math.round(Number(value) * 100))}
              />
              <Bar dataKey="gmv" fill="var(--color-ok)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Estoque na segurança">
          {data.criticalItems.length === 0 ? (
            <p className="text-sm text-muted">Nenhum SKU encostou na segurança.</p>
          ) : (
            <ul className="space-y-3">
              {data.criticalItems.map((item) => (
                <li key={item.sku} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 text-sm">
                  <span>{item.sku}</span>
                  <span className="text-warn">{item.available} disp. · seg. {item.safety}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Fila com erro">
          {data.errorQueue.length === 0 ? (
            <p className="text-sm text-muted">Nada parado com erro.</p>
          ) : (
            <ul className="space-y-3">
              {data.errorQueue.map((item) => (
                <li key={item.id} className="border-b border-line pb-3 text-sm">
                  <p>{item.label}</p>
                  <p className="text-danger">{item.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section title="Pedidos recentes" action={<Link to="/pedidos" className="text-xs text-muted">Abrir inbox</Link>}>
        <TableWrap>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Pedido</th>
                <th className={th}>Canal</th>
                <th className={th}>Comprador</th>
                <th className={th}>Valor</th>
                <th className={th}>Status</th>
                <th className={th}>Quando</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((order) => (
                <tr key={order.id} className="border-t border-line">
                  <td className={td}>{order.number}</td>
                  <td className={td}>{channelShort(order.channel)}</td>
                  <td className={td}>{order.buyer}</td>
                  <td className={td}>{formatBRL(order.totalCents)}</td>
                  <td className={td}><ToneText tone={orderTone(order.status)}>{orderLabel(order.status)}</ToneText></td>
                  <td className={td}>{formatWhen(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Section>
    </Page>
  );
}

function Kpi({ label, value, tone = "mute" }: { label: string; value: string; tone?: "warn" | "danger" | "mute" }) {
  return (
    <div className="bg-work px-4 py-5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-3 font-display text-3xl ${tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg"}`}>{value}</p>
    </div>
  );
}
