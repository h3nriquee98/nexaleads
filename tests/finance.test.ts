import { describe, expect, it } from "vitest";
import {
  financeToCsv,
  formatBRL,
  monthLabel,
  monthlySeries,
  parseBRL,
  recurringForMonth,
  shiftMonth,
  summarizeMonth,
  type FinanceEntry,
} from "@/lib/finance";

function entry(partial: Partial<FinanceEntry>): FinanceEntry {
  return {
    id: Math.random().toString(36),
    type: "receita",
    description: "Site",
    client: null,
    leadId: null,
    category: "Criação de site",
    amountCents: 100000,
    date: "2026-09-10",
    status: "pago",
    recurring: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

describe("financeiro", () => {
  it("entende valores em reais", () => {
    expect(parseBRL("1.500,50")).toBe(150050);
    expect(parseBRL("R$ 99")).toBe(9900);
    expect(parseBRL("1500.5")).toBe(150050);
    expect(parseBRL("1.500")).toBe(150000);
    expect(parseBRL("0")).toBeNull();
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("-10")).toBeNull();
    expect(formatBRL(150050).replace(/\s/g, " ")).toBe("R$ 1.500,50");
  });

  it("resume o mês: recebido, a receber, despesas, lucro, mensalidades e atrasados", () => {
    const entries = [
      entry({ amountCents: 200000 }),
      entry({ amountCents: 15000, recurring: true, category: "Manutenção mensal" }),
      entry({ amountCents: 80000, status: "pendente", date: "2026-09-05" }),
      entry({ type: "despesa", amountCents: 5000, category: "Ferramentas e APIs" }),
      entry({ amountCents: 999999, date: "2026-08-10" }),
    ];
    const s = summarizeMonth(entries, "2026-09", "2026-09-20");
    expect(s).toMatchObject({ received: 215000, receivable: 80000, expenses: 5000, profit: 210000, mrr: 15000, incomeCount: 3, overdue: 80000 });
    expect(s.averageTicket).toBe(Math.round(295000 / 3));
  });

  it("gera as mensalidades do mês seguinte sem duplicar", () => {
    const entries = [
      entry({ description: "Manutenção", client: "Pizzaria X", amountCents: 15000, recurring: true, date: "2026-08-31" }),
      entry({ description: "Site", amountCents: 150000, date: "2026-08-10" }),
    ];
    const created = recurringForMonth(entries, "2026-09");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ description: "Manutenção", client: "Pizzaria X", status: "pendente", date: "2026-09-30", recurring: true });
    expect(recurringForMonth([...entries, ...created], "2026-09")).toHaveLength(0);
  });

  it("série mensal e rótulos", () => {
    const series = monthlySeries([entry({}), entry({ type: "despesa", amountCents: 3000, date: "2026-07-02" })], "2026-09", 3);
    expect(series).toEqual([
      { key: "2026-07", income: 0, expenses: 3000 },
      { key: "2026-08", income: 0, expenses: 0 },
      { key: "2026-09", income: 100000, expenses: 0 },
    ]);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-09")).toBe("Setembro de 2026");
  });

  it("exporta CSV no padrão brasileiro", () => {
    const csv = financeToCsv([entry({ description: "Site; completo", client: "=cmd" })]);
    expect(csv.startsWith("﻿Data;Tipo;Descrição")).toBe(true);
    expect(csv).toContain('10/09/2026;Receita;"Site; completo";\'=cmd;Criação de site;1000,00;Recebido;Não');
  });
});
