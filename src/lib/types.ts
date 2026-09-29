export type SiteStatus = "sem_site" | "possui_site" | "nao_identificado";
export type WhatsAppStatus = "confirmado" | "provavel" | "nao";
export type LeadSource = "apify" | "google" | "demo";

/** De onde buscar: Apify (Google Maps Scraper), Google Places API ou as duas juntas. */
export type SearchSource = "apify" | "google" | "both";
export type SearchMode = "demo" | "apify" | "google" | "both";

export const LEAD_STATUSES = [
  { value: "novo", label: "Novo" },
  { value: "contatar", label: "Contatar" },
  { value: "contatado", label: "Contatado" },
  { value: "interessado", label: "Interessado" },
  { value: "sem_interesse", label: "Sem interesse" },
  { value: "cliente", label: "Cliente" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];

export interface ScoreItem {
  label: string;
  points: number;
}

/** Lead normalizado. Todos os campos vêm da fonte consultada (ou são derivados dela). */
export interface Lead {
  id: string;
  name: string;
  category: string | null;
  /** Nicho pesquisado que trouxe este resultado. */
  niche: string;
  address: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /** Telefone como veio da fonte. */
  phone: string | null;
  /** Telefone só com dígitos, com DDI (ex.: 5516999990000). */
  phoneDigits: string | null;
  whatsappStatus: WhatsAppStatus;
  /** Link wa.me gerado a partir do telefone (nunca envia mensagens). */
  whatsappLink: string | null;
  rating: number | null;
  reviewsCount: number | null;
  website: string | null;
  siteStatus: SiteStatus;
  /** Observação sobre o site, ex.: "Apenas rede social". */
  siteNote: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  /** Está na cidade pesquisada? null = não foi possível verificar. */
  inCity: boolean | null;
  temporarilyClosed: boolean;
  score: number;
  scoreBreakdown: ScoreItem[];
  /** Data/hora da coleta (ISO). */
  collectedAt: string;
  source: LeadSource;
  /** Cidade informada na busca, ex.: "Franca, SP". */
  searchLocation: string;
}

export interface StoredLead extends Lead {
  status: LeadStatus;
  discarded: boolean;
  updatedAt: string;
  /** ID da busca que trouxe o lead pela última vez. */
  searchId: string;
}

export interface SearchParams {
  city: string;
  state: string;
  country: string;
  niches: string[];
  limit: number;
  /** Buscar somente empresas sem site (filtro aplicado no Actor e conferido no servidor). */
  onlyNoSite: boolean;
  /** Manter só empresas com WhatsApp (confirmado ou celular). Filtro aplicado no servidor. */
  onlyWhatsApp: boolean;
  /** Fonte dos dados. O servidor ajusta conforme as chaves configuradas. */
  source: SearchSource;
}

export type SearchResponse =
  | {
      ok: true;
      mode: SearchMode;
      status: "SUCCEEDED" | "RUNNING" | "PARTIAL";
      runId?: string;
      leads?: Lead[];
      message?: string;
    }
  | { ok: false; code: string; message: string };
