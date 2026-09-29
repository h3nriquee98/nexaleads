"use client";

import { useMemo, useState, useEffect } from "react";
import FiltersPanel from "./FiltersPanel";
import LeadCard from "./LeadCard";
import LeadTable from "./LeadTable";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, DownloadIcon, GridIcon, SheetIcon, TableIcon } from "./Icons";
import { copyText, download, useApp } from "./app/AppProvider";
import { DEFAULT_FILTERS, applyFilters, leadCityLabel, type LeadFilters } from "@/lib/filters";
import { exportFileName, leadsToCsv, leadsToText, leadsToXlsx } from "@/lib/export";
import type { StoredLead } from "@/lib/types";

const PAGE_SIZE = 24;
const VIEW_KEY = "nexaleads:v1:view";

interface Props {
  initialFilters?: LeadFilters;
  /** Texto do estado vazio quando a base está vazia. */
  emptyHint?: React.ReactNode;
}

/** Lista de leads com filtros, exportação, visualização em cards/tabela e paginação. */
export default function LeadsBrowser({ initialFilters = DEFAULT_FILTERS, emptyHint }: Props) {
  const { leads, lastSearch, handlers, push } = useApp();
  const [filters, setFilters] = useState<LeadFilters>(initialFilters);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "table" || saved === "cards") setView(saved);
    } catch {
      /* ignora */
    }
  }, []);

  const filtered = useMemo(() => applyFilters(leads, filters, lastSearch?.id ?? null), [leads, filters, lastSearch]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageLeads = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const nicheOptions = useMemo(() => [...new Set(leads.map((l) => l.niche))].sort((a, b) => a.localeCompare(b, "pt-BR")), [leads]);
  const cityOptions = useMemo(() => [...new Set(leads.map(leadCityLabel))].sort((a, b) => a.localeCompare(b, "pt-BR")), [leads]);

  const changeFilters = (next: LeadFilters) => {
    setFilters(next);
    setPage(1);
  };

  function switchView(next: "cards" | "table") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignora */
    }
  }

  function exportCsv(list: StoredLead[], prefix: string) {
    if (!list.length) return push("info", "Nenhum lead para exportar com os filtros atuais.");
    download(leadsToCsv(list), "text/csv;charset=utf-8", exportFileName(prefix, "csv"));
    push("success", `${list.length} leads exportados em CSV.`);
  }
  function exportXlsx() {
    if (!filtered.length) return push("info", "Nenhum lead para exportar com os filtros atuais.");
    download(leadsToXlsx(filtered).slice().buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", exportFileName("nexaleads", "xlsx"));
    push("success", `${filtered.length} leads exportados para Excel.`);
  }
  async function copyAll() {
    if (!filtered.length) return push("info", "Nenhum lead para copiar com os filtros atuais.");
    const ok = await copyText(leadsToText(filtered));
    push(ok ? "success" : "error", ok ? `${filtered.length} leads copiados.` : "Não foi possível copiar para a área de transferência.");
  }
  function exportNoSite() {
    exportCsv(applyFilters(leads, { ...filters, onlyNoSite: true }, lastSearch?.id ?? null), "nexaleads-sem-site");
  }

  return (
    <div className="space-y-4">
      <FiltersPanel filters={filters} onChange={changeFilters} niches={nicheOptions} cities={cityOptions} hasLastSearch={Boolean(lastSearch)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          <span className="font-semibold text-ink">{filtered.length}</span> lead{filtered.length === 1 ? "" : "s"}
          {filters.onlyLastSearch && lastSearch ? ` da última busca (${lastSearch.params.city} - ${lastSearch.params.state})` : " na base local"}
          {" · ordenados pela pontuação"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => exportCsv(filtered, "nexaleads")} disabled={!filtered.length}>
            <DownloadIcon /> CSV
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportXlsx} disabled={!filtered.length}>
            <SheetIcon /> Excel
          </button>
          <button type="button" className="btn btn-ghost" onClick={copyAll} disabled={!filtered.length}>
            <CopyIcon /> Copiar filtrados
          </button>
          <button type="button" className="btn btn-primary" onClick={exportNoSite} disabled={!filtered.some((l) => l.siteStatus === "sem_site")}>
            <DownloadIcon /> Baixar só sem site
          </button>
          <div className="flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              className={`btn px-2.5 py-1.5 ${view === "cards" ? "bg-white/10" : "text-muted"}`}
              onClick={() => switchView("cards")}
              aria-pressed={view === "cards"}
              title="Ver em cards"
            >
              <GridIcon /> <span className="sr-only">Cards</span>
            </button>
            <button
              type="button"
              className={`btn px-2.5 py-1.5 ${view === "table" ? "bg-white/10" : "text-muted"}`}
              onClick={() => switchView("table")}
              aria-pressed={view === "table"}
              title="Ver em tabela"
            >
              <TableIcon /> <span className="sr-only">Tabela</span>
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
          <SearchEmptyArt />
          <p className="font-display text-lg font-semibold">{leads.length === 0 ? "Nenhum lead ainda" : "Nenhum lead com esses filtros"}</p>
          <div className="max-w-md text-sm text-muted">
            {leads.length === 0 ? (emptyHint ?? "Faça uma busca em “Buscar leads”. Os resultados ficam salvos neste navegador.") : "Ajuste ou limpe os filtros para ver mais resultados."}
          </div>
          {leads.length > 0 && (
            <button type="button" className="btn btn-ghost mt-2" onClick={() => changeFilters(DEFAULT_FILTERS)}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} handlers={handlers} />
          ))}
        </div>
      ) : (
        <LeadTable leads={pageLeads} handlers={handlers} />
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Paginação">
          <button type="button" className="btn btn-ghost" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Página anterior">
            <ChevronLeftIcon />
          </button>
          <span className="text-sm tabular-nums text-muted">
            Página {currentPage} de {totalPages}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Próxima página">
            <ChevronRightIcon />
          </button>
        </nav>
      )}
    </div>
  );
}

function SearchEmptyArt() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden>
      <defs>
        <linearGradient id="empty-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f7cff" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="20" stroke="url(#empty-g)" strokeWidth="4" />
      <path d="m47 47 12 12" stroke="url(#empty-g)" strokeWidth="5" strokeLinecap="round" />
      <path d="M25 32h14M32 25v14" stroke="#a0aacb" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
