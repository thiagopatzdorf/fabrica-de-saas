import { Link, useRouterState } from "@tanstack/react-router";
import {
  Cable,
  FileText,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Menu,
  MessageSquare,
  Package,
  Tags,
  Truck,
  Warehouse,
  Waypoints,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { loadShell } from "@/lib/hub/api";
import { useHubQuery } from "@/lib/hub/client";
import { cn } from "./ui";

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard, exact: true },
  { to: "/catalogo", label: "Catálogo", icon: Package, exact: false },
  { to: "/mapeamentos", label: "Mapeamentos", icon: Waypoints, exact: false },
  { to: "/anuncios", label: "Anúncios", icon: Megaphone, exact: false, badge: "errors" as const },
  { to: "/preco", label: "Preço", icon: Tags, exact: false },
  { to: "/estoque", label: "Estoque", icon: Warehouse, exact: false },
  { to: "/pedidos", label: "Pedidos", icon: Inbox, exact: false, badge: "orders" as const },
  { to: "/expedicao", label: "Expedição", icon: Truck, exact: false },
  { to: "/pos-venda", label: "Pós-venda", icon: MessageSquare, exact: false, badge: "questions" as const },
  { to: "/notas", label: "Notas", icon: FileText, exact: false },
  { to: "/conectores", label: "Conectores", icon: Cable, exact: false },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const shell = useHubQuery(["shell"], () => loadShell());
  useEffect(() => {
    setOpen(false);
  }, [path]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {NAV.map((item) => {
        const Icon = item.icon;
        const badge = "badge" in item ? item.badge : undefined;
        const count =
          badge === "errors"
            ? shell.data?.errors
            : badge === "orders"
              ? shell.data?.openOrders
              : badge === "questions"
                ? shell.data?.questions
                : 0;
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            className={cn(
              "flex h-11 items-center gap-3 px-3 text-sm text-muted",
              "hover:text-fg",
            )}
            activeProps={{ className: "bg-work text-fg" }}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.5} />
            <span className="flex-1">{item.label}</span>
            {count ? <span className={badge === "errors" ? "text-xs text-danger" : "text-xs text-muted"}>{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg md:flex-row">
      <header className="flex h-14 items-center justify-between border-b border-line px-4 md:hidden">
        <Brand />
        <button type="button" className="grid h-11 w-11 place-items-center" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Menu className="size-5" />
        </button>
      </header>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-bg md:flex">
        <div className="border-b border-line px-5 py-5">
          <Brand />
        </div>
        {nav}
        <footer className="border-t border-line p-4">
          <p className="mb-3 text-xs text-muted">{shell.data?.tradeName ?? "Organização"}</p>
          <div className="text-fg">
            <UserButton />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">Canais simulados: veja docs/adaptadores.md.</p>
        </footer>
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 flex bg-bg md:hidden">
          <div className="flex w-full flex-col">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <Brand />
              <button type="button" className="grid h-11 w-11 place-items-center" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}
      <main className="min-w-0 flex-1 overflow-y-auto bg-work">{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <div>
      <p className="font-display text-xs font-semibold tracking-brand text-fg">HUB DE MARKETPLACES</p>
      <p className="text-xs text-muted">Multi-canal</p>
    </div>
  );
}
