import { describe, expect, it } from "vitest";
import { NICHE_GROUPS, POPULAR_NICHES } from "@/lib/niches";
import { nicheBenefit } from "@/lib/pitch";
import { validateSearch } from "@/lib/validation";

describe("lista de nichos", () => {
  it("tem pelo menos 30 nichos, sem repetição, e mantém os nichos originais", () => {
    expect(POPULAR_NICHES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(POPULAR_NICHES.map((n) => n.toLowerCase())).size).toBe(POPULAR_NICHES.length);
    for (const original of [
      "Restaurantes", "Pizzarias", "Docerias", "Salões de beleza", "Barbearias", "Clínicas", "Dentistas", "Academias", "Fotógrafos",
      "Decoradores", "Buffets", "Lojas de roupas", "Imobiliárias", "Oficinas", "Empresas de eventos", "Empresas de construção", "Profissionais autônomos",
    ]) {
      expect(POPULAR_NICHES).toContain(original);
    }
    expect(NICHE_GROUPS.every((g) => g.niches.length > 0)).toBe(true);
  });

  it("todos os nichos passam na validação da busca", () => {
    for (const niche of POPULAR_NICHES) {
      expect(validateSearch({ city: "Franca", state: "SP", niches: [niche] }).ok, niche).toBe(true);
    }
  });

  it("a abordagem tem benefício específico para os nichos sugeridos", () => {
    const generic = nicheBenefit({ niche: "Nicho qualquer", category: null });
    const withoutSpecific = POPULAR_NICHES.filter((n) => nicheBenefit({ niche: n, category: null }) === generic);
    expect(withoutSpecific).toEqual([]);
    expect(nicheBenefit({ niche: "Lava-rápidos", category: null })).toContain("agendamentos");
    expect(nicheBenefit({ niche: "Clínicas de estética", category: null })).toContain("agendamentos");
    expect(nicheBenefit({ niche: "Pet shops", category: null })).toContain("banho e tosa");
    expect(nicheBenefit({ niche: "Advogados", category: null })).toContain("credibilidade");
    expect(nicheBenefit({ niche: "Autoescolas", category: null })).toContain("alunos");
    expect(nicheBenefit({ niche: "Estúdios de tatuagem", category: null })).toContain("portfólio");
  });
});
