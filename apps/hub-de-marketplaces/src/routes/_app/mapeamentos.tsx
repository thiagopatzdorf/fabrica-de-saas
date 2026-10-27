import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorLine, LoadingLine, Page, Section } from "@/components/ui";
import { loadMappings, saveAttribute, saveMap } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { CHANNEL_CATEGORIES, channelLabel, isChannelId } from "@/lib/hub/channels";

export const Route = createFileRoute("/_app/mapeamentos")({
  component: MapsPage,
  head: () => ({ meta: [{ title: "Mapeamentos · Hub de Marketplaces" }] }),
});

function MapsPage() {
  const query = useHubQuery(["maps"], () => loadMappings());
  const [open, setOpen] = useState<string | null>(null);
  const mapMut = useHubMut(saveMap, () => toast("Mapa salvo."));
  const attrMut = useHubMut(saveAttribute, () => toast("Atributo salvo."));
  if (query.isLoading) return <Page title="Mapeamentos"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Mapeamentos"><ErrorLine message={hubError(query.error)} /></Page>;
  const data = query.data;
  return (
    <Page title="Mapeamentos" lede="A categoria interna vira a categoria do canal. Sem mapa, o anúncio não sai.">
      {data.uncategorized > 0 ? (
        <p className="text-sm text-warn">{data.uncategorized} SKUs sem categoria.</p>
      ) : null}
      <Section title="Pendências">
        {data.gaps.length === 0 ? (
          <p className="text-sm text-muted">Nenhum SKU sem mapa nos canais.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.gaps.map((gap) => (
              <li key={`${gap.categoryId}-${gap.channel}`} className="text-warn">
                {gap.categoryName} · sem mapa em {channelLabel(gap.channel)} · {gap.skus} SKUs
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="space-y-3">
        {data.categories.map((category) => (
          <section key={category.id} className="border border-line">
            <button type="button" className="flex h-12 w-full items-center justify-between px-4 text-left text-sm" onClick={() => setOpen(open === category.id ? null : category.id)}>
              <span>{category.name}</span>
              <span className="text-muted">{category.skus} SKUs</span>
            </button>
            {open === category.id ? (
              <div className="space-y-4 border-t border-line px-4 py-4">
                {category.maps.map((map) => (
                  <div key={map.channel} className="grid gap-3 md:grid-cols-[160px_1fr]">
                    <p className="text-sm">{channelLabel(map.channel)}</p>
                    <div>
                      <select
                        className="h-11 w-full border border-line bg-bg px-3 text-sm"
                        value={map.channelCategoryId}
                        onChange={(event) => {
                          if (!event.target.value || !isChannelId(map.channel)) return;
                          mapMut.mutate({
                            data: { categoryId: category.id, channel: map.channel, channelCategoryId: event.target.value },
                          });
                        }}
                      >
                        <option value="">Sem mapa</option>
                        {(isChannelId(map.channel) ? CHANNEL_CATEGORIES[map.channel] : []).map((remote) => (
                          <option key={remote.id} value={remote.id}>
                            {remote.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {map.attributes.map((attribute) => (
                          <label key={attribute.id} className="block text-xs text-muted">
                            {attribute.name}
                            {attribute.value ? "" : " · pendente"}
                            <input
                              className="mt-2 h-11 w-full border border-line bg-bg px-3 text-sm text-fg"
                              defaultValue={attribute.value}
                              onBlur={(event) => {
                                if (event.target.value === attribute.value) return;
                                attrMut.mutate({ data: { attributeId: attribute.id, value: event.target.value } });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </Page>
  );
}
