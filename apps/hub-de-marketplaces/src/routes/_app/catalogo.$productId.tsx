import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProductForm } from "@/components/product-form";
import { ErrorLine, LoadingLine, Page, Section, ToneText, listingLabel } from "@/components/ui";
import { loadProduct, updateProduct } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { channelLabel } from "@/lib/hub/channels";
import { formatBRL } from "@/lib/hub/format";
import { listingTone } from "@/lib/hub/labels";
import type { ProductInput } from "@/lib/hub/schemas";

export const Route = createFileRoute("/_app/catalogo/$productId")({
  component: ProductPage,
  head: () => ({ meta: [{ title: "Produto · Hub de Marketplaces" }] }),
});

function ProductPage() {
  const { productId } = Route.useParams();
  const query = useHubQuery(["product", productId], () => loadProduct({ data: { id: productId } }));
  const mut = useHubMut(updateProduct, () => toast("Catálogo atualizado."));
  if (query.isLoading) return <Page title="Produto"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Produto"><ErrorLine message={hubError(query.error)} /></Page>;
  const data = query.data;
  const product = data.product;
  return (
    <Page
      title={product.sku}
      lede={product.title}
      actions={<Link to="/anuncios" className="inline-flex h-11 items-center border border-line px-4 text-sm">Publicar</Link>}
    >
      <div className="grid h-16 w-16 place-items-center border border-line bg-raise font-display text-sm">
        {product.sku.slice(0, 3)}
      </div>
      <ProductForm
        initial={{
          ...product,
          kind: product.kind as ProductInput["kind"],
          aliases: data.aliases,
          components: data.components,
        }}
        categories={data.categories}
        options={data.options}
        pending={mut.isPending}
        submitLabel="Salvar alterações"
        onSubmit={async (input) => {
          await mut.mutateAsync({ data: { ...input, id: product.id } });
        }}
      />
      {data.children.length ? (
        <Section title="Variações">
          <ul className="space-y-2 text-sm">
            {data.children.map((child) => (
              <li key={child.id}>
                <Link to="/catalogo/$productId" params={{ productId: child.id }}>
                  {child.sku} · {child.title} · {child.available} disp.
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {data.components.length ? (
        <Section title="Dentro do kit">
          <ul className="space-y-2 text-sm text-muted">
            {data.components.map((item) => (
              <li key={item.componentId}>{item.qty}× {item.sku} · {item.title}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">A venda baixa o saldo do kit, não o das peças.</p>
        </Section>
      ) : null}
      <Section title="Anúncios deste SKU">
        {data.listings.length === 0 ? (
          <p className="text-sm text-muted">Ainda não está em nenhum canal.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.listings.map((listing) => (
              <li key={listing.id} className="flex flex-wrap gap-3">
                <span>{channelLabel(listing.channel)}</span>
                <span>{formatBRL(listing.priceCents)}</span>
                <span>{listing.stockSynced} no canal</span>
                <ToneText tone={listingTone(listing.status)}>{listingLabel(listing.status)}</ToneText>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
