import { useState } from "react";
import { CHANNELS } from "@/lib/hub/channels";
import { moneyToInput, parseMoney } from "@/lib/hub/format";
import type { ProductInput } from "@/lib/hub/schemas";
import { Area, Button, Field, SelectField } from "./ui";

type Option = { id: string; sku: string; title: string; kind: string };
type Category = { id: string; name: string };

export type ProductInitial = {
  kind: ProductInput["kind"];
  parentId?: string | null;
  sku: string;
  ean: string;
  title: string;
  description: string;
  brand: string;
  ncm: string;
  weightG: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  costCents: number;
  priceCents: number;
  stockPhysical: number;
  stockSafety: number;
  stockReserved?: number;
  categoryId?: string | null;
  photoUrl?: string;
  aliases?: { channel: string; alias: string }[];
  components?: { componentId: string; qty: number }[];
};

function num(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Use um número válido.");
  return Math.round(parsed);
}

export function ProductForm({
  initial,
  categories,
  options,
  pending,
  submitLabel,
  onSubmit,
}: {
  initial: ProductInitial;
  categories: Category[];
  options: Option[];
  pending: boolean;
  submitLabel: string;
  onSubmit: (input: ProductInput) => Promise<void>;
}) {
  const [kind, setKind] = useState<ProductInput["kind"]>(initial.kind);
  const [parentId, setParentId] = useState(initial.parentId ?? "");
  const [sku, setSku] = useState(initial.sku);
  const [ean, setEan] = useState(initial.ean);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [brand, setBrand] = useState(initial.brand);
  const [ncm, setNcm] = useState(initial.ncm);
  const [weight, setWeight] = useState(String(initial.weightG));
  const [height, setHeight] = useState(String(initial.heightCm));
  const [width, setWidth] = useState(String(initial.widthCm));
  const [length, setLength] = useState(String(initial.lengthCm));
  const [cost, setCost] = useState(moneyToInput(initial.costCents));
  const [price, setPrice] = useState(moneyToInput(initial.priceCents));
  const [stock, setStock] = useState(String(initial.stockPhysical));
  const [safety, setSafety] = useState(String(initial.stockSafety));
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl ?? "");
  const [aliases, setAliases] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const channel of CHANNELS) base[channel.id] = "";
    for (const alias of initial.aliases ?? []) base[alias.channel] = alias.alias;
    return base;
  });
  const [components, setComponents] = useState(initial.components ?? []);
  const [componentId, setComponentId] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onSubmit({
        kind,
        parentId: kind === "variation" ? parentId : null,
        sku,
        ean,
        title,
        description,
        brand,
        ncm,
        weightG: num(weight),
        heightCm: num(height),
        widthCm: num(width),
        lengthCm: num(length),
        costCents: parseMoney(cost),
        priceCents: parseMoney(price),
        stockPhysical: num(stock),
        stockSafety: num(safety),
        categoryId: categoryId || null,
        photoUrl,
        aliases: CHANNELS.map((channel) => ({ channel: channel.id, alias: aliases[channel.id] ?? "" })),
        components: kind === "kit" ? components : [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    }
  }

  const parents = options.filter((option) => option.kind === "parent");
  const parts = options.filter((option) => option.kind === "simple" || option.kind === "variation");

  return (
    <form className="space-y-6" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Tipo" value={kind} onChange={(value) => setKind(value as ProductInput["kind"])}>
          <option value="simple">Simples</option>
          <option value="kit">Kit</option>
          <option value="parent">Pai</option>
          <option value="variation">Variação</option>
        </SelectField>
        {kind === "variation" ? (
          <SelectField label="Produto pai" value={parentId} onChange={setParentId}>
            <option value="">Escolher</option>
            {parents.map((option) => (
              <option key={option.id} value={option.id}>
                {option.sku} · {option.title}
              </option>
            ))}
          </SelectField>
        ) : (
          <SelectField label="Categoria" value={categoryId} onChange={setCategoryId}>
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
        )}
        {kind === "variation" ? (
          <SelectField label="Categoria" value={categoryId} onChange={setCategoryId}>
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
        ) : null}
        <Field label="SKU" value={sku} onChange={setSku} />
        <Field label="EAN" value={ean} onChange={setEan} />
        <Field label="Título" value={title} onChange={setTitle} />
        <Field label="Marca" value={brand} onChange={setBrand} />
        <Field label="NCM" value={ncm} onChange={setNcm} />
        <Field label="Peso (g)" value={weight} onChange={setWeight} />
        <Field label="Altura (cm)" value={height} onChange={setHeight} />
        <Field label="Largura (cm)" value={width} onChange={setWidth} />
        <Field label="Comprimento (cm)" value={length} onChange={setLength} />
        <Field label="Custo (R$)" value={cost} onChange={setCost} />
        <Field label="Preço base (R$)" value={price} onChange={setPrice} />
        <Field label="Estoque físico" value={stock} onChange={setStock} />
        <Field label="Segurança" value={safety} onChange={setSafety} hint="Abaixo disso, o anúncio pausa." />
      </div>
      {initial.stockReserved != null ? (
        <p className="text-sm text-muted">Reservado por pedidos: {initial.stockReserved}</p>
      ) : null}
      <Area label="Descrição" value={description} onChange={setDescription} />
      <Field label="Foto (https)" value={photoUrl} onChange={setPhotoUrl} hint="Opcional. Sem link, o SKU fica como marca." />
      <div>
        <p className="text-xs text-muted">SKU alias por canal</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {CHANNELS.map((channel) => (
            <Field
              key={channel.id}
              label={channel.label}
              value={aliases[channel.id] ?? ""}
              onChange={(value) => setAliases((current) => ({ ...current, [channel.id]: value }))}
            />
          ))}
        </div>
      </div>
      {kind === "kit" ? (
        <div>
          <p className="text-xs text-muted">Composição do kit</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select className="h-11 min-w-48 border border-line bg-bg px-3 text-sm" value={componentId} onChange={(event) => setComponentId(event.target.value)}>
              <option value="">Componente</option>
              {parts.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.sku} · {option.title}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={() => {
                if (!componentId) return;
                setComponents((current) =>
                  current.some((item) => item.componentId === componentId)
                    ? current
                    : [...current, { componentId, qty: 1 }],
                );
                setComponentId("");
              }}
            >
              Incluir
            </Button>
          </div>
          <ul className="mt-4 space-y-2">
            {components.map((component) => {
              const option = options.find((item) => item.id === component.componentId);
              return (
                <li key={component.componentId} className="flex items-center justify-between gap-3 border border-line px-3 py-2 text-sm">
                  <span>{option ? `${option.sku} · ${option.title}` : component.componentId}</span>
                  <span className="flex items-center gap-3">
                    <input
                      className="h-11 w-16 border border-line bg-bg px-2 text-sm"
                      value={String(component.qty)}
                      onChange={(event) =>
                        setComponents((current) =>
                          current.map((item) =>
                            item.componentId === component.componentId
                              ? { ...item, qty: Math.max(1, Number(event.target.value) || 1) }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="text-xs text-muted"
                      onClick={() => setComponents((current) => current.filter((item) => item.componentId !== component.componentId))}
                    >
                      Tirar
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button variant="primary" type="submit" disabled={pending}>
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}
