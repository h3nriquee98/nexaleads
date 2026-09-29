"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useToasts, type ToastKind } from "../Toasts";
import { leadToText } from "@/lib/export";
import { STATUS_LABEL } from "@/lib/labels";
import { clearAll, loadLastSearch, loadLeads, mergeLeads, saveLastSearch, saveLeads, updateLead, type LastSearch } from "@/lib/storage";
import { clearFinance, loadFinance, saveFinance, sortEntries, type FinanceEntry } from "@/lib/finance";
import { searchKey } from "@/lib/validation";
import type { Lead, LeadStatus, SearchMode, SearchParams, SearchResponse, StoredLead } from "@/lib/types";
import type { LeadActionsHandlers } from "../LeadParts";

/**
 * Estado compartilhado entre as páginas (Início, Buscar leads, Meus leads, Financeiro).
 * Fica no layout, então uma busca continua rodando enquanto você navega pelo menu.
 */

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 20 * 60 * 1000;
const RECENT_SEARCH_MS = 10 * 60 * 1000;

export interface AppStatus {
  mode: "demo" | "live" | "unknown";
  sources?: { apify: boolean; google: boolean };
  maxLeads: number;
  actorId?: string;
  configError?: string | null;
  authRequired?: boolean;
}

export type SearchState =
  | { phase: "idle" }
  | { phase: "running"; params: SearchParams; startedAt: number; runId?: string; message?: string }
  | { phase: "error"; code: string; message: string; params?: SearchParams };

function goToLogin() {
  window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
}

export async function copyText(text: string): Promise<boolean> {
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

export function download(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`;
}


interface AppContextValue {
  hydrated: boolean;
  status: AppStatus;
  leads: StoredLead[];
  lastSearch: LastSearch | null;
  search: SearchState;
  now: number;
  storageWarning: boolean;
  handlers: LeadActionsHandlers;
  pitchLead: StoredLead | null;
  closePitch: () => void;
  runSearch: (params: SearchParams) => void;
  cancelSearch: () => void;
  dismissSearchError: () => void;
  push: (kind: ToastKind, text: string) => void;
  resetData: () => void;
  logout: () => void;
  finance: FinanceEntry[];
  saveEntries: (next: FinanceEntry[]) => void;
  toastState: ReturnType<typeof useToasts>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp precisa estar dentro de <AppProvider>");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<AppStatus>({ mode: "unknown", maxLeads: 100 });
  const [leads, setLeads] = useState<StoredLead[]>([]);
  const [lastSearch, setLastSearch] = useState<LastSearch | null>(null);
  const [search, setSearch] = useState<SearchState>({ phase: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [storageWarning, setStorageWarning] = useState(false);
  const [pitchLeadId, setPitchLeadId] = useState<string | null>(null);
  const [finance, setFinance] = useState<FinanceEntry[]>([]);
  const toastState = useToasts();
  const { push } = toastState;

  const inFlight = useRef(false);
  const leadsRef = useRef<StoredLead[]>([]);
  /** Busca em andamento: ID e leads já recebidos (Google chega antes do Apify quando as duas fontes estão ativas). */
  const activeSearch = useRef<{ id: string; collected: Map<string, Lead> } | null>(null);
  const searchToken = useRef(0);

  // Carrega dados locais e o status das fontes após montar no navegador.
  useEffect(() => {
    const stored = loadLeads();
    leadsRef.current = stored;
    setLeads(stored);
    setLastSearch(loadLastSearch());
    setFinance(sortEntries(loadFinance()));
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
  const pitchLeadResolved = pitchLeadId ? (leads.find((l) => l.id === pitchLeadId) ?? null) : null;
  const closePitch = useCallback(() => setPitchLeadId(null), []);
  const dismissSearchError = useCallback(() => setSearch({ phase: "idle" }), []);

  const saveEntries = useCallback((next: FinanceEntry[]) => {
    const sorted = sortEntries(next);
    setFinance(sorted);
    if (!saveFinance(sorted)) setStorageWarning(true);
  }, []);

  const resetData = useCallback(() => {
    if (!window.confirm("Apagar todos os leads, status e lançamentos financeiros salvos neste dispositivo? Esta ação não pode ser desfeita.")) return;
    clearAll();
    clearFinance();
    leadsRef.current = [];
    setLeads([]);
    setLastSearch(null);
    setFinance([]);
    push("info", "Dados locais apagados.");
  }, [push]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      status,
      leads,
      lastSearch,
      search,
      now,
      storageWarning,
      handlers,
      pitchLead: pitchLeadResolved,
      closePitch,
      runSearch,
      cancelSearch,
      dismissSearchError,
      push,
      resetData,
      logout,
      finance,
      saveEntries,
      toastState,
    }),
    [hydrated, status, leads, lastSearch, search, now, storageWarning, handlers, pitchLeadResolved, closePitch, runSearch, cancelSearch, dismissSearchError, push, resetData, logout, finance, saveEntries, toastState],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
