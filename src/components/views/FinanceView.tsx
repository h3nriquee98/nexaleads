"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "./PageHeader";
import { StatTile } from "../Stats";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  TrendDownIcon,
  TrendUpIcon,
  WalletIcon,
  XIcon,
} from "../Icons";
import { download, useApp } from "../app/AppProvider";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  financeToCsv,
  formatBRL,
  monthKey,
  monthLabel,
  monthlySeries,
  newEntryId,
  parseBRL,
  recurringForMonth,
  shiftMonth,
  summarizeMonth,
  todayISO,
  type EntryType,
  type FinanceEntry,
} from "@/lib/finance";

/* Cores validadas (azul × laranja): distinguíveis também para daltônicos. */
const INCOME_COLOR = "#3987e5";
const EXPENSE_COLOR = "#d95926";

export default function FinanceView() {
  const { hydrated, finance, saveEntries, push, leads, handlers } = useApp();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [typeFilter, setTypeFilter] = useState<"" | EntryType>("");
  const [editing, setEditing] = useState<FinanceEntry | "new" | null>(null);

  const summary = useMemo(() => summarizeMonth(finance, month), [finance, month]);
  const series = useMemo(() => monthlySeries(finance, month, 6), [finance, month]);
  const pendingRecurring = useMemo(() => recurringForMonth(finance, month), [finance, month]);
  const entries = useMemo(
    () => finance.filter((e) => monthKey(e.date) === month && (!typeFilter || e.type === typeFilter)),
    [finance, month, typeFilter],
  );
  const today = todayISO();

  function upsert(entry: FinanceEntry) {
    const exists = finance.some((e) => e.id === entry.id);
    saveEntries(exists ? finance.map((e) => (e.id === entry.id ? entry : e)) : [...finance, entry]);
    push("success", exists ? "Lançamento atualizado." : "Lançamento adicionado.");
    // Venda vinculada a um lead: marca o lead como cliente.
    if (!exists && entry.type === "receita" && entry.leadId) {
      const lead = leads.find((l) => l.id === entry.leadId);
      if (lead && lead.status !== "cliente") handlers.onStatus(lead.id, "cliente");
    }
    if (monthKey(entry.date) !== month) setMonth(monthKey(entry.date));
  }

  function togglePaid(entry: FinanceEntry) {
    saveEntries(finance.map((e) => (e.id === entry.id ? { ...e, status: e.status === "pago" ? "pendente" : "pago" } : e)));
  }

  function remove(entry: FinanceEntry) {
    if (!window.confirm(`Excluir “${entry.description}”?`)) return;
    saveEntries(finance.filter((e) => e.id !== entry.id));
    push("info", "Lançamento excluído.");
  }

  function generateRecurring() {
    saveEntries([...finance, ...pendingRecurring]);
    push("success", `${pendingRecurring.length} mensalidade${pendingRecurring.length === 1 ? "" : "s"} lançada${pendingRecurring.length === 1 ? "" : "s"} em ${monthLabel(month)}.`);
  }

  function exportCsv() {
    const inMonth = finance.filter((e) => monthKey(e.date) === month);
    if (!inMonth.length) return push("info", "Nenhum lançamento neste mês.");
    download(financeToCsv(inMonth), "text/csv;charset=utf-8", `nexaleads-financeiro-${month}.csv`);
    push("success", `${inMonth.length} lançamentos exportados.`);
  }

  if (!hydrated) return <div className="skeleton h-40 w-full" aria-hidden />;

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle="Vendas, mensalidades e despesas da agência. Salvo apenas neste dispositivo."
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={exportCsv}>
              <DownloadIcon /> Exportar CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <PlusIcon /> Novo lançamento
            </button>
          </>
        }
      />

      <div className="flex items-center gap-2" role="group" aria-label="Mês">
        <button type="button" className="btn btn-ghost px-2.5" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
          <ChevronLeftIcon />
        </button>
        <span className="flex min-w-48 items-center justify-center gap-2 font-display text-lg font-semibold" aria-live="polite">
          <CalendarIcon className="text-indigo-300" /> {monthLabel(month)}
        </span>
        <button type="button" className="btn btn-ghost px-2.5" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
          <ChevronRightIcon />
        </button>
        {month !== monthKey(new Date()) && (
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setMonth(monthKey(new Date()))}>
            Mês atual
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Recebido" value={formatBRL(summary.received)} hint={`${summary.incomeCount} receita${summary.incomeCount === 1 ? "" : "s"} no mês`} icon={<TrendUpIcon />} />
        <StatTile
          label="A receber"
          value={formatBRL(summary.receivable)}
          hint={summary.overdue > 0 ? `${formatBRL(summary.overdue)} em atraso` : "nenhum atraso"}
          icon={<WalletIcon />}
        />
        <StatTile label="Despesas" value={formatBRL(summary.expenses)} hint="ferramentas, anúncios…" icon={<TrendDownIcon />} />
        <StatTile
          label="Lucro"
          value={formatBRL(summary.profit)}
          hint={`Mensalidades: ${formatBRL(summary.mrr)} · ticket médio ${formatBRL(summary.averageTicket)}`}
          icon={<CheckIcon />}
        />
      </div>

      {pendingRecurring.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-400/30 bg-indigo-400/10 px-4 py-3 text-sm text-indigo-100">
          <RefreshIcon className="shrink-0" />
          <p className="flex-1">
            {pendingRecurring.length} mensalidade{pendingRecurring.length === 1 ? "" : "s"} de {monthLabel(shiftMonth(month, -1))} ainda não {pendingRecurring.length === 1 ? "foi lançada" : "foram lançadas"} neste mês (
            {formatBRL(pendingRecurring.reduce((s, e) => s + e.amountCents, 0))}).
          </p>
          <button type="button" className="btn btn-primary" onClick={generateRecurring}>
            Gerar mensalidades
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <IncomeChart series={series} />

        <section className="card p-4 sm:p-5 lg:col-span-3" aria-labelledby="entries-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="entries-title" className="text-sm font-semibold text-muted">
              Lançamentos de {monthLabel(month)}
            </h2>
            <div className="flex gap-1.5" role="group" aria-label="Filtrar lançamentos">
              {[
                ["", "Todos"],
                ["receita", "Receitas"],
                ["despesa", "Despesas"],
              ].map(([value, label]) => (
                <button key={value} type="button" className="chip py-1 text-xs" aria-pressed={typeFilter === value} onClick={() => setTypeFilter(value as "" | EntryType)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="grid place-items-center gap-2 py-10 text-center">
              <WalletIcon size={28} className="text-faint" />
              <p className="text-sm text-muted">Nenhum lançamento {typeFilter ? `de ${typeFilter}` : ""} em {monthLabel(month)}.</p>
              <button type="button" className="btn btn-ghost mt-1" onClick={() => setEditing("new")}>
                <PlusIcon /> Adicionar lançamento
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-line" aria-label="Lançamentos">
              {entries.map((e) => {
                const overdue = e.type === "receita" && e.status === "pendente" && e.date < today;
                return (
                  <li key={e.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_1fr_auto_auto]">
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-lg ${e.type === "receita" ? "bg-[#3987e5]/15 text-[#86b6ef]" : "bg-[#d95926]/15 text-[#f0a07e]"}`}
                      aria-hidden
                    >
                      {e.type === "receita" ? <TrendUpIcon size={16} /> : <TrendDownIcon size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {e.description}
                        {e.recurring && <span className="badge ml-2 border-indigo-400/30 bg-indigo-400/10 text-indigo-200">Mensal</span>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {e.date.split("-").reverse().join("/")} · {e.category}
                        {e.client ? ` · ${e.client}` : ""}
                      </p>
                    </div>
                    <div className="col-start-2 flex min-w-0 flex-wrap items-center justify-between gap-2 sm:contents">
                    <div className="flex items-center gap-2 sm:block sm:text-right">
                      <p className="whitespace-nowrap font-display font-semibold tabular-nums">
                        {e.type === "despesa" ? "− " : "+ "}
                        {formatBRL(e.amountCents)}
                      </p>
                      <span
                        className={`badge ${
                          e.status === "pago"
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                            : overdue
                              ? "border-red-400/40 bg-red-400/10 text-red-200"
                              : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                        }`}
                      >
                        {overdue && <AlertIcon size={11} />}
                        {e.status === "pago" ? (e.type === "receita" ? "Recebido" : "Pago") : overdue ? "Atrasado" : "Pendente"}
                      </span>
                    </div>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost px-2 py-1.5"
                        onClick={() => togglePaid(e)}
                        title={e.status === "pago" ? "Marcar como pendente" : e.type === "receita" ? "Marcar como recebido" : "Marcar como pago"}
                        aria-label={`${e.status === "pago" ? "Marcar como pendente" : e.type === "receita" ? "Marcar como recebido" : "Marcar como pago"}: ${e.description}`}
                      >
                        <CheckIcon size={14} />
                      </button>
                      <button type="button" className="btn btn-ghost px-2 py-1.5" onClick={() => setEditing(e)} aria-label={`Editar ${e.description}`} title="Editar">
                        <EditIcon size={14} />
                      </button>
                      <button type="button" className="btn btn-ghost px-2 py-1.5 text-red-200" onClick={() => remove(e)} aria-label={`Excluir ${e.description}`} title="Excluir">
                        <TrashIcon size={14} />
                      </button>
                    </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {editing && <EntryModal entry={editing === "new" ? null : editing} month={month} onClose={() => setEditing(null)} onSave={upsert} />}
    </>
  );
}

/** Barras agrupadas: receitas recebidas × despesas dos últimos 6 meses. */
function IncomeChart({ series }: { series: { key: string; income: number; expenses: number }[] }) {
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expenses]));
  const empty = series.every((s) => s.income === 0 && s.expenses === 0);
  return (
    <section className="card p-4 sm:p-5 lg:col-span-2" aria-labelledby="chart-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="chart-title" className="text-sm font-semibold text-muted">
          Últimos 6 meses
        </h2>
        <div className="flex gap-3 text-xs text-muted" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: INCOME_COLOR }} /> Receitas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: EXPENSE_COLOR }} /> Despesas
          </span>
        </div>
      </div>
      {empty ? (
        <p className="py-12 text-center text-sm text-faint">O gráfico aparece quando houver lançamentos.</p>
      ) : (
        <>
          <div className="flex h-44 items-end gap-3 border-b border-line" role="img" aria-label="Receitas e despesas dos últimos 6 meses">
            {series.map((s) => (
              <div key={s.key} className="flex h-full flex-1 items-end justify-center gap-[2px]">
                {[
                  { value: s.income, color: INCOME_COLOR, label: "Receitas" },
                  { value: s.expenses, color: EXPENSE_COLOR, label: "Despesas" },
                ].map((bar) => (
                  <span
                    key={bar.label}
                    className="w-full max-w-4 rounded-t-[4px] transition-[height] duration-500 hover:brightness-125"
                    style={{ height: `${bar.value ? Math.max(2, (bar.value / max) * 100) : 0}%`, background: bar.color }}
                    title={`${monthLabel(s.key)} · ${bar.label}: ${formatBRL(bar.value)}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 text-center text-xs text-muted">
            {series.map((s) => (
              <span key={s.key} className="flex-1">
                {monthLabel(s.key, "short")}
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>Receitas e despesas por mês</caption>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Receitas</th>
                <th>Despesas</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.key}>
                  <td>{monthLabel(s.key)}</td>
                  <td>{formatBRL(s.income)}</td>
                  <td>{formatBRL(s.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function EntryModal({ entry, month, onClose, onSave }: { entry: FinanceEntry | null; month: string; onClose: () => void; onSave: (e: FinanceEntry) => void }) {
  const { leads, finance } = useApp();
  const [type, setType] = useState<EntryType>(entry?.type ?? "receita");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [amount, setAmount] = useState(entry ? (entry.amountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
  const [date, setDate] = useState(entry?.date ?? (month === monthKey(new Date()) ? todayISO() : `${month}-01`));
  const [category, setCategory] = useState(entry?.category ?? INCOME_CATEGORIES[0]);
  const [client, setClient] = useState(entry?.client ?? "");
  const [paid, setPaid] = useState(entry ? entry.status === "pago" : true);
  const [recurring, setRecurring] = useState(entry?.recurring ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstField = useRef<HTMLInputElement>(null);

  const categories = type === "receita" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const clientOptions = useMemo(() => {
    const fromLeads = leads.filter((l) => l.status === "cliente" || l.status === "interessado").map((l) => l.name);
    const fromEntries = finance.map((e) => e.client).filter((c): c is string => Boolean(c));
    return [...new Set([...fromLeads, ...fromEntries])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [leads, finance]);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function changeType(next: EntryType) {
    setType(next);
    setCategory((next === "receita" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0]);
    if (next === "despesa") setRecurring(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    const cents = parseBRL(amount);
    if (!description.trim()) nextErrors.description = "Informe uma descrição.";
    if (!cents) nextErrors.amount = "Informe um valor válido (ex.: 1.500,00).";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) nextErrors.date = "Informe a data.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const clientName = client.trim() || null;
    const lead = clientName ? leads.find((l) => l.name.toLowerCase() === clientName.toLowerCase()) : undefined;
    onSave({
      id: entry?.id ?? newEntryId(),
      type,
      description: description.trim().slice(0, 120),
      client: clientName?.slice(0, 120) ?? null,
      leadId: lead?.id ?? entry?.leadId ?? null,
      category,
      amountCents: cents!,
      date,
      status: paid ? "pago" : "pendente",
      recurring: type === "receita" && recurring,
      createdAt: entry?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-title"
        noValidate
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-line p-4 sm:p-5">
          <h2 id="entry-title" className="font-display text-lg font-semibold">
            {entry ? "Editar lançamento" : "Novo lançamento"}
          </h2>
          <button type="button" className="btn btn-ghost px-2" onClick={onClose} aria-label="Fechar">
            <XIcon />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
            {(["receita", "despesa"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => changeType(t)}
                className={`btn py-2.5 ${type === t ? (t === "receita" ? "border border-[#3987e5]/60 bg-[#3987e5]/20" : "border border-[#d95926]/60 bg-[#d95926]/20") : "btn-ghost"}`}
              >
                {t === "receita" ? <TrendUpIcon /> : <TrendDownIcon />} {t === "receita" ? "Receita" : "Despesa"}
              </button>
            ))}
          </div>

          <label className="block text-sm font-medium">
            Descrição
            <input
              ref={firstField}
              className="field mt-1.5"
              value={description}
              maxLength={120}
              placeholder={type === "receita" ? "Ex.: Site da Pizzaria Bella Massa" : "Ex.: Créditos do Apify"}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={Boolean(errors.description)}
            />
            {errors.description && <span className="mt-1 block text-xs text-bad">{errors.description}</span>}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Valor (R$)
              <input
                className="field mt-1.5"
                value={amount}
                inputMode="decimal"
                placeholder="1.500,00"
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={Boolean(errors.amount)}
              />
              {errors.amount && <span className="mt-1 block text-xs text-bad">{errors.amount}</span>}
            </label>
            <label className="block text-sm font-medium">
              {type === "receita" ? "Data / vencimento" : "Data"}
              <input type="date" className="field mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors.date)} />
              {errors.date && <span className="mt-1 block text-xs text-bad">{errors.date}</span>}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Categoria
              <select className="field mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {type === "receita" ? "Cliente" : "Fornecedor"} <span className="font-normal text-faint">(opcional)</span>
              <input className="field mt-1.5" value={client} maxLength={120} list="finance-clients" onChange={(e) => setClient(e.target.value)} />
              <datalist id="finance-clients">
                {clientOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-indigo-400" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              {type === "receita" ? "Já recebido" : "Já pago"}
            </label>
            {type === "receita" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-indigo-400" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                Mensalidade (repete todo mês)
              </label>
            )}
          </div>
          {type === "receita" && !entry && (
            <p className="text-xs text-faint">Se o cliente for um lead do NexaLeads, ele é marcado automaticamente como “Cliente”.</p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line p-4 sm:p-5">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            <CheckIcon /> Salvar
          </button>
        </footer>
      </form>
    </div>
  );
}
