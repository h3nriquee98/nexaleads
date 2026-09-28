import { BR_STATES } from "./niches";
import type { SearchParams } from "./types";

export const DEFAULT_LIMIT = 20;
export const HARD_MAX_LIMIT = 500;
export const MAX_NICHES = 10;

export type ValidationResult =
  | { ok: true; value: SearchParams }
  | { ok: false; errors: Partial<Record<keyof SearchParams, string>> };

const SAFE_TEXT = /^[\p{L}\p{M}\p{N} .,'’()&/-]+$/u;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Valida e normaliza os parâmetros de busca (usado no navegador e no servidor). */
export function validateSearch(input: unknown, maxLimit = 100): ValidationResult {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: Partial<Record<keyof SearchParams, string>> = {};

  let city = clean(raw.city);
  let state = clean(raw.state).toUpperCase();
  const country = clean(raw.country) || "Brasil";

  // Aceita "Franca, SP" digitado direto no campo de cidade.
  const combined = /^(.+?)\s*[,/-]\s*([A-Za-z]{2})$/.exec(city);
  if (combined && !state) {
    city = combined[1].trim();
    state = combined[2].toUpperCase();
  }

  if (city.length < 2) errors.city = "Informe a cidade (ex.: Franca).";
  else if (city.length > 80 || !SAFE_TEXT.test(city)) errors.city = "Cidade inválida. Use apenas letras, números e pontuação simples.";

  const isBrazil = /^(brasil|brazil)$/i.test(country);
  if (isBrazil) {
    if (!state) errors.state = "Selecione o estado (UF).";
    else if (!(BR_STATES as readonly string[]).includes(state)) errors.state = "UF inválida.";
  } else if (state && (state.length > 40 || !SAFE_TEXT.test(state))) {
    errors.state = "Estado inválido.";
  }

  if (country.length > 60 || !SAFE_TEXT.test(country)) errors.country = "País inválido.";

  const nicheList = Array.isArray(raw.niches) ? raw.niches : [];
  const niches = [...new Map(nicheList.map(clean).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()];
  if (niches.length === 0) errors.niches = "Selecione pelo menos um nicho.";
  else if (niches.length > MAX_NICHES) errors.niches = `Selecione no máximo ${MAX_NICHES} nichos por busca.`;
  else if (niches.some((n) => n.length > 60 || !SAFE_TEXT.test(n))) errors.niches = "Nicho inválido. Use apenas letras, números e pontuação simples.";

  const cap = Math.min(Math.max(1, maxLimit), HARD_MAX_LIMIT);
  let limit = DEFAULT_LIMIT;
  if (raw.limit !== undefined && raw.limit !== null && raw.limit !== "") {
    const parsed = Number(raw.limit);
    if (!Number.isInteger(parsed) || parsed < 1) errors.limit = "A quantidade deve ser um número inteiro maior que zero.";
    else if (parsed > cap) errors.limit = `O limite máximo por busca é ${cap} leads.`;
    else limit = parsed;
  }
  limit = Math.min(limit, cap);

  const flag = (v: unknown) => v === true || v === "true" || v === "1";
  const onlyNoSite = flag(raw.onlyNoSite);
  const onlyWhatsApp = flag(raw.onlyWhatsApp);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { city, state, country, niches, limit, onlyNoSite, onlyWhatsApp } };
}

export function searchKey(params: SearchParams): string {
  return JSON.stringify([
    params.city.toLowerCase(),
    params.state.toLowerCase(),
    params.country.toLowerCase(),
    [...params.niches].map((n) => n.toLowerCase()).sort(),
    params.limit,
    params.onlyNoSite,
    params.onlyWhatsApp,
  ]);
}

/**
 * O Google Maps não permite filtrar por WhatsApp, então com "apenas com WhatsApp" buscamos
 * o dobro de empresas e o servidor entrega até `limit` leads que tenham WhatsApp.
 */
export const WHATSAPP_FETCH_MULTIPLIER = 2;

export function fetchLimit(params: Pick<SearchParams, "limit" | "onlyWhatsApp">): number {
  return params.onlyWhatsApp ? params.limit * WHATSAPP_FETCH_MULTIPLIER : params.limit;
}
