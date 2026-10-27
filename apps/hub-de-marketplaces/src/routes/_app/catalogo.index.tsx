import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button, ErrorLine, LoadingLine, Page, TableWrap, td, th, ToneText } from "@/components/ui";
import { importProducts, loadCatalog } from "@/lib/hub/api";
import { hubError, useHubMut, useHubQuery } from "@/lib/hub/client";
import { CSV_TEMPLATE } from "@/lib/hub/csv";
import { formatBRL } from "@/lib/hub/format";
import { PRODUCT_KIND, labelOf } from "@/lib/hub/labels";

export const Route = createFileRoute("/_app/catalogo/")({
  component: CatalogPage,
  head: () => ({ meta: [{ title: "Catálogo · Hub de Marketplaces" }] }),
});

function CatalogPage() {
  const query = useHubQuery(["catalog"], () => loadCatalog());
  const [q, setQ] = useState("");
  const [csv, setCsv] = useState("");
  const importMut = useHubMut(importProducts, (result) => {
    toast(`Importados ${result.created}. Ignorados ${result.skipped}.`);
    if (result.errors[0]) toast.error(result.errors[0]);
    setCsv("");
  });
  if (query.isLoading) return <Page title="Catálogo mestre"><LoadingLine /></Page>;
  if (query.isError || !query.data) return <Page title="Catálogo mestre"><ErrorLine message={hubError(query.error)} /></Page>;
  const needle = q.trim().toLowerCase();
  const products = query.data.products.filter((product) =>
    !needle || `${product.sku} ${product.title}`.toLowerCase().includes(needle),
  );
  return (
    <Page
      title="Catálogo mestre"
      lede="Um SKU, todas as vitrines. Variação, kit e simples nascem aqui."
      actions={
        <>
          <Link to="/catalogo/novo" search={{ tipo: "simple" }} className="inline-flex h-11 items-center border border-line px-4 text-sm">Novo simples</Link>
          <Link to="/catalogo/novo" search={{ tipo: "kit" }} className="inline-flex h-11 items-center border border-fg bg-fg px-4 text-sm text-bg">Novo kit</Link>
        </>
      }
    >
      <input
        className="h-11 w-full max-w-md border border-line bg-bg px-3 text-sm"
        placeholder="Buscar SKU ou título"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <TableWrap>
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className={th}>SKU</th>
              <th className={th}>Título</th>
              <th className={th}>Tipo</th>
              <th className={th}>Categoria</th>
              <th className={th}>Disponível</th>
              <th className={th}>Preço base</th>
              <th className={th}>Anúncios</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-line">
                <td className={td}>
                  <Link to="/catalogo/$productId" params={{ productId: product.id }} className="text-fg">
                    {product.sku}
                  </Link>
                </td>
                <td className={td}>{product.title}</td>
                <td className={td}>{labelOf(PRODUCT_KIND, product.kind)}</td>
                <td className={td}>{product.categoryName ?? "—"}</td>
                <td className={td}>
                  <ToneText tone={product.available <= product.safety ? "warn" : "mute"}>{product.available}</ToneText>
                </td>
                <td className={td}>{formatBRL(product.priceCents)}</td>
                <td className={td}>{product.listings || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <details className="border border-line p-4">
        <summary className="cursor-pointer text-sm">Importar CSV</summary>
        <p className="mt-3 text-sm text-muted">Colunas: sku, ean, titulo, descricao, marca, ncm, peso_g, altura_cm, largura_cm, comprimento_cm, custo, preco, estoque, seguranca, categoria, tipo.</p>
        <button
          type="button"
          className="mt-3 text-xs text-muted"
          onClick={() => {
            const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "hub-modelo.csv";
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          Baixar modelo
        </button>
        <textarea className="mt-3 min-h-28 w-full border border-line bg-bg p-3 text-sm" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="Cole o CSV" />
        <input
          className="mt-3 block text-sm"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then(setCsv);
          }}
        />
        <Button className="mt-3" variant="primary" disabled={!csv || importMut.isPending} onClick={() => importMut.mutate({ data: { csv } })}>
          Importar
        </Button>
      </details>
    </Page>
  );
}
