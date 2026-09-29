"use client";

import { useEffect, useRef } from "react";
import SearchForm from "../SearchForm";
import LeadsBrowser from "../LeadsBrowser";
import PageHeader from "./PageHeader";
import { AlertIcon, InfoIcon, LoaderIcon, XIcon } from "../Icons";
import { formatElapsed, useApp } from "../app/AppProvider";
import { DEFAULT_FILTERS } from "@/lib/filters";

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

export default function SearchView() {
  const { hydrated, status, lastSearch, search, now, runSearch, cancelSearch, dismissSearchError } = useApp();
  const resultsRef = useRef<HTMLElement>(null);
  const previousPhase = useRef(search.phase);

  // Ao terminar uma busca, rola até os resultados.
  useEffect(() => {
    if (previousPhase.current === "running" && search.phase === "idle") {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
    previousPhase.current = search.phase;
  }, [search.phase]);

  const busy = search.phase === "running";

  return (
    <>
      <PageHeader title="Buscar leads" subtitle="Escolha a cidade e os nichos. Empresas sem site aparecem primeiro." />

      {hydrated && (
        <SearchForm
          busy={busy}
          maxLeads={status.maxLeads}
          sources={status.sources}
          initial={lastSearch?.params}
          onSearch={runSearch}
          key={lastSearch ? "loaded" : "empty"}
        />
      )}

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
            <button type="button" className="btn btn-ghost" onClick={dismissSearchError} aria-label="Fechar mensagem">
              <XIcon />
            </button>
          </div>
        </section>
      )}

      {hydrated && lastSearch && (
        <section ref={resultsRef} className="scroll-mt-20 space-y-3" aria-labelledby="results-title">
          <h2 id="results-title" className="font-display text-lg font-semibold">
            Resultados da última busca
          </h2>
          <LeadsBrowser
            key={lastSearch.id}
            initialFilters={{ ...DEFAULT_FILTERS, onlyLastSearch: true, onlyNoSite: lastSearch.params.onlyNoSite, withWhatsApp: lastSearch.params.onlyWhatsApp }}
          />
        </section>
      )}
    </>
  );
}
