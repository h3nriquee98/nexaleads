import "server-only";
import type { ApifyConfig } from "./config";
import type { RawPlace } from "@/lib/normalize";
import type { SearchParams } from "@/lib/types";
import { fetchLimit } from "@/lib/validation";

/**
 * Busca empresas na Google Places API (New) — Text Search.
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 * Converte cada lugar para o mesmo formato bruto do Google Maps Scraper (Apify),
 * assim toda a normalização, pontuação e deduplicação é compartilhada.
 */

export class GooglePlacesError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 502,
  ) {
    super(message);
  }
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "nextPageToken",
].join(",");

/** A API devolve no máximo 20 lugares por página e 60 por consulta. */
const PAGE_SIZE = 20;
const MAX_PER_QUERY = 60;
const REQUEST_TIMEOUT_MS = 20_000;

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text?: string };
}

function toGoogleError(status: number, body: unknown): GooglePlacesError {
  const err = (body as { error?: { status?: string; message?: string } } | null)?.error;
  const message = err?.message ?? "";
  if (/api key not valid|API_KEY_INVALID/i.test(message)) {
    return new GooglePlacesError("GOOGLE_INVALID_KEY", "Chave do Google Maps inválida. Verifique a variável GOOGLE_MAPS_API_KEY.");
  }
  if (status === 429 || err?.status === "RESOURCE_EXHAUSTED") {
    return new GooglePlacesError("GOOGLE_RATE_LIMIT", "Limite de uso da Google Places API atingido. Aguarde alguns instantes ou aumente a cota no Google Cloud.", 429);
  }
  if (status === 403 || err?.status === "PERMISSION_DENIED") {
    if (/billing/i.test(message)) {
      return new GooglePlacesError("GOOGLE_BILLING", "Ative o faturamento (billing) do projeto no Google Cloud para usar a Places API.", 402);
    }
    if (/has not been used|is disabled|not enabled/i.test(message)) {
      return new GooglePlacesError("GOOGLE_API_DISABLED", "Ative a “Places API (New)” no Google Cloud Console para esta chave.");
    }
    return new GooglePlacesError("GOOGLE_FORBIDDEN", "O Google recusou a chave. Confira as restrições da chave no Google Cloud (a Places API (New) precisa estar liberada).");
  }
  return new GooglePlacesError("GOOGLE_ERROR", `Erro inesperado da Google Places API (HTTP ${status}). Tente novamente em instantes.`);
}

async function searchPage(config: ApifyConfig, body: Record<string, unknown>): Promise<{ places: GooglePlace[]; nextPageToken?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${config.googleBaseUrl}/v1/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.googleApiKey ?? "",
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new GooglePlacesError(
      aborted ? "GOOGLE_TIMEOUT" : "GOOGLE_UNREACHABLE",
      aborted ? "A Google Places API demorou demais para responder." : "Não foi possível conectar à Google Places API.",
      504,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw toGoogleError(res.status, json);
  const data = (json ?? {}) as { places?: GooglePlace[]; nextPageToken?: string };
  return { places: Array.isArray(data.places) ? data.places : [], nextPageToken: data.nextPageToken };
}

/** Converte um lugar da Places API para o formato bruto usado pelo Google Maps Scraper. */
export function googlePlaceToRaw(place: GooglePlace, niche: string, now = new Date()): RawPlace {
  const comp = (type: string) => place.addressComponents?.find((c) => c.types?.includes(type));
  const route = comp("route");
  const number = comp("street_number");
  const street = route ? [route.shortText ?? route.longText, number?.longText].filter(Boolean).join(", ") : null;
  return {
    title: place.displayName?.text ?? null,
    placeId: place.id ?? null,
    categoryName: place.primaryTypeDisplayName?.text ?? null,
    searchString: niche,
    address: place.formattedAddress ?? null,
    street,
    neighborhood: comp("sublocality_level_1")?.longText ?? comp("sublocality")?.longText ?? null,
    city: comp("administrative_area_level_2")?.longText ?? comp("locality")?.longText ?? null,
    state: comp("administrative_area_level_1")?.shortText ?? null,
    postalCode: comp("postal_code")?.longText ?? null,
    phone: place.nationalPhoneNumber ?? null,
    phoneUnformatted: place.internationalPhoneNumber ?? null,
    // O campo existe sempre: sem websiteUri significa que o Google não tem site cadastrado.
    website: place.websiteUri ?? null,
    totalScore: place.rating ?? null,
    reviewsCount: place.userRatingCount ?? 0,
    url: place.googleMapsUri ?? null,
    permanentlyClosed: place.businessStatus === "CLOSED_PERMANENTLY",
    temporarilyClosed: place.businessStatus === "CLOSED_TEMPORARILY",
    scrapedAt: now.toISOString(),
  };
}

/** Quantos lugares pedir por nicho. A Places API não filtra por site, então pedimos mais quando "apenas sem site". */
export function googleTargetPerNiche(params: SearchParams): number {
  const base = Math.ceil(fetchLimit(params) / params.niches.length);
  return Math.max(1, Math.min(MAX_PER_QUERY, params.onlyNoSite ? base * 3 : base));
}

export async function searchGooglePlaces(params: SearchParams, config: ApifyConfig): Promise<RawPlace[]> {
  const target = googleTargetPerNiche(params);
  const pageSize = Math.min(PAGE_SIZE, target);
  const isBrazil = /^(brasil|brazil)$/i.test(params.country);
  const location = [params.city, params.state, params.country].filter(Boolean).join(", ");
  const now = new Date();

  const perNiche = await Promise.all(
    params.niches.map(async (niche) => {
      const collected: RawPlace[] = [];
      let pageToken: string | undefined;
      do {
        const { places, nextPageToken } = await searchPage(config, {
          textQuery: `${niche} em ${location}`,
          languageCode: "pt-BR",
          ...(isBrazil ? { regionCode: "BR" } : {}),
          pageSize,
          ...(pageToken ? { pageToken } : {}),
        });
        for (const place of places) collected.push(googlePlaceToRaw(place, niche, now));
        pageToken = nextPageToken;
      } while (pageToken && collected.length < target);
      return collected.slice(0, target);
    }),
  );
  return perNiche.flat();
}
