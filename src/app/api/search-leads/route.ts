import { NextResponse } from "next/server";
import { getApifyConfig } from "@/server/config";
import { ApifyError, abortRun, getRun, getRunItems, startRun } from "@/server/apify";
import { generateDemoPlaces } from "@/server/demo";
import { requestIsAuthorized } from "@/server/auth";
import { forgetRun, forgetRunId, getRecentRun, isSameOrigin, rateLimit, rememberRun } from "@/server/guards";
import { normalizePlaces } from "@/lib/normalize";
import { fetchLimit, searchKey, validateSearch } from "@/lib/validation";
import type { Lead, SearchParams, SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RUN_ID = /^[A-Za-z0-9]{8,40}$/;

function json(body: SearchResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(code: string, message: string, status: number) {
  return json({ ok: false, code, message }, status);
}

const unauthorized = () => fail("UNAUTHORIZED", "Sessão expirada ou não autenticada. Faça login novamente.", 401);

function handleError(error: unknown) {
  if (error instanceof ApifyError) return fail(error.code, error.message, error.httpStatus);
  console.error("[search-leads] erro inesperado", error instanceof Error ? error.message : error);
  return fail("INTERNAL_ERROR", "Erro interno ao processar a busca. Tente novamente.", 500);
}

/**
 * Filtros aplicados no servidor:
 * - "apenas sem site": nenhum lead com site (ou não identificado) passa;
 * - "apenas com WhatsApp": só WhatsApp confirmado pela fonte ou celular (provável).
 * Como a lista já vem ordenada pela pontuação, o corte em `limit` mantém os melhores.
 */
function applySiteFilter(leads: Lead[], params: SearchParams): Lead[] {
  let result = leads;
  if (params.onlyNoSite) result = result.filter((l) => l.siteStatus === "sem_site");
  if (params.onlyWhatsApp) result = result.filter((l) => l.whatsappStatus !== "nao").slice(0, params.limit);
  return result;
}

function firstValidationError(errors: Partial<Record<keyof SearchParams, string>>): string {
  return Object.values(errors).find(Boolean) ?? "Parâmetros inválidos.";
}

/** Inicia uma busca. Modo demo: responde na hora. Modo Apify: inicia a execução do Actor e devolve o runId. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("FORBIDDEN", "Origem não permitida.", 403);
  if (!(await requestIsAuthorized(request))) return unauthorized();
  const config = getApifyConfig();
  if (config.configError) return fail("CONFIG_ERROR", config.configError, 500);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_JSON", "Corpo da requisição inválido.", 400);
  }

  const validation = validateSearch(body, config.maxLeads);
  if (!validation.ok) return fail("VALIDATION_ERROR", firstValidationError(validation.errors), 400);
  const params = validation.value;

  if (!rateLimit(request, 8, 60_000)) {
    return fail("RATE_LIMIT", "Muitas buscas em pouco tempo. Aguarde um minuto antes de tentar novamente.", 429);
  }

  if (config.demoMode) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const leads = applySiteFilter(normalizePlaces(generateDemoPlaces(params), { ...params, source: "demo" }), params);
    return json({
      ok: true,
      mode: "demo",
      status: "SUCCEEDED",
      leads,
      message: "Modo demonstração: dados fictícios gerados localmente. Configure o APIFY_API_TOKEN para buscar leads reais.",
    });
  }

  try {
    const key = searchKey(params);
    const cachedRunId = getRecentRun(key);
    if (cachedRunId) {
      return json({ ok: true, mode: "apify", status: "RUNNING", runId: cachedRunId, message: "Reaproveitando uma busca idêntica iniciada há pouco." });
    }
    const run = await startRun(params, config);
    rememberRun(key, run.id);
    return json({ ok: true, mode: "apify", status: "RUNNING", runId: run.id });
  } catch (error) {
    return handleError(error);
  }
}

/** Consulta o andamento da execução e, quando terminar, devolve os leads normalizados. */
export async function GET(request: Request) {
  if (!(await requestIsAuthorized(request))) return unauthorized();
  const config = getApifyConfig();
  if (config.demoMode) return fail("DEMO_MODE", "Consulta de execuções indisponível no modo demonstração.", 400);

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";
  if (!RUN_ID.test(runId)) return fail("VALIDATION_ERROR", "Identificador de execução inválido.", 400);

  const validation = validateSearch(
    {
      city: url.searchParams.get("city"),
      state: url.searchParams.get("state"),
      country: url.searchParams.get("country"),
      niches: url.searchParams.getAll("niche"),
      limit: url.searchParams.get("limit"),
      onlyNoSite: url.searchParams.get("onlyNoSite"),
      onlyWhatsApp: url.searchParams.get("onlyWhatsApp"),
    },
    config.maxLeads,
  );
  if (!validation.ok) return fail("VALIDATION_ERROR", firstValidationError(validation.errors), 400);
  const params = validation.value;

  try {
    const run = await getRun(runId, config);
    if (run.status === "READY" || run.status === "RUNNING" || run.status === "TIMING-OUT" || run.status === "ABORTING") {
      return json({ ok: true, mode: "apify", status: "RUNNING", runId, message: run.statusMessage ?? undefined });
    }
    if (run.status === "FAILED") {
      forgetRun(searchKey(params));
      return fail("APIFY_RUN_FAILED", `A execução do Actor falhou${run.statusMessage ? `: ${run.statusMessage}` : "."} Tente novamente.`, 502);
    }

    const items = await getRunItems(runId, fetchLimit(params), config);
    const leads = applySiteFilter(normalizePlaces(items, { ...params, source: "apify" }), params);
    const partial = run.status !== "SUCCEEDED";
    if (partial) forgetRun(searchKey(params));
    return json({
      ok: true,
      mode: "apify",
      status: partial ? "PARTIAL" : "SUCCEEDED",
      runId,
      leads,
      message: partial
        ? `A execução foi interrompida (${run.status === "ABORTED" ? "cancelada" : "tempo esgotado"}). Exibindo os resultados coletados até o momento.`
        : undefined,
    });
  } catch (error) {
    return handleError(error);
  }
}

/** Cancela uma execução em andamento (evita custos de uma busca que não é mais necessária). */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return fail("FORBIDDEN", "Origem não permitida.", 403);
  if (!(await requestIsAuthorized(request))) return unauthorized();
  const config = getApifyConfig();
  if (config.demoMode) return json({ ok: true, mode: "demo", status: "SUCCEEDED" });
  const runId = new URL(request.url).searchParams.get("runId") ?? "";
  if (!RUN_ID.test(runId)) return fail("VALIDATION_ERROR", "Identificador de execução inválido.", 400);
  try {
    forgetRunId(runId);
    await abortRun(runId, config);
    return json({ ok: true, mode: "apify", status: "PARTIAL", runId, message: "Busca cancelada." });
  } catch (error) {
    return handleError(error);
  }
}
