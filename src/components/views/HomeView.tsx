"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { BarList, StatTile } from "../Stats";
import { SiteBadge } from "../LeadParts";
import { BuildingIcon, GlobeIcon, MessageIcon, SearchIcon, SparklesIcon, UserCheckIcon, UsersIcon, WalletIcon, WhatsAppIcon } from "../Icons";
import { useApp } from "../app/AppProvider";
import { STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { formatBRL, monthKey, monthLabel, summarizeMonth } from "@/lib/finance";
import { greeting } from "@/lib/pitch";
import { compareLeads } from "@/lib/scoring";
import { LEAD_STATUSES } from "@/lib/types";

export default function HomeView() {
  const router = useRouter();
  const { hydrated, leads, lastSearch, finance, handlers } = useApp();

  const data = useMemo(() => {
    const active = leads.filter((l) => !l.discarded);
    const byStatus = (s: string) => active.filter((l) => l.status === s).length;
    const nicheMap = new Map<string, number>();
    for (const l of active) nicheMap.set(l.niche, (nicheMap.get(l.niche) ?? 0) + 1);
    return {
      total: active.length,
      noSite: active.filter((l) => l.siteStatus === "sem_site").length,
      withWhats: active.filter((l) => l.whatsappStatus !== "nao").length,
      contacted: byStatus("contatado") + byStatus("interessado") + byStatus("cliente") + byStatus("sem_interesse"),
      clients: byStatus("cliente"),
      funnel: LEAD_STATUSES.map((s) => ({ key: s.value, label: STATUS_LABEL[s.value], value: byStatus(s.value) })),
      byNiche: [...nicheMap.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
        .slice(0, 6)
        .map(([niche, value]) => ({ key: niche, label: niche, value })),
      opportunities: active
        .filter((l) => (l.status === "novo" || l.status === "contatar") && l.siteStatus === "sem_site")
        .sort(compareLeads)
        .slice(0, 5),
    };
  }, [leads]);

  const month = monthKey(new Date());
  const money = useMemo(() => summarizeMonth(finance, month), [finance, month]);
  const conversion = data.contacted ? Math.round((data.clients / data.contacted) * 100) : 0;

  if (!hydrated) return <div className="skeleton h-40 w-full" aria-hidden />;

  return (
    <>
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 left-10 size-64 rounded-full bg-indigo-500/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting()}! Bem-vindo ao <span className="text-gradient">NexaLeads</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              {data.total === 0
                ? "Encontre empresas sem site na sua cidade, gere a abordagem certa e acompanhe as vendas no financeiro."
                : `Você tem ${data.noSite} empresas sem site esperando contato. Que tal começar pelas melhores oportunidades?`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/buscar" className="btn btn-primary px-4 py-2.5">
              <SearchIcon /> Buscar leads
            </Link>
            <Link href="/leads" className="btn btn-ghost px-4 py-2.5">
              <UsersIcon /> Meus leads
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Leads na base" value={data.total.toLocaleString("pt-BR")} hint={`${data.withWhats} com WhatsApp`} icon={<BuildingIcon />} />
        <StatTile
          label="Sem site"
          value={data.noSite.toLocaleString("pt-BR")}
          hint={data.total ? `${Math.round((data.noSite / data.total) * 100)}% da base · oportunidades` : "melhores oportunidades"}
          icon={<GlobeIcon />}
        />
        <StatTile label="Clientes fechados" value={String(data.clients)} hint={data.contacted ? `${conversion}% dos contatados` : "nenhum contato ainda"} icon={<UserCheckIcon />} />
        <StatTile label="Recebido no mês" value={formatBRL(money.received)} hint={`${formatBRL(money.receivable)} a receber`} icon={<WalletIcon />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card p-4 sm:p-5 lg:col-span-3" aria-labelledby="opp-title">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="opp-title" className="flex items-center gap-2 text-sm font-semibold text-muted">
              <SparklesIcon className="text-indigo-300" /> Melhores oportunidades
            </h2>
            <Link href="/leads" className="text-xs text-indigo-200 hover:underline">
              Ver todos →
            </Link>
          </div>
          {data.opportunities.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              {data.total === 0 ? "Faça uma busca para ver aqui as empresas sem site com maior pontuação." : "Nenhuma empresa sem site aguardando contato. Busque novos leads!"}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.opportunities.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-gradient font-display text-sm font-semibold tabular-nums" title="Pontuação">
                    {lead.score}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{lead.name}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <SiteBadge lead={lead} />
                      <span className="truncate">
                        {lead.niche} · {lead.city ?? lead.searchLocation}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-primary py-1.5 text-xs" onClick={() => handlers.onPitch(lead)} aria-label={`Gerar abordagem para ${lead.name}`}>
                      <MessageIcon size={14} /> Abordagem
                    </button>
                    {lead.whatsappLink && (
                      <a className="btn btn-whatsapp px-2.5 py-1.5" href={lead.whatsappLink} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${lead.name}`}>
                        <WhatsAppIcon size={14} />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 sm:p-5 lg:col-span-2" aria-labelledby="money-title">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="money-title" className="flex items-center gap-2 text-sm font-semibold text-muted">
              <WalletIcon className="text-indigo-300" /> Financeiro · {monthLabel(month)}
            </h2>
            <Link href="/financeiro" className="text-xs text-indigo-200 hover:underline">
              Abrir →
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Recebido", money.received],
              ["A receber", money.receivable],
              ["Despesas", money.expenses],
              ["Lucro", money.profit],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-line bg-white/[0.02] p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className={`mt-1 font-display text-lg font-semibold tabular-nums ${label === "Lucro" && (value as number) < 0 ? "text-bad" : ""}`}>
                  {formatBRL(value as number)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-faint">
            {money.mrr > 0 ? `${formatBRL(money.mrr)} em mensalidades este mês.` : "Registre vendas e mensalidades no Financeiro."}
            {money.overdue > 0 && <span className="ml-1 text-amber-200">{formatBRL(money.overdue)} em atraso.</span>}
          </p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Funil de prospecção"
          rows={data.funnel}
          onPick={(key) => router.push(`/leads?status=${encodeURIComponent(key)}`)}
          emptyText="Os status aparecem aqui conforme você organiza seus leads."
        />
        <BarList
          title="Leads por nicho"
          rows={data.byNiche}
          onPick={(key) => router.push(`/leads?nicho=${encodeURIComponent(key)}`)}
          emptyText="Faça uma busca para ver a distribuição por nicho."
        />
      </div>

      {lastSearch && (
        <Link href="/buscar" className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:border-indigo-400/40">
          <span className="text-muted">
            Última busca: <span className="text-ink">{lastSearch.params.niches.join(", ")}</span> em {lastSearch.params.city} - {lastSearch.params.state} ·{" "}
            {lastSearch.count} leads · {formatDateTime(lastSearch.at)}
          </span>
          <span className="font-semibold text-indigo-200">Ver resultados →</span>
        </Link>
      )}
    </>
  );
}
