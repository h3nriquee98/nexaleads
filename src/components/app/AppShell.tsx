"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import PitchModal from "../PitchModal";
import { ToastViewport } from "../Toasts";
import { AlertIcon, InfoIcon, LoaderIcon, MenuIcon, ShieldIcon, TrashIcon, XIcon } from "../Icons";
import Sidebar, { NAV_ITEMS } from "./Sidebar";
import { copyText, useApp } from "./AppProvider";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { status, search, storageWarning, pitchLead, closePitch, handlers, push, toastState, leads, finance, resetData } = useApp();
  const current = NAV_ITEMS.find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));

  // Fecha a gaveta do celular com Esc e trava a rolagem enquanto aberta.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [menuOpen]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Menu lateral (computador) */}
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface/70 backdrop-blur lg:block" aria-label="Menu lateral">
        <Sidebar />
      </aside>

      {/* Barra do topo + gaveta (celular) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
        <button type="button" className="btn btn-ghost px-2.5" onClick={() => setMenuOpen(true)} aria-label="Abrir menu" aria-expanded={menuOpen} aria-controls="mobile-menu">
          <MenuIcon size={18} />
        </button>
        <span className="font-display font-semibold">{current?.label ?? "NexaLeads"}</span>
        <span className="grid size-9 place-items-center rounded-lg bg-brand-gradient font-display font-bold" aria-hidden>
          N
        </span>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />
          <div id="mobile-menu" className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-2xl">
            <button type="button" className="btn btn-ghost absolute right-3 top-4 px-2" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
              <XIcon />
            </button>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-8">
          {status.mode === "demo" && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100" role="note">
              <InfoIcon className="mt-0.5 shrink-0" />
              <p>
                <strong>Modo demonstração:</strong> nenhuma fonte de dados foi configurada, então as buscas geram <strong>dados fictícios</strong> (marcados como
                “Fictício”) apenas para testar a interface. Configure <code className="rounded bg-black/30 px-1">APIFY_API_TOKEN</code> e/ou{" "}
                <code className="rounded bg-black/30 px-1">GOOGLE_MAPS_API_KEY</code> para buscar empresas reais.
              </p>
            </div>
          )}
          {status.configError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-100" role="alert">
              <AlertIcon className="mt-0.5 shrink-0" /> <p>Erro de configuração no servidor: {status.configError}</p>
            </div>
          )}
          {search.phase === "running" && pathname !== "/buscar" && (
            <Link
              href="/buscar"
              className="flex items-center gap-3 rounded-xl border border-indigo-400/30 bg-indigo-400/10 px-4 py-3 text-sm text-indigo-100 hover:bg-indigo-400/15"
            >
              <LoaderIcon className="shrink-0 animate-spin" size={16} />
              <span className="flex-1">
                Busca em andamento: {search.params.niches.join(", ")} em {search.params.city} - {search.params.state}
              </span>
              <span className="font-semibold">Acompanhar →</span>
            </Link>
          )}
          {storageWarning && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" role="alert">
              Não foi possível salvar no armazenamento local (espaço cheio ou navegação privada). Exporte seus dados para não perdê-los.
            </p>
          )}

          {children}
        </main>

        <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 border-t border-line px-4 py-6 text-xs text-faint sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
          <p className="flex max-w-3xl items-start gap-2">
            <ShieldIcon className="mt-0.5 shrink-0" size={14} />
            <span>
              Exibimos apenas dados públicos fornecidos pelas fontes da pesquisa (Apify / Google Maps). Nenhuma mensagem é enviada automaticamente — o contato é
              sempre manual. Respeite os termos de uso do Apify e do Google Maps e a LGPD ao abordar empresas. Leads, status e financeiro ficam armazenados
              somente neste navegador.
            </span>
          </p>
          {(leads.length > 0 || finance.length > 0) && (
            <button type="button" className="btn btn-ghost shrink-0 text-red-200" onClick={resetData}>
              <TrashIcon /> Apagar dados locais
            </button>
          )}
        </footer>
      </div>

      {pitchLead && (
        <PitchModal
          lead={pitchLead}
          onClose={closePitch}
          onCopy={async (text) => {
            const ok = await copyText(text);
            push(ok ? "success" : "error", ok ? "Mensagem copiada. Cole no WhatsApp, e-mail ou Instagram." : "Não foi possível copiar a mensagem.");
          }}
          onMarkContacted={(id) => handlers.onStatus(id, "contatado")}
        />
      )}
      <ToastViewport toasts={toastState.toasts} dismiss={toastState.dismiss} />
    </div>
  );
}
