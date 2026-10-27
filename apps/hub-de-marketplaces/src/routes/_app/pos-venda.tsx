import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, LoadingLine, Page, Section } from "@/components/ui";
import { loadAftersales, removeTemplate, replyQuestion, saveAutoReply, saveQuickReply } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { channelShort } from "@/lib/hub/channels";
import { formatWhen } from "@/lib/hub/format";

export const Route = createFileRoute("/_app/pos-venda")({
  component: CarePage,
  head: () => ({ meta: [{ title: "Pós-venda · Hub de Marketplaces" }] }),
});

function CarePage() {
  const query = useHubQuery(["care"], () => loadAftersales());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [keyword, setKeyword] = useState("");
  const [autoBody, setAutoBody] = useState("");
  const reply = useHubMut(replyQuestion, () => toast("Resposta enviada."));
  const quick = useHubMut(saveQuickReply, () => {
    toast("Resposta rápida salva.");
    setTitle("");
    setBody("");
  });
  const auto = useHubMut(saveAutoReply, () => {
    toast("Regra salva.");
    setKeyword("");
    setAutoBody("");
  });
  const remove = useHubMut(removeTemplate, () => toast("Removida."));
  if (query.isLoading) return <Page title="Pós-venda"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Pós-venda"><ErrorLine message={hubError(query.error)} /></Page>;
  const data = query.data;
  return (
    <Page title="Pós-venda" lede="Perguntas numa caixa só. Resposta rápida, ou automática quando a palavra aparece.">
      <div className="space-y-4">
        {data.questions.map((question) => {
          const rule = data.autos.find((item) => question.body.toLowerCase().includes(item.keyword.toLowerCase()));
          return (
            <article key={question.id} className="border border-line p-4">
              <p className="text-xs text-muted">{channelShort(question.channel)} · {question.buyer} · {question.sku ?? "—"} · {formatWhen(question.createdAt)}</p>
              <p className="mt-2 text-sm">{question.body}</p>
              {question.answer ? (
                <p className="mt-3 text-sm text-ok">{question.answer}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {data.quick.map((item) => (
                      <button key={item.id} type="button" className="border border-line px-3 py-2 text-xs" onClick={() => setDrafts((current) => ({ ...current, [question.id]: item.body }))}>
                        {item.title}
                      </button>
                    ))}
                    {rule ? (
                      <button type="button" className="border border-line px-3 py-2 text-xs text-warn" disabled={reply.isPending} onClick={() => reply.mutate({ data: { questionId: question.id, body: "", mode: "auto" } })}>
                        Automática · {rule.keyword}
                      </button>
                    ) : null}
                  </div>
                  <textarea className="min-h-20 w-full border border-line bg-bg p-3 text-sm" value={drafts[question.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [question.id]: event.target.value }))} />
                  <Button disabled={reply.isPending} onClick={() => reply.mutate({ data: { questionId: question.id, body: drafts[question.id] ?? "", mode: "manual" } })}>
                    Responder
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <Section title="Respostas rápidas">
        <div className="grid gap-3 md:grid-cols-2">
          <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="Título" value={title} onChange={(event) => setTitle(event.target.value)} />
          <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="Texto" value={body} onChange={(event) => setBody(event.target.value)} />
        </div>
        <Button className="mt-3" disabled={quick.isPending} onClick={() => quick.mutate({ data: { title, body } })}>Salvar</Button>
        <ul className="mt-4 space-y-2 text-sm">
          {data.quick.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 border-b border-line py-2">
              <span>{item.title}</span>
              <button type="button" className="text-xs text-muted" onClick={() => remove.mutate({ data: { id: item.id, kind: "quick" } })}>Remover</button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Automática por palavra">
        <div className="grid gap-3 md:grid-cols-2">
          <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="Palavra" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <input className="h-11 border border-line bg-bg px-3 text-sm" placeholder="Resposta" value={autoBody} onChange={(event) => setAutoBody(event.target.value)} />
        </div>
        <Button className="mt-3" disabled={auto.isPending} onClick={() => auto.mutate({ data: { keyword, body: autoBody } })}>Salvar regra</Button>
        <ul className="mt-4 space-y-2 text-sm">
          {data.autos.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 border-b border-line py-2">
              <span>{item.keyword}</span>
              <button type="button" className="text-xs text-muted" onClick={() => remove.mutate({ data: { id: item.id, kind: "auto" } })}>Remover</button>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
