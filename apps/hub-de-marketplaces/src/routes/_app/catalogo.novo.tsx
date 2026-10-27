import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProductForm, type ProductInitial } from "@/components/product-form";
import { ErrorLine, LoadingLine, Page } from "@/components/ui";
import { createProduct, loadCatalog } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import type { ProductInput } from "@/lib/hub/schemas";

export const Route = createFileRoute("/_app/catalogo/novo")({
  validateSearch: (search: Record<string, unknown>) => ({
    tipo: search.tipo === "kit" || search.tipo === "variation" || search.tipo === "parent" ? search.tipo : "simple",
  }),
  component: Novo,
  head: () => ({ meta: [{ title: "Novo item · Hub de Marketplaces" }] }),
});

function Novo() {
  const { tipo } = Route.useSearch();
  const navigate = useNavigate();
  const query = useHubQuery(["catalog"], () => loadCatalog());
  const mut = useHubMut(createProduct, (result) => {
    toast("Entrou no catálogo.");
    void navigate({ to: "/catalogo/$productId", params: { productId: result.id } });
  });
  if (query.isLoading) return <Page title="Novo item"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Novo item"><ErrorLine message={hubError(query.error)} /></Page>;
  const initial: ProductInitial = {
    kind: tipo as ProductInitial["kind"],
    sku: "",
    ean: "",
    title: "",
    description: "",
    brand: "Norte",
    ncm: tipo === "kit" ? "96089900" : "42029200",
    weightG: tipo === "kit" ? 900 : 500,
    heightCm: 30,
    widthCm: 20,
    lengthCm: 12,
    costCents: tipo === "kit" ? 4500 : 5000,
    priceCents: tipo === "kit" ? 12990 : 14990,
    stockPhysical: 12,
    stockSafety: 2,
    categoryId: query.data.categories.find((category) =>
      tipo === "kit" ? category.name.toLowerCase().includes("kit") : category.name === "Mochilas",
    )?.id,
  };
  return (
    <Page title={tipo === "kit" ? "Novo kit" : "Novo item"} lede="O saldo é único. Os anúncios só espelham.">
      <ProductForm
        initial={initial}
        categories={query.data.categories}
        options={query.data.products}
        pending={mut.isPending}
        submitLabel="Salvar no catálogo"
        onSubmit={async (input: ProductInput) => {
          await mut.mutateAsync({ data: input });
        }}
      />
    </Page>
  );
}
