import { SITE_STATUS_LABEL, STATUS_LABEL, WHATSAPP_LABEL, formatDateTime, formatRating } from "./labels";
import type { StoredLead } from "./types";
import { buildXlsx, type Cell } from "./xlsx";

export const EXPORT_HEADERS = [
  "Pontuação",
  "Empresa",
  "Categoria",
  "Nicho",
  "Status do site",
  "Site",
  "Telefone",
  "WhatsApp",
  "Link WhatsApp",
  "Nota",
  "Avaliações",
  "Endereço",
  "Bairro",
  "Cidade",
  "UF",
  "CEP",
  "Google Maps",
  "Instagram",
  "Status",
  "Data da coleta",
  "Origem",
];

export function leadToRow(lead: StoredLead): Cell[] {
  return [
    lead.score,
    lead.name,
    lead.category,
    lead.niche,
    SITE_STATUS_LABEL[lead.siteStatus] + (lead.siteNote ? ` (${lead.siteNote})` : ""),
    lead.website,
    lead.phone,
    WHATSAPP_LABEL[lead.whatsappStatus],
    lead.whatsappLink,
    lead.rating,
    lead.reviewsCount,
    lead.address,
    lead.neighborhood,
    lead.city,
    lead.state,
    lead.postalCode,
    lead.mapsUrl,
    lead.instagram,
    STATUS_LABEL[lead.status],
    formatDateTime(lead.collectedAt),
    lead.source === "demo" ? "Demonstração (fictício)" : lead.source === "google" ? "Google Places API" : "Apify / Google Maps",
  ];
}

/** Evita que planilhas interpretem textos como fórmulas (CSV injection). */
function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? value.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 2 }) : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^\+?\d[\d\s()-]*$/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV no padrão brasileiro do Excel: separador ";" e BOM UTF-8 para acentos. */
export function leadsToCsv(leads: StoredLead[]): string {
  const lines = [EXPORT_HEADERS, ...leads.map(leadToRow)].map((row) => row.map(csvCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function leadsToXlsx(leads: StoredLead[]): Uint8Array {
  return buildXlsx(EXPORT_HEADERS, leads.map(leadToRow), "Leads");
}

export function leadToText(lead: StoredLead): string {
  const lines = [
    `🏢 ${lead.name}${lead.category ? ` — ${lead.category}` : ""}`,
    `Pontuação: ${lead.score}/100 · ${SITE_STATUS_LABEL[lead.siteStatus]}${lead.siteNote ? ` (${lead.siteNote})` : ""}`,
    lead.address ? `Endereço: ${lead.address}` : null,
    lead.phone ? `Telefone: ${lead.phone}` : null,
    lead.whatsappLink ? `WhatsApp: ${lead.whatsappLink} (${WHATSAPP_LABEL[lead.whatsappStatus]})` : null,
    lead.rating !== null ? `Nota: ${formatRating(lead.rating)} (${lead.reviewsCount ?? 0} avaliações)` : null,
    lead.website ? `Site: ${lead.website}` : null,
    lead.instagram ? `Instagram: ${lead.instagram}` : null,
    lead.mapsUrl ? `Google Maps: ${lead.mapsUrl}` : null,
    `Status: ${STATUS_LABEL[lead.status]} · Coletado em ${formatDateTime(lead.collectedAt)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function leadsToText(leads: StoredLead[]): string {
  return leads.map(leadToText).join("\n\n");
}


export function exportFileName(prefix: string, ext: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `${prefix}-${stamp}.${ext}`;
}
