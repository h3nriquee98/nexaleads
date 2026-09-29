"use client";

import Link from "next/link";
import LeadsBrowser from "../LeadsBrowser";
import PageHeader from "./PageHeader";
import { SearchIcon } from "../Icons";
import { useApp } from "../app/AppProvider";
import { DEFAULT_FILTERS } from "@/lib/filters";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

export default function LeadsView({ niche, status }: { niche?: string; status?: string }) {
  const { hydrated, leads } = useApp();
  const active = leads.filter((l) => !l.discarded);
  const validStatus = LEAD_STATUSES.some((s) => s.value === status) ? (status as LeadStatus) : "";

  return (
    <>
      <PageHeader
        title="Meus leads"
        subtitle={
          hydrated
            ? `${active.length} leads salvos neste dispositivo · ${active.filter((l) => l.siteStatus === "sem_site").length} sem site · ${active.filter((l) => l.status === "cliente").length} clientes`
            : "Carregando…"
        }
        actions={
          <Link href="/buscar" className="btn btn-primary">
            <SearchIcon /> Buscar novos leads
          </Link>
        }
      />
      {hydrated && (
        <LeadsBrowser
          key={`${niche ?? ""}|${validStatus}`}
          initialFilters={{ ...DEFAULT_FILTERS, niche: niche ?? "", status: validStatus }}
          emptyHint={
            <>
              Você ainda não tem leads salvos.{" "}
              <Link href="/buscar" className="text-indigo-200 underline">
                Faça sua primeira busca
              </Link>
              .
            </>
          }
        />
      )}
    </>
  );
}
