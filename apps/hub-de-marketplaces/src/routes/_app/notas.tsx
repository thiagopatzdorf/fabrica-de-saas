import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, LoadingLine, Page, TableWrap, td, th, ToneText } from "@/components/ui";
import { issueInvoices, loadInvoices } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { channelShort } from "@/lib/hub/channels";
import { formatBRL, formatWhen } from "@/lib/hub/format";

export const Route = createFileRoute("/_app/notas")({
  component: NotesPage,
  head: () => ({ meta: [{ title: "Notas · Hub de Marketplaces" }] }),
});

function NotesPage() {
  const query = useHubQuery(["notes"], () => loadInvoices());
  const [picked, setPicked] = useState<string[]>([]);
  const emit = useHubMut(issueInvoices, (result) => {
    const first = result.issued[0];
    toast(first ? `NF ${first.number} · ${first.accessKey}` : "Nada na fila.");
    setPicked([]);
  });
  if (query.isLoading) return <Page title="Notas"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Notas"><ErrorLine message={hubError(query.error)} /></Page>;
  const queue = query.data.notes.filter((note) => note.orderStatus === "paid");
  return (
    <Page
      title="Notas"
      lede="Pedido pago entra na fila. Emitir devolve número e chave, e libera a etiqueta."
      actions={
        <Button variant="primary" disabled={!picked.length || emit.isPending} onClick={() => emit.mutate({ data: { ids: picked } })}>
          Emitir selecionadas
        </Button>
      }
    >
      <p className="text-sm text-muted">{queue.length} na fila.</p>
      <TableWrap>
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className={th} />
              <th className={th}>Pedido</th>
              <th className={th}>Canal</th>
              <th className={th}>Comprador</th>
              <th className={th}>Valor</th>
              <th className={th}>Nota</th>
              <th className={th}>Chave</th>
            </tr>
          </thead>
          <tbody>
            {query.data.notes.map((note) => (
              <tr key={note.orderId} className="border-t border-line">
                <td className={td}>
                  {note.orderStatus === "paid" ? (
                    <input type="checkbox" className="size-4" checked={picked.includes(note.orderId)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, note.orderId] : current.filter((id) => id !== note.orderId))} />
                  ) : null}
                </td>
                <td className={td}>{note.orderNumber}</td>
                <td className={td}>{channelShort(note.channel)}</td>
                <td className={td}>{note.buyer}</td>
                <td className={td}>{formatBRL(note.totalCents)}</td>
                <td className={td}>
                  {note.number ? <ToneText tone="ok">{note.number}</ToneText> : <ToneText tone="warn">na fila</ToneText>}
                  {note.issuedAt ? <p className="text-xs text-muted">{formatWhen(note.issuedAt)}</p> : null}
                </td>
                <td className={`${td} max-w-56 whitespace-normal break-all text-xs`}>{note.accessKey ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Page>
  );
}
