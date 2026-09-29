"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { DatabaseIcon, HomeIcon, LoaderIcon, LogoutIcon, SearchIcon, UsersIcon, WalletIcon } from "../Icons";

export const NAV_ITEMS = [
  { href: "/", label: "Início", icon: HomeIcon },
  { href: "/buscar", label: "Buscar leads", icon: SearchIcon },
  { href: "/leads", label: "Meus leads", icon: UsersIcon },
  { href: "/financeiro", label: "Financeiro", icon: WalletIcon },
] as const;

function ConnectionBadge() {
  const { status } = useApp();
  const live = status.mode === "live";
  const label = live
    ? status.sources?.apify && status.sources?.google
      ? "Apify + Google conectados"
      : status.sources?.google
        ? "Google Places conectado"
        : "Apify conectado"
    : status.mode === "demo"
      ? "Modo demonstração"
      : "Verificando conexão…";
  return (
    <span
      className={`badge w-full justify-start ${
        live ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : status.mode === "demo" ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-line-strong text-muted"
      }`}
      title={status.actorId ? `Actor: ${status.actorId}` : undefined}
    >
      <span className={`size-1.5 rounded-full ${live ? "bg-emerald-300" : status.mode === "demo" ? "bg-amber-300" : "bg-slate-400"}`} />
      {label}
    </span>
  );
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { leads, search, status, logout, hydrated } = useApp();
  const activeLeads = leads.filter((l) => !l.discarded).length;

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-2 py-1">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-gradient font-display text-lg font-bold shadow-lg shadow-indigo-900/50" aria-hidden>
          N
        </span>
        <span>
          <span className="block font-display text-lg font-bold leading-tight tracking-tight">
            Nexa<span className="text-gradient">Leads</span>
          </span>
          <span className="block text-xs text-muted">Nexa Agency</span>
        </span>
      </Link>

      <nav aria-label="Menu principal" className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Menu</p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-gradient-to-r from-indigo-500/25 to-violet-500/15 text-white ring-1 ring-inset ring-indigo-400/30"
                  : "text-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              <Icon size={18} className={active ? "text-indigo-200" : "text-faint group-hover:text-indigo-200"} />
              <span className="flex-1">{label}</span>
              {href === "/buscar" && search.phase === "running" && <LoaderIcon size={14} className="animate-spin text-indigo-300" aria-label="Busca em andamento" />}
              {href === "/leads" && hydrated && activeLeads > 0 && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums text-ink">{activeLeads}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 text-xs">
        <ConnectionBadge />
        <span className="badge w-full justify-start border-line-strong text-muted" title="Leads, status e financeiro ficam salvos apenas no navegador deste dispositivo.">
          <DatabaseIcon size={12} /> Dados só neste dispositivo
        </span>
        {status.authRequired && (
          <button type="button" className="btn btn-ghost w-full justify-start px-3 py-2 text-xs" onClick={logout}>
            <LogoutIcon size={14} /> Sair
          </button>
        )}
      </div>
    </div>
  );
}
