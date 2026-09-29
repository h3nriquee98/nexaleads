"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dashboard from "./Dashboard";
import FiltersPanel from "./FiltersPanel";
import LeadCard from "./LeadCard";
import LeadTable from "./LeadTable";
import PitchModal from "./PitchModal";
import SearchForm from "./SearchForm";
import { ToastViewport, useToasts } from "./Toasts";
import {
  AlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DatabaseIcon,
  DownloadIcon,
  GridIcon,
  InfoIcon,
  LoaderIcon,
  LogoutIcon,
  SheetIcon,
  ShieldIcon,
  TableIcon,
  TrashIcon,
  XIcon,
} from "./Icons";
import { DEFAULT_FILTERS, applyFilters, leadCityLabel, type LeadFilters } from "@/lib/filters";
import { exportFileName, leadToText, leadsToCsv, leadsToText, leadsToXlsx } from "@/lib/export";
import { STATUS_LABEL } from "@/lib/labels";
import { clearAll, loadLastSearch, loadLeads, mergeLeads, saveLastSearch, saveLeads, updateLead, type LastSearch } from "@/lib/storage";
import { searchKey } from "@/lib/validation";
import type { Lead, LeadStatus, SearchMode, SearchParams, SearchResponse, StoredLead } from "@/lib/types";

const PAGE_SIZE = 24;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 20 * 60 * 1000;
const RECENT_SEARCH_MS = 10 * 60 * 1000;

interface AppStatus {
  mode: "demo" | "live" | "unknown";
  sources?: { apify: boolean; google: boolean };
  maxLeads: number;
  actorId?: string;
  configError?: string | null;
  authRequired?: boolean;
}

function goToLogin() {
  window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
}

type SearchState =
  | { phase: "idle" }
  | { phase: "running"; params: SearchParams; startedAt: number; runId?: string; message?: string }
  | { phase: "error"; code: string; message: string; params?: SearchParams };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function download(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`;
}

const ERROR_TITLES: Record<string, string> = {
  APIFY_RATE_LIMIT: "Limite de requisições atingido",
  RATE_LIMIT: "Muitas buscas seguidas",
  APIFY_UNAUTHORIZED: "Token do Apify inválido",
  APIFY_NO_CREDITS: "Créditos insuficientes no Apify",
  APIFY_ACTOR_NOT_RENTED: "Actor não disponível na sua conta",
  APIFY_NOT_FOUND: "Actor não encontrado",
  VALIDATION_ERROR: "Confira os campos da busca",
  NETWORK_ERROR: "Sem conexão com o servidor",
  NO_RESULTS: "Nenhum resultado encontrado",
  GOOGLE_RATE_LIMIT: "Limite da Google Places API atingido",
  GOOGLE_INVALID_KEY: "Chave do Google inválida",
  GOOGLE_API_DISABLED: "Places API (New) desativada",
  GOOGLE_BILLING: "Faturamento do Google Cloud desativado",
  GOOGLE_FORBIDDEN: "Google recusou a chave",
};

export default function NexaLeadsApp() {
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<AppStatus>({ mode: "unknown", maxLeads: 100 });
  const [leads, setLeads] = useState<StoredLead[]>([]);
  const [lastSearch, setLastSearch] = useState<LastSearch | null>(null);
  const [search, setSearch] = useState<SearchState>({ phase: "idle" });
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [storageWarning, setStorageWarning] = useState(false);
  const [pitchLeadId, setPitchLeadId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const inFlight = useRef(false);
  const leadsRef = useRef<StoredLead[]>([]);
  /** Busca em andamento: ID e leads já recebidos (Google chega antes do Apify quando as duas fontes estão ativas). */
  const activeSearch = useRef<{ id: string; collected: Map<string, Lead> } | null>(null);
  const searchToken = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Carrega dados locais e o modo (demo/Apify) após montar no navegador.
  useEffect(() => {
    const stored = loadLeads();
    leadsRef.current = stored;
    setLeads(stored);
    setLastSearch(loadLastSearch());
    try {
      const savedView = localStorage.getItem("nexaleads:v1:view");
      if (savedView === "table" || savedView === "cards") setView(savedView);
    } catch {
      /* ignora */
    }
    setHydrated(true);
    fetch("/api/status", { cache: "no-store" })
      .then((r) => {
        if (r.status === 401) goToLogin();
        return r.ok ? r.json() : Promise.reject();
      })
      .then((data: AppStatus) => setStatus(data))
      .catch(() => setStatus((s) => ({ ...s, mode: "unknown" })));
  }, []);

  useEffect(() => {
    if (search.phase !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [search.phase]);

  const persist = useCallback((next: StoredLead[]) => {
    leadsRef.current = next;
    setLeads(next);
    setStorageWarning(!saveLeads(next));
  }, []);

  /** Salva resultados (parciais ou finais) da busca atual na base local. */
  const addResults = useCallback(
    (params: SearchParams, found: Lead[], mode: SearchMode) => {
      const current = activeSearch.current ?? { id: `s_${Date.now().toString(36)}`, collected: new Map<string, Lead>() };
      activeSearch.current = current;
      for (const lead of found) current.collected.set(lead.id, lead);
      if (found.length > 0) persist(mergeLeads(leadsRef.current, found, current.id));
      const record: LastSearch = { id: current.id, params, at: new Date().toISOString(), count: current.collected.size, mode };
      setLastSearch(record);
      saveLastSearch(record);
      if (current.collected.size > 0) {
        setFilters({ ...DEFAULT_FILTERS, onlyLastSearch: true, onlyNoSite: params.onlyNoSite, withWhatsApp: params.onlyWhatsApp });
        setPage(1);
      }
    },
    [persist],
  );

  const finishSearch = useCallback(
    (params: SearchParams, found: Lead[], mode: SearchMode, message?: string) => {
      addResults(params, found, mode);
      const all = [...(activeSearch.current?.collected.values() ?? [])];
      activeSearch.current = null;
      setSearch({ phase: "idle" });
      if (all.length === 0) {
        setSearch({
          phase: "error",
          code: "NO_RESULTS",
          message: `Nenhuma empresa${params.onlyNoSite ? " sem site" : ""}${params.onlyWhatsApp ? " com WhatsApp" : ""} encontrada para ${params.niches.join(", ")} em ${params.city} - ${params.state}. Tente outro nicho, uma cidade vizinha ou um termo mais genérico${
            params.onlyNoSite || params.onlyWhatsApp ? ", ou desligue as opções de filtro da busca" : ""
          }.`,
          params,
        });
        return;
      }
      const noSite = all.filter((l) => l.siteStatus === "sem_site").length;
      push("success", `${all.length} lead${all.length === 1 ? "" : "s"} encontrado${all.length === 1 ? "" : "s"} · ${noSite} sem site.`);
      if (message) push("info", message);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    },
    [addResults, push],
  );

  /** Erro depois de já ter recebido leads (ex.: Google chegou, Apify falhou): avisa sem perder o que veio. */
  const failSearch = useCallback((params: SearchParams, code: string, message: string) => {
    const saved = activeSearch.current?.collected.size ?? 0;
    activeSearch.current = null;
    setSearch({
      phase: "error",
      code,
      message: saved > 0 ? `${message} Os ${saved} leads já recebidos do Google Places foram salvos.` : message,
      params,
    });
  }, []);

  const poll = useCallback(
    async (token: number, params: SearchParams, runId: string, startedAt: number) => {
      const qs = new URLSearchParams({
        runId,
        city: params.city,
        state: params.state,
        country: params.country,
        limit: String(params.limit),
        onlyNoSite: params.onlyNoSite ? "1" : "0",
        onlyWhatsApp: params.onlyWhatsApp ? "1" : "0",
        source: params.source,
      });
      params.niches.forEach((n) => qs.append("niche", n));
      let failures = 0;
      while (searchToken.current === token) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (searchToken.current !== token) return;
        if (Date.now() - startedAt > MAX_POLL_MS) {
          failSearch(params, "TIMEOUT", "A busca está demorando mais que o esperado. Tente novamente com menos nichos ou uma quantidade menor.");
          break;
        }
        try {
          const res = await fetch(`/api/search-leads?${qs}`, { cache: "no-store" });
          const data = (await res.json()) as SearchResponse;
          if (searchToken.current !== token) return;
          failures = 0;
          if (!data.ok && data.code === "UNAUTHORIZED") return goToLogin();
          if (!data.ok) {
            failSearch(params, data.code, data.message);
            break;
          }
          if (data.status === "RUNNING") {
            setSearch((s) => (s.phase === "running" ? { ...s, message: data.message ?? s.message } : s));
            continue;
          }
          finishSearch(params, data.leads ?? [], data.mode, data.message);
          break;
        } catch {
          failures += 1;
          if (failures >= 3) {
            failSearch(params, "NETWORK_ERROR", "Perdemos a conexão enquanto acompanhávamos a busca. Verifique sua internet e tente novamente.");
            break;
          }
        }
      }
      inFlight.current = false;
    },
    [failSearch, finishSearch],
  );

  const runSearch = useCallback(
    async (params: SearchParams) => {
      if (inFlight.current) return; // evita requisições duplicadas
      if (status.mode === "live" && lastSearch && searchKey(lastSearch.params) === searchKey(params)) {
        const age = Date.now() - new Date(lastSearch.at).getTime();
        if (age < RECENT_SEARCH_MS && !window.confirm("Você fez exatamente esta busca há poucos minutos. Buscar de novo gera um novo custo nas APIs. Deseja continuar?")) {
          return;
        }
      }
      inFlight.current = true;
      activeSearch.current = { id: `s_${Date.now().toString(36)}`, collected: new Map() };
      const token = ++searchToken.current;
      const startedAt = Date.now();
      setNow(startedAt);
      setSearch({ phase: "running", params, startedAt, message: "Iniciando a busca…" });
      try {
        const res = await fetch("/api/search-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as SearchResponse;
        if (searchToken.current !== token) return;
        if (!data.ok && data.code === "UNAUTHORIZED") return goToLogin();
        if (!data.ok) {
          setSearch({ phase: "error", code: data.code, message: data.message, params });
          inFlight.current = false;
          return;
        }
        if (data.status !== "RUNNING" || !data.runId) {
          finishSearch(params, data.leads ?? [], data.mode, data.mode === "demo" ? undefined : data.message);
          inFlight.current = false;
          return;
        }
        // Com as duas fontes, o Google Places já respondeu: mostra esses leads enquanto o Apify termina.
        if (data.leads && data.leads.length > 0) {
          addResults(params, data.leads, data.mode);
          push("info", `${data.leads.length} leads do Google Places já estão na lista. O Apify continua buscando mais…`);
        }
        if (data.message) push("info", data.message);
        setSearch({
          phase: "running",
          params,
          startedAt,
          runId: data.runId,
          message: data.leads?.length ? "Coletando mais empresas no Google Maps via Apify…" : "Coletando empresas no Google Maps via Apify…",
        });
        void poll(token, params, data.runId, startedAt);
      } catch {
        if (searchToken.current === token) {
          setSearch({ phase: "error", code: "NETWORK_ERROR", message: "Não foi possível falar com o servidor do NexaLeads. Verifique sua conexão e tente novamente.", params });
        }
        inFlight.current = false;
      }
    },
    [addResults, finishSearch, lastSearch, poll, push, status.mode],
  );

  const cancelSearch = useCallback(async () => {
    const current = search;
    searchToken.current += 1;
    inFlight.current = false;
    activeSearch.current = null;
    setSearch({ phase: "idle" });
    if (current.phase === "running" && current.runId) {
      try {
        await fetch(`/api/search-leads?runId=${encodeURIComponent(current.runId)}`, { method: "DELETE" });
        push("info", "Busca cancelada no Apify.");
      } catch {
        push("error", "Não foi possível confirmar o cancelamento no Apify.");
      }
    } else {
      push("info", "Busca cancelada.");
    }
  }, [push, search]);

  // ----- Ações dos leads -----
  const handlers = useMemo(
    () => ({
      onStatus: (id: string, next: LeadStatus) => {
        persist(updateLead(leadsRef.current, id, { status: next }));
        push("success", `Status atualizado para “${STATUS_LABEL[next]}”.`);
      },
      onDiscard: (id: string, discarded: boolean) => {
        persist(updateLead(leadsRef.current, id, { discarded }));
        push("info", discarded ? "Lead descartado. Veja em “Ver descartados”." : "Lead restaurado.");
      },
      onCopy: async (lead: StoredLead) => {
        const ok = await copyText(leadToText(lead));
        push(ok ? "success" : "error", ok ? "Dados do lead copiados." : "Não foi possível copiar. Permita o acesso à área de transferência.");
      },
      onPitch: (lead: StoredLead) => setPitchLeadId(lead.id),
    }),
    [persist, push],
  );

  const pitchLead = pitchLeadId ? (leads.find((l) => l.id === pitchLeadId) ?? null) : null;
  const closePitch = useCallback(() => setPitchLeadId(null), []);

  // ----- Filtros / paginação -----
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

  // ----- Exportação -----
  function exportCsv(list: StoredLead[], prefix: string) {
    if (!list.length) return push("info", "Nenhum lead para exportar com os filtros atuais.");
    download(leadsToCsv(list), "text/csv;charset=utf-8", exportFileName(prefix, "csv"));
    push("success", `${list.length} leads exportados em CSV.`);
  }
  function exportXlsx() {
    if (!filtered.length) return push("info", "Nenhum lead para exportar com os filtros atuais.");
    const bytes = leadsToXlsx(filtered);
    download(bytes.slice().buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", exportFileName("nexaleads", "xlsx"));
    push("success", `${filtered.length} leads exportados para Excel.`);
  }
  async function copyAll() {
    if (!filtered.length) return push("info", "Nenhum lead para copiar com os filtros atuais.");
    const ok = await copyText(leadsToText(filtered));
    push(ok ? "success" : "error", ok ? `${filtered.length} leads copiados.` : "Não foi possível copiar para a área de transferência.");
  }
  function exportNoSite() {
    const base = applyFilters(leads, { ...filters, onlyNoSite: true }, lastSearch?.id ?? null);
    exportCsv(base, "nexaleads-sem-site");
  }

  function resetData() {
    if (!window.confirm("Apagar todos os leads e status salvos neste dispositivo? Esta ação não pode ser desfeita.")) return;
    clearAll();
    leadsRef.current = [];
    setLeads([]);
    setLastSearch(null);
    setFilters(DEFAULT_FILTERS);
    push("info", "Dados locais apagados.");
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  }

  function switchView(next: "cards" | "table") {
    setView(next);
    try {
      localStorage.setItem("nexaleads:v1:view", next);
    } catch {
      /* ignora */
    }
  }

  const busy = search.phase === "running";

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-6 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-brand-gradient font-display text-lg font-bold shadow-lg shadow-indigo-900/50" aria-hidden>
            N
          </div>
          <div>
            <h1 className="font-display text-xl font-bold leading-tight tracking-tight">
              Nexa<span className="text-gradient">Leads</span>
            </h1>
            <p className="text-xs text-muted">Prospecção inteligente · Nexa Agency</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`badge ${
              status.mode === "live"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : status.mode === "demo"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                  : "border-line-strong text-muted"
            }`}
            title={status.actorId ? `Actor: ${status.actorId}` : undefined}
          >
            <span className={`size-1.5 rounded-full ${status.mode === "live" ? "bg-emerald-300" : status.mode === "demo" ? "bg-amber-300" : "bg-slate-400"}`} />
            {status.mode === "live"
              ? status.sources?.apify && status.sources?.google
                ? "Apify + Google conectados"
                : status.sources?.google
                  ? "Google Places conectado"
                  : "Apify conectado"
              : status.mode === "demo"
                ? "Modo demonstração"
                : "Verificando conexão…"}
          </span>
          <span className="badge border-line-strong text-muted" title="Os leads e status ficam salvos apenas no navegador deste dispositivo.">
            <DatabaseIcon size={12} /> Dados só neste dispositivo
          </span>
          {status.authRequired && (
            <button type="button" className="btn btn-ghost px-2.5 py-1 text-xs" onClick={logout}>
              <LogoutIcon size={13} /> Sair
            </button>
          )}
        </div>
      </header>

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

      <SearchForm busy={busy} maxLeads={status.maxLeads} sources={status.sources} initial={lastSearch?.params} onSearch={runSearch} key={lastSearch ? "loaded" : "empty"} />

      {/* Carregamento */}
      {search.phase === "running" && (
        <section className="card overflow-hidden" aria-live="polite" aria-busy="true">
          <div className="progress-indeterminate h-1 bg-white/5" />
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <LoaderIcon className="animate-spin text-indigo-300" size={22} />
              <div>
                <p className="font-semibold">
                  Buscando {search.params.niches.join(", ")}
                  {search.params.onlyNoSite ? " sem site" : ""}
                  {search.params.onlyWhatsApp ? " com WhatsApp" : ""} em {search.params.city} - {search.params.state}
                </p>
                <p className="text-sm text-muted">
                  {search.message ?? "Processando…"} · {formatElapsed(now - search.startedAt)}
                  {search.runId && " · o Apify costuma levar de 1 a 5 minutos"}
                </p>
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={cancelSearch}>
              <XIcon /> Cancelar
            </button>
          </div>
          <div className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-5 sm:pt-0 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-line p-4">
                <div className="flex gap-3">
                  <div className="skeleton size-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3 w-1/3" />
                    <div className="skeleton h-4 w-2/3" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Erros */}
      {search.phase === "error" && (
        <section
          role="alert"
          className={`flex items-start gap-3 rounded-xl border px-4 py-4 text-sm ${
            search.code === "NO_RESULTS" ? "border-indigo-400/30 bg-indigo-400/10 text-indigo-100" : "border-red-400/40 bg-red-400/10 text-red-100"
          }`}
        >
          {search.code === "NO_RESULTS" ? <InfoIcon className="mt-0.5 shrink-0" /> : <AlertIcon className="mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className="font-semibold">{ERROR_TITLES[search.code] ?? "Não foi possível concluir a busca"}</p>
            <p className="mt-0.5 opacity-90">{search.message}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {search.params && search.code !== "VALIDATION_ERROR" && search.code !== "NO_RESULTS" && (
              <button type="button" className="btn btn-ghost" onClick={() => search.params && runSearch(search.params)}>
                Tentar novamente
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setSearch({ phase: "idle" })} aria-label="Fechar mensagem">
              <XIcon />
            </button>
          </div>
        </section>
      )}

      {hydrated && (
        <>
          <Dashboard
            leads={leads}
            onPickNiche={(niche) => changeFilters({ ...filters, niche, showDiscarded: false })}
            onPickStatus={(s) => changeFilters({ ...filters, status: s, showDiscarded: false })}
          />

          <div ref={resultsRef} className="scroll-mt-4 space-y-4">
            <FiltersPanel filters={filters} onChange={changeFilters} niches={nicheOptions} cities={cityOptions} hasLastSearch={Boolean(lastSearch)} />

            {/* Barra de resultados e exportação */}
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

            {storageWarning && (
              <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" role="alert">
                Não foi possível salvar no armazenamento local (espaço cheio ou navegação privada). Exporte seus leads para não perdê-los.
              </p>
            )}

            {/* Lista */}
            {filtered.length === 0 ? (
              <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
                <SearchEmptyArt />
                <p className="font-display text-lg font-semibold">{leads.length === 0 ? "Nenhum lead ainda" : "Nenhum lead com esses filtros"}</p>
                <p className="max-w-md text-sm text-muted">
                  {leads.length === 0
                    ? "Informe uma cidade, escolha os nichos e clique em “Encontrar leads”. Os resultados ficam salvos neste navegador."
                    : "Ajuste ou limpe os filtros para ver mais resultados."}
                </p>
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
                <span className="text-sm text-muted tabular-nums">
                  Página {currentPage} de {totalPages}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Próxima página">
                  <ChevronRightIcon />
                </button>
              </nav>
            )}
          </div>
        </>
      )}

      <footer className="mt-auto flex flex-col gap-3 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-start sm:justify-between">
        <p className="flex max-w-3xl items-start gap-2">
          <ShieldIcon className="mt-0.5 shrink-0" size={14} />
          <span>
            Exibimos apenas dados públicos fornecidos pela fonte da pesquisa (Apify / Google Maps). Nenhuma mensagem é enviada automaticamente — o contato é
            sempre manual. Respeite os termos de uso do Apify e do Google Maps e a LGPD ao abordar empresas. Leads e status ficam armazenados somente neste
            navegador.
          </span>
        </p>
        {leads.length > 0 && (
          <button type="button" className="btn btn-ghost shrink-0 text-red-200" onClick={resetData}>
            <TrashIcon /> Apagar dados locais
          </button>
        )}
      </footer>

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

      <ToastViewport toasts={toasts} dismiss={dismiss} />
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
