import "server-only";

export const DEFAULT_ACTOR_ID = "compass/crawler-google-places";

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export interface ApifyConfig {
  token: string | null;
  actorId: string;
  maxLeads: number;
  language: string;
  runTimeoutSecs: number;
  maxChargeUsd: number | null;
  extraInput: Record<string, unknown>;
  baseUrl: string;
  /** Chave da Google Places API (New). Opcional: soma uma segunda fonte de dados. */
  googleApiKey: string | null;
  googleBaseUrl: string;
  /** Fontes configuradas no servidor. */
  sources: { apify: boolean; google: boolean };
  demoMode: boolean;
  configError: string | null;
}

/** Lê a configuração do Apify SOMENTE no servidor (variáveis de ambiente). */
export function getApifyConfig(): ApifyConfig {
  const token = process.env.APIFY_API_TOKEN?.trim() || null;
  const actorId = (process.env.APIFY_ACTOR_ID?.trim() || DEFAULT_ACTOR_ID).replace("/", "~");
  let extraInput: Record<string, unknown> = {};
  let configError: string | null = null;
  const rawExtra = process.env.APIFY_ACTOR_INPUT_JSON?.trim();
  if (rawExtra) {
    try {
      const parsed = JSON.parse(rawExtra);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) extraInput = parsed;
      else configError = "APIFY_ACTOR_INPUT_JSON deve ser um objeto JSON.";
    } catch {
      configError = "APIFY_ACTOR_INPUT_JSON não é um JSON válido.";
    }
  }
  if (!/^[A-Za-z0-9._~-]+$/.test(actorId)) configError = "APIFY_ACTOR_ID inválido.";
  const charge = Number.parseFloat(process.env.APIFY_MAX_CHARGE_USD ?? "");
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
  const forceDemo = process.env.NEXALEADS_DEMO_MODE === "true";

  return {
    token,
    actorId,
    maxLeads: intEnv("APIFY_MAX_LEADS", 100, 1, 500),
    language: process.env.APIFY_LANGUAGE?.trim() || "pt-BR",
    runTimeoutSecs: intEnv("APIFY_RUN_TIMEOUT_SECS", 600, 60, 3600),
    maxChargeUsd: Number.isFinite(charge) && charge > 0 ? charge : null,
    extraInput,
    baseUrl: (process.env.APIFY_API_BASE_URL?.trim() || "https://api.apify.com").replace(/\/+$/, ""),
    googleApiKey,
    googleBaseUrl: (process.env.GOOGLE_PLACES_BASE_URL?.trim() || "https://places.googleapis.com").replace(/\/+$/, ""),
    sources: { apify: Boolean(token) && !forceDemo, google: Boolean(googleApiKey) && !forceDemo },
    demoMode: forceDemo || (!token && !googleApiKey),
    configError,
  };
}
