import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, LoadingLine, Page, Section, ToneText } from "@/components/ui";
import { connectChannel, loadConnectors, pullChannelOrders, testChannel } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { CHANNELS, channelLabel, isChannelId } from "@/lib/hub/channels";
import { formatWhen } from "@/lib/hub/format";
import { ACCOUNT_STATUS, accountTone, labelOf } from "@/lib/hub/labels";

export const Route = createFileRoute("/_app/conectores")({
  component: ConnectorsPage,
  head: () => ({ meta: [{ title: "Conectores · Hub de Marketplaces" }] }),
});

function ConnectorsPage() {
  const query = useHubQuery(["connectors"], () => loadConnectors());
  const [names, setNames] = useState<Record<string, string>>({});
  const connect = useHubMut(connectChannel, () => toast("Conta conectada."));
  const test = useHubMut(testChannel, () => toast("O conector respondeu."));
  const pull = useHubMut(pullChannelOrders, (result) => {
    toast(result.created ? `Pedido ${result.number} entrou.` : result.message);
  });
  if (query.isLoading) return <Page title="Conectores"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Conectores"><ErrorLine message={hubError(query.error)} /></Page>;
  return (
    <Page title="Conectores" lede="Cada conta publica, atualiza preço e estoque, puxa pedido, manda rastreio e responde pergunta. A conexão real fica pronta para trocar o mock.">
      <div className="grid gap-4 lg:grid-cols-2">
        {CHANNELS.map((channel) => {
          const accounts = query.data.accounts.filter((account) => account.channel === channel.id);
          return (
            <section key={channel.id} className="border border-line p-4">
              <h2 className="font-sans text-sm">{channel.label}</h2>
              {accounts.length === 0 ? <p className="mt-3 text-sm text-muted">Sem conta.</p> : null}
              <ul className="mt-3 space-y-4">
                {accounts.map((account) => (
                  <li key={account.id} className="border-t border-line pt-3">
                    <p className="text-sm">{account.name}</p>
                    <p className="mt-1">
                      <ToneText tone={accountTone(account.status)}>{labelOf(ACCOUNT_STATUS, account.status)}</ToneText>
                    </p>
                    <p className="mt-1 text-xs text-muted">Sync {formatWhen(account.lastSyncAt)}</p>
                    {account.lastError ? <p className="mt-1 text-xs text-danger">{account.lastError}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isChannelId(account.channel) && account.status !== "connected" ? (
                        <Button onClick={() => {
                          if (!isChannelId(account.channel)) return;
                          connect.mutate({ data: { channel: account.channel, name: account.name } });
                        }}>Reconectar</Button>
                      ) : null}
                      <Button disabled={test.isPending} onClick={() => test.mutate({ data: { id: account.id } })}>Testar</Button>
                      {account.status === "connected" ? (
                        <Button disabled={pull.isPending} onClick={() => pull.mutate({ data: { id: account.id } })}>Puxar pedidos</Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {isChannelId(channel.id) ? (
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    connect.mutate({ data: { channel: channel.id, name: names[channel.id] || "Conta principal" } });
                  }}
                >
                  <input
                    className="h-11 min-w-0 flex-1 border border-line bg-bg px-3 text-sm"
                    placeholder="Nome da conta"
                    value={names[channel.id] ?? ""}
                    onChange={(event) => setNames((current) => ({ ...current, [channel.id]: event.target.value }))}
                  />
                  <Button type="submit">Conectar</Button>
                </form>
              ) : null}
            </section>
          );
        })}
      </div>
      <Section title="Últimas chamadas">
        <ul className="space-y-2 text-sm">
          {query.data.logs.map((log) => (
            <li key={log.id} className="flex flex-wrap gap-3 border-b border-line py-2">
              <span className="text-muted">{formatWhen(log.createdAt)}</span>
              <span>{log.channel ? channelLabel(log.channel) : "—"}</span>
              <span>{log.action}</span>
              <ToneText tone={log.ok ? "ok" : "danger"}>{log.detail}</ToneText>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
