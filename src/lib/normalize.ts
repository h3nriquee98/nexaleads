import { compareLeads, scoreLead } from "./scoring";
import { formatBrazilianPhone, isBrazilianMobile, toInternationalDigits, whatsappLink } from "./phone";
import { fold } from "./text";
import type { Lead, LeadSource, SiteStatus, WhatsAppStatus } from "./types";

/** Item bruto de um Actor (Google Maps Scraper ou similar). Campos desconhecidos são ignorados. */
export type RawPlace = Record<string, unknown>;

export interface NormalizeContext {
  city: string;
  state: string;
  niches: string[];
  source: LeadSource;
  /** Usado quando o item não informa a data da coleta. */
  now?: Date;
}

const SOCIAL_HOSTS: Record<string, string> = {
  "instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "fb.com": "Facebook",
  "m.facebook.com": "Facebook",
  "linktr.ee": "Linktree",
  "wa.me": "WhatsApp",
  "api.whatsapp.com": "WhatsApp",
  "whatsapp.com": "WhatsApp",
  "tiktok.com": "TikTok",
  "twitter.com": "X/Twitter",
  "x.com": "X/Twitter",
  "youtube.com": "YouTube",
  "linkedin.com": "LinkedIn",
  "ifood.com.br": "iFood",
  "business.site": "Site gratuito do Google (desativado)",
  "beacons.ai": "Beacons",
  "linkbio.co": "Link na bio",
};

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value.replace(",", ".")))) {
    return Number(value.replace(",", "."));
  }
  return null;
}

function first(item: RawPlace, keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (Array.isArray(value)) {
      const found = value.map(str).find(Boolean);
      if (found) return found;
    } else {
      const found = str(value);
      if (found) return found;
    }
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(str).filter((v): v is string => Boolean(v));
  const single = str(value);
  return single ? [single] : [];
}

function hostOf(url: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Retorna o nome da rede social se a URL não for um site próprio. */
export function socialNetworkOf(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const [domain, label] of Object.entries(SOCIAL_HOSTS)) {
    if (host === domain || host.endsWith(`.${domain}`)) return label;
  }
  return null;
}

function safeHttpUrl(url: string | null): string | null {
  if (!url) return null;
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function whatsappNumberFromUrl(url: string): string | null {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "wa.me") return parsed.pathname.replace(/\D/g, "") || null;
    if (host.endsWith("whatsapp.com")) return (parsed.searchParams.get("phone") ?? "").replace(/\D/g, "") || null;
  } catch {
    /* ignora URLs inválidas */
  }
  return null;
}

/** Um registro vindo do Google Maps sempre traz o site quando ele existe. */
function looksLikeGoogleMapsRecord(item: RawPlace): boolean {
  const url = str(item.url) ?? "";
  return Boolean(str(item.placeId) || str(item.cid) || /google\.[a-z.]+\/maps/i.test(url));
}

function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

function matchNiche(searchString: string | null, category: string | null, niches: string[]): string {
  if (niches.length === 1) return niches[0];
  // A string de busca que trouxe o item tem prioridade sobre a categoria do Google.
  for (const candidate of [searchString, category]) {
    if (!candidate) continue;
    const c = fold(candidate);
    const found = niches.find((niche) => {
      const n = fold(niche);
      return c === n || c.includes(n) || n.includes(c);
    });
    if (found) return found;
  }
  return searchString ?? niches[0] ?? category ?? "Outros";
}

export function normalizePlace(item: RawPlace, ctx: NormalizeContext): Lead | null {
  const name = first(item, ["title", "name", "businessName"]);
  if (!name) return null;
  if (item.permanentlyClosed === true) return null;

  const category = first(item, ["categoryName", "category", "categories", "type"]);
  const street = first(item, ["street"]);
  const neighborhood = first(item, ["neighborhood"]);
  const city = first(item, ["city"]);
  const state = first(item, ["state"]);
  const postalCode = first(item, ["postalCode", "zip"]);
  const address =
    first(item, ["address", "fullAddress"]) ??
    ([street, neighborhood, city, state, postalCode].filter(Boolean).join(", ") || null);

  // Telefone
  const phone = first(item, ["phone", "phoneNumber", "phoneUnformatted", "phones"]);
  const phoneDigits = toInternationalDigits(first(item, ["phoneUnformatted", "phone", "phoneNumber", "phones"]));

  // Site
  const rawWebsite = first(item, ["website", "websiteUrl", "site"]);
  let siteStatus: SiteStatus;
  let siteNote: string | null = null;
  let website: string | null = null;
  if (rawWebsite) {
    const social = socialNetworkOf(rawWebsite);
    if (social) {
      siteStatus = "sem_site";
      siteNote = `Apenas ${social}`;
    } else {
      siteStatus = "possui_site";
    }
    website = safeHttpUrl(rawWebsite);
  } else if ("website" in item || "websiteUrl" in item || looksLikeGoogleMapsRecord(item)) {
    siteStatus = "sem_site";
  } else {
    siteStatus = "nao_identificado";
  }

  // Instagram (somente se a fonte fornecer)
  const instagramCandidates = [
    ...stringList(item.instagrams),
    ...stringList(item.instagram),
    ...(rawWebsite && socialNetworkOf(rawWebsite) === "Instagram" ? [rawWebsite] : []),
  ];
  const instagram = safeHttpUrl(instagramCandidates.find((u) => socialNetworkOf(u) === "Instagram") ?? null);

  // WhatsApp
  const whatsappUrls = [
    ...stringList(item.whatsapps),
    ...stringList(item.whatsapp),
    ...(rawWebsite && socialNetworkOf(rawWebsite) === "WhatsApp" ? [rawWebsite] : []),
  ];
  let whatsappDigits: string | null = null;
  for (const entry of whatsappUrls) {
    whatsappDigits = whatsappNumberFromUrl(entry) ?? toInternationalDigits(entry);
    if (whatsappDigits) break;
  }
  let whatsappStatus: WhatsAppStatus = "nao";
  if (whatsappDigits) whatsappStatus = "confirmado";
  else if (isBrazilianMobile(phoneDigits)) whatsappStatus = "provavel";
  const waDigits = whatsappDigits ?? phoneDigits;

  const rating = num(item.totalScore ?? item.rating ?? item.stars);
  const reviewsCount = num(item.reviewsCount ?? item.reviews ?? item.userRatingsTotal);

  const placeId = first(item, ["placeId", "cid", "id"]);
  const rawMapsUrl = first(item, ["url", "googleMapsUrl", "mapsUrl"]);
  const mapsUrl =
    rawMapsUrl && /google\.[a-z.]+\/maps|maps\.google\.[a-z.]+\/|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(rawMapsUrl)
      ? safeHttpUrl(rawMapsUrl)
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [name, address ?? city].filter(Boolean).join(" "),
        )}${str(item.placeId) && ctx.source !== "demo" ? `&query_place_id=${encodeURIComponent(String(item.placeId))}` : ""}`;

  // Localização
  const targetCity = fold(ctx.city);
  let inCity: boolean | null = null;
  if (city) inCity = fold(city) === targetCity;
  else if (address) inCity = fold(address).includes(targetCity) ? true : null;

  const scrapedAt = str(item.scrapedAt);
  const collectedAt =
    scrapedAt && !Number.isNaN(Date.parse(scrapedAt))
      ? new Date(scrapedAt).toISOString()
      : (ctx.now ?? new Date()).toISOString();

  const base = {
    siteStatus,
    phoneDigits,
    whatsappStatus,
    reviewsCount: reviewsCount === null ? null : Math.max(0, Math.round(reviewsCount)),
    rating: rating === null ? null : Math.min(5, Math.max(0, rating)),
    street,
    city,
    state,
    postalCode,
    address,
  };
  const { score, breakdown } = scoreLead(base);

  return {
    ...base,
    id: placeId ? `p_${placeId}` : hashId(fold(`${name}|${address ?? ""}`)),
    name,
    category,
    niche: matchNiche(str(item.searchString), category, ctx.niches),
    neighborhood,
    phone: phone ?? formatBrazilianPhone(phoneDigits),
    whatsappLink: whatsappLink(waDigits),
    website,
    siteNote,
    mapsUrl,
    instagram,
    inCity,
    temporarilyClosed: item.temporarilyClosed === true,
    score,
    scoreBreakdown: breakdown,
    collectedAt,
    source: ctx.source,
    searchLocation: [ctx.city, ctx.state].filter(Boolean).join(", "),
  };
}

/** Normaliza, remove duplicados/fechados e ordena pela pontuação. */
export function normalizePlaces(items: RawPlace[], ctx: NormalizeContext): Lead[] {
  const seen = new Set<string>();
  const leads: Lead[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const lead = normalizePlace(item, ctx);
    if (!lead || seen.has(lead.id)) continue;
    seen.add(lead.id);
    leads.push(lead);
  }
  return leads.sort(compareLeads);
}
