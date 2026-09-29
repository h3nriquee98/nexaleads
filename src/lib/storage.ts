import { compareLeads } from "./scoring";
import type { Lead, LeadStatus, SearchMode, SearchParams, StoredLead } from "./types";

/**
 * Persistência local (somente neste navegador/dispositivo).
 * Nada é enviado para servidores: status e leads ficam no localStorage.
 */
const LEADS_KEY = "nexaleads:v1:leads";
const LAST_SEARCH_KEY = "nexaleads:v1:last-search";

export interface LastSearch {
  id: string;
  params: SearchParams;
  at: string;
  count: number;
  mode: SearchMode;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadLeads(): StoredLead[] {
  try {
    const raw = storage()?.getItem(LEADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { leads?: StoredLead[] };
    return Array.isArray(parsed.leads) ? parsed.leads.filter((l) => l && typeof l.id === "string") : [];
  } catch {
    return [];
  }
}

/** Retorna false se o navegador recusar salvar (cota cheia, modo privado etc.). */
export function saveLeads(leads: StoredLead[]): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(LEADS_KEY, JSON.stringify({ version: 1, leads }));
    return true;
  } catch {
    return false;
  }
}

export function loadLastSearch(): LastSearch | null {
  try {
    const raw = storage()?.getItem(LAST_SEARCH_KEY);
    return raw ? (JSON.parse(raw) as LastSearch) : null;
  } catch {
    return null;
  }
}

export function saveLastSearch(search: LastSearch): void {
  try {
    storage()?.setItem(LAST_SEARCH_KEY, JSON.stringify(search));
  } catch {
    /* ignora */
  }
}

export function clearAll(): void {
  try {
    storage()?.removeItem(LEADS_KEY);
    storage()?.removeItem(LAST_SEARCH_KEY);
  } catch {
    /* ignora */
  }
}

/** Mescla novos resultados preservando status/descartes já definidos pelo usuário. */
export function mergeLeads(existing: StoredLead[], incoming: Lead[], searchId: string, now = new Date()): StoredLead[] {
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (const lead of incoming) {
    const previous = byId.get(lead.id);
    byId.set(lead.id, {
      ...lead,
      status: previous?.status ?? "novo",
      discarded: previous?.discarded ?? false,
      updatedAt: previous?.updatedAt ?? now.toISOString(),
      searchId,
    });
  }
  return [...byId.values()].sort(compareLeads);
}

export function updateLead(
  leads: StoredLead[],
  id: string,
  patch: Partial<Pick<StoredLead, "status" | "discarded">>,
  now = new Date(),
): StoredLead[] {
  return leads.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now.toISOString() } : l));
}

export type { LeadStatus };
