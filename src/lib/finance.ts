/**
 * Financeiro da agência: receitas (sites vendidos, mensalidades) e despesas (ferramentas, anúncios…).
 * Tudo salvo apenas neste navegador, como os leads. Valores guardados em centavos para evitar erros de arredondamento.
 */

export type EntryType = "receita" | "despesa";
export type EntryStatus = "pago" | "pendente";

export interface FinanceEntry {
  id: string;
  type: EntryType;
  description: string;
  /** Nome do cliente (livre) — opcional. */
  client: string | null;
  /** Lead vinculado, quando o cliente veio do NexaLeads. */
  leadId: string | null;
  category: string;
  /** Valor em centavos (sempre positivo). */
  amountCents: number;
  /** Data de vencimento/pagamento no formato AAAA-MM-DD. */
  date: string;
  status: EntryStatus;
  /** Receita que se repete todo mês (ex.: manutenção do site). */
  recurring: boolean;
  createdAt: string;
}

export const INCOME_CATEGORIES = ["Criação de site", "Landing page", "Loja virtual", "Manutenção mensal", "Hospedagem e domínio", "Tráfego pago", "Social media", "Outros"];
export const EXPENSE_CATEGORIES = ["Ferramentas e APIs", "Hospedagem e domínios", "Anúncios", "Freelancers", "Impostos", "Outros"];

const FINANCE_KEY = "nexaleads:v1:finance";

/** Converte "1.500,50", "1500.5", "R$ 99" em centavos. Retorna null se inválido. */
export function parseBRL(input: string): number | null {
  let text = input.replace(/[R$\s]/g, "").trim();
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return Number.isFinite(cents) && cents > 0 && cents < 100_000_000_00 ? cents : null;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "2026-09" a partir de uma data AAAA-MM-DD ou Date. */
export function monthKey(date: string | Date): string {
  if (typeof date === "string") return date.slice(0, 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function todayISO(now = new Date()): string {
  return `${monthKey(now)}-${String(now.getDate()).padStart(2, "0")}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

export function monthLabel(key: string, style: "long" | "short" = "long"): string {
  const [y, m] = key.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", style === "long" ? { month: "long", year: "numeric" } : { month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

export interface MonthSummary {
  /** Receitas já recebidas no mês. */
  received: number;
  /** Receitas pendentes com vencimento no mês. */
  receivable: number;
  /** Despesas do mês (pagas + pendentes). */
  expenses: number;
  /** Recebido - despesas. */
  profit: number;
  /** Receita recorrente mensal (mensalidades lançadas no mês). */
  mrr: number;
  /** Média das receitas do mês. */
  averageTicket: number;
  incomeCount: number;
  /** Receitas pendentes com data já passada. */
  overdue: number;
}

export function summarizeMonth(entries: FinanceEntry[], key: string, today = todayISO()): MonthSummary {
  const inMonth = entries.filter((e) => monthKey(e.date) === key);
  const income = inMonth.filter((e) => e.type === "receita");
  const sum = (list: FinanceEntry[]) => list.reduce((s, e) => s + e.amountCents, 0);
  const received = sum(income.filter((e) => e.status === "pago"));
  const receivable = sum(income.filter((e) => e.status === "pendente"));
  const expenses = sum(inMonth.filter((e) => e.type === "despesa"));
  return {
    received,
    receivable,
    expenses,
    profit: received - expenses,
    mrr: sum(income.filter((e) => e.recurring)),
    averageTicket: income.length ? Math.round(sum(income) / income.length) : 0,
    incomeCount: income.length,
    overdue: sum(entries.filter((e) => e.type === "receita" && e.status === "pendente" && e.date < today)),
  };
}

/** Receitas (pagas) e despesas dos últimos `months` meses até `endKey`. */
export function monthlySeries(entries: FinanceEntry[], endKey: string, months = 6): { key: string; income: number; expenses: number }[] {
  return Array.from({ length: months }, (_, i) => {
    const key = shiftMonth(endKey, i - (months - 1));
    const inMonth = entries.filter((e) => monthKey(e.date) === key);
    return {
      key,
      income: inMonth.filter((e) => e.type === "receita" && e.status === "pago").reduce((s, e) => s + e.amountCents, 0),
      expenses: inMonth.filter((e) => e.type === "despesa").reduce((s, e) => s + e.amountCents, 0),
    };
  });
}

/**
 * Cria no mês `key` as mensalidades recorrentes do mês anterior que ainda não foram lançadas.
 * Mantém o dia do vencimento (limitado ao último dia do mês) e marca como pendente.
 */
export function recurringForMonth(entries: FinanceEntry[], key: string, now = new Date()): FinanceEntry[] {
  const previous = shiftMonth(key, -1);
  const already = new Set(
    entries.filter((e) => monthKey(e.date) === key && e.recurring).map((e) => `${e.description}|${e.client ?? ""}|${e.amountCents}`),
  );
  const [y, m] = key.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return entries
    .filter((e) => e.type === "receita" && e.recurring && monthKey(e.date) === previous)
    .filter((e) => !already.has(`${e.description}|${e.client ?? ""}|${e.amountCents}`))
    .map((e) => ({
      ...e,
      id: newEntryId(),
      status: "pendente" as const,
      date: `${key}-${String(Math.min(Number(e.date.slice(8, 10)) || 1, lastDay)).padStart(2, "0")}`,
      createdAt: now.toISOString(),
    }));
}

export function newEntryId(): string {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sortEntries(entries: FinanceEntry[]): FinanceEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function loadFinance(): FinanceEntry[] {
  try {
    const raw = window.localStorage.getItem(FINANCE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: FinanceEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries.filter((e) => e && typeof e.id === "string" && Number.isFinite(e.amountCents)) : [];
  } catch {
    return [];
  }
}

export function saveFinance(entries: FinanceEntry[]): boolean {
  try {
    window.localStorage.setItem(FINANCE_KEY, JSON.stringify({ version: 1, entries }));
    return true;
  } catch {
    return false;
  }
}

export function clearFinance(): void {
  try {
    window.localStorage.removeItem(FINANCE_KEY);
  } catch {
    /* ignora */
  }
}

/** CSV no padrão do Excel brasileiro (;) com BOM. */
export function financeToCsv(entries: FinanceEntry[]): string {
  const cell = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : /^[=+\-@]/.test(v) ? `'${v}` : v);
  const rows = [
    ["Data", "Tipo", "Descrição", "Cliente", "Categoria", "Valor", "Status", "Recorrente"],
    ...sortEntries(entries).map((e) => [
      e.date.split("-").reverse().join("/"),
      e.type === "receita" ? "Receita" : "Despesa",
      e.description,
      e.client ?? "",
      e.category,
      (e.amountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, useGrouping: false }),
      e.status === "pago" ? (e.type === "receita" ? "Recebido" : "Pago") : "Pendente",
      e.recurring ? "Sim" : "Não",
    ]),
  ];
  return `﻿${rows.map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}
