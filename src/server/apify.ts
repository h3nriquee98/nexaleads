import "server-only";
import type { ApifyConfig } from "./config";
import type { SearchParams } from "@/lib/types";
import { fetchLimit } from "@/lib/validation";
import type { RawPlace } from "@/lib/normalize";

export class ApifyError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 502,
  ) {
    super(message);
  }
}

export type RunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMING-OUT"
  | "TIMED-OUT"
  | "ABORTING"
  | "ABORTED";

export interface RunInfo {
  id: string;
  status: RunStatus;
  statusMessage: string | null;
  defaultDatasetId: string | null;
}

const REQUEST_TIMEOUT_MS = 25_000;

/** Traduz erros da API do Apify em mensagens claras (sem expor o token). */
function toApifyError(status: number, body: unknown): ApifyError {
  const err = (body as { error?: { type?: string; message?: string } } | null)?.error;
  const type = err?.type ?? "";
  if (status === 401 || type === "token-not-valid" || type === "user-or-token-not-found") {
    return new ApifyError("APIFY_UNAUTHORIZED", "Token do Apify inválido ou expirado. Verifique a variável APIFY_API_TOKEN.", 502);
  }
  if (status === 429 || type.includes("rate-limit")) {
    return new ApifyError("APIFY_RATE_LIMIT", "Limite de requisições do Apify atingido. Aguarde alguns instantes e tente novamente.", 429);
  }
  if (status === 402 || type.includes("usage") || type.includes("not-enough") || type.includes("limit-exceeded")) {
    return new ApifyError("APIFY_NO_CREDITS", "Saldo ou limite de uso da conta Apify insuficiente para executar o Actor.", 402);
  }
  if (type === "actor-is-not-rented" || type.includes("rent")) {
    return new ApifyError("APIFY_ACTOR_NOT_RENTED", "O Actor configurado exige assinatura/aluguel na sua conta Apify.", 402);
  }
  if (status === 404) {
    return new ApifyError("APIFY_NOT_FOUND", "Actor ou execução não encontrado. Confira o APIFY_ACTOR_ID.", 502);
  }
  if (status === 403) {
    return new ApifyError("APIFY_FORBIDDEN", "Acesso negado pelo Apify. Verifique as permissões do token.", 502);
  }
  if (status === 400) {
    return new ApifyError("APIFY_BAD_INPUT", `O Actor recusou os parâmetros da busca${err?.message ? `: ${err.message}` : "."}`, 502);
  }
  return new ApifyError("APIFY_ERROR", `Erro inesperado da API do Apify (HTTP ${status}). Tente novamente em instantes.`, 502);
}

async function apifyFetch(config: ApifyConfig, path: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ApifyError(
      aborted ? "APIFY_TIMEOUT" : "APIFY_UNREACHABLE",
      aborted ? "O Apify demorou demais para responder. Tente novamente." : "Não foi possível conectar à API do Apify. Verifique sua conexão.",
      504,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) throw toApifyError(res.status, body);
  return body;
}

/** Monta o input do Actor Google Maps Scraper (compass/crawler-google-places). */
export function buildActorInput(params: SearchParams, config: ApifyConfig): Record<string, unknown> {
  const perNiche = Math.max(1, Math.ceil(fetchLimit(params) / params.niches.length));
  const isBrazil = /^(brasil|brazil)$/i.test(params.country);
  return {
    searchStringsArray: params.niches,
    locationQuery: [params.city, params.state, params.country].filter(Boolean).join(", "),
    maxCrawledPlacesPerSearch: perNiche,
    language: config.language,
    ...(isBrazil ? { countryCode: "br" } : {}),
    skipClosedPlaces: true,
    scrapePlaceDetailPage: false,
    scrapeContacts: false,
    maxImages: 0,
    maxReviews: 0,
    maxQuestions: 0,
    // Filtro do próprio Google Maps Scraper: retorna só lugares sem site.
    ...(params.onlyNoSite ? { website: "withoutWebsite" } : {}),
    ...config.extraInput,
  };
}

function toRunInfo(body: unknown): RunInfo {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data.id !== "string") {
    throw new ApifyError("APIFY_ERROR", "Resposta inesperada do Apify ao consultar a execução.");
  }
  return {
    id: data.id,
    status: (data.status as RunStatus) ?? "RUNNING",
    statusMessage: typeof data.statusMessage === "string" ? data.statusMessage : null,
    defaultDatasetId: typeof data.defaultDatasetId === "string" ? data.defaultDatasetId : null,
  };
}

export async function startRun(params: SearchParams, config: ApifyConfig): Promise<RunInfo> {
  const query = new URLSearchParams({
    timeout: String(config.runTimeoutSecs),
    // Limita resultados cobrados em Actors "pay per result".
    maxItems: String(fetchLimit(params)),
  });
  if (config.maxChargeUsd) query.set("maxTotalChargeUsd", String(config.maxChargeUsd));
  const body = await apifyFetch(config, `/v2/acts/${encodeURIComponent(config.actorId)}/runs?${query}`, {
    method: "POST",
    body: JSON.stringify(buildActorInput(params, config)),
  });
  return toRunInfo(body);
}

export async function getRun(runId: string, config: ApifyConfig): Promise<RunInfo> {
  return toRunInfo(await apifyFetch(config, `/v2/actor-runs/${encodeURIComponent(runId)}`));
}

export async function abortRun(runId: string, config: ApifyConfig): Promise<void> {
  await apifyFetch(config, `/v2/actor-runs/${encodeURIComponent(runId)}/abort`, { method: "POST" });
}

export async function getRunItems(runId: string, limit: number, config: ApifyConfig): Promise<RawPlace[]> {
  const query = new URLSearchParams({ clean: "true", format: "json", limit: String(limit) });
  const body = await apifyFetch(config, `/v2/actor-runs/${encodeURIComponent(runId)}/dataset/items?${query}`);
  return Array.isArray(body) ? (body as RawPlace[]) : [];
}
