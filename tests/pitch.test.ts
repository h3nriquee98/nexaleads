import { describe, expect, it } from "vitest";
import { PITCH_VARIANTS, generatePitch, greeting, nicheBenefit, whatsappLinkWithText } from "@/lib/pitch";
import { normalizePlace } from "@/lib/normalize";

const ctx = { city: "Franca", state: "SP", niches: ["Pizzarias"], source: "apify" as const };
const base = { title: "Pizzaria Bella Massa", categoryName: "Pizzaria", searchString: "Pizzarias", city: "Franca", placeId: "x", phone: "(16) 99123-4567", totalScore: 4.7, reviewsCount: 58 };
const morning = new Date("2026-09-23T09:00:00");

describe("gerar abordagem", () => {
  it("lead sem site: cita a empresa, a falta de site, vendas e demonstração sem compromisso", () => {
    const lead = normalizePlace({ ...base, website: null }, ctx)!;
    const text = generatePitch(lead, { senderName: "Thiago", now: morning });
    expect(text).toContain("Bom dia!");
    expect(text).toContain("Aqui é Thiago, da Nexa Agency.");
    expect(text).toContain("Pizzaria Bella Massa");
    expect(text).toContain("percebemos que vocês ainda não têm um site");
    expect(text).toContain("vendas");
    expect(text).toContain("demonstração sem compromisso");
    expect(text).toContain("nota 4,7 com 58 avaliações");
    expect(text).toContain("cardápio online");
  });

  it("todas as versões mencionam demonstração e o nome da empresa, sem campos vazios", () => {
    const lead = normalizePlace({ ...base, website: null, totalScore: null, reviewsCount: 0 }, ctx)!;
    for (let v = 0; v < PITCH_VARIANTS; v++) {
      const text = generatePitch(lead, { variant: v, now: morning });
      expect(text).toContain("Pizzaria Bella Massa");
      expect(text).toMatch(/demonstração (gratuita e )?sem compromisso/);
      expect(text).not.toMatch(/undefined|null|nota/);
      expect(text).toContain("Nexa Agency");
    }
  });

  it("só Instagram, site próprio e não identificado geram textos coerentes", () => {
    const insta = normalizePlace({ ...base, website: "https://instagram.com/bellamassa" }, ctx)!;
    expect(generatePitch(insta)).toContain("divulgam pelo Instagram, mas ainda não têm um site próprio");
    const withSite = normalizePlace({ ...base, website: "https://bellamassa.com.br" }, ctx)!;
    const t = generatePitch(withSite);
    expect(t).toContain("já têm um site");
    expect(t).not.toContain("não têm um site");
    const unknown = normalizePlace({ name: "Loja X", phone: "16 99999-0000" }, { ...ctx, niches: ["Lojas de roupas"] })!;
    expect(generatePitch(unknown)).toContain("não encontramos um site de vocês");
  });

  it("adapta o benefício ao nicho", () => {
    expect(nicheBenefit({ niche: "Barbearias", category: null })).toContain("agendamentos");
    expect(nicheBenefit({ niche: "Profissionais autônomos", category: null })).toContain("seus serviços");
    expect(nicheBenefit({ niche: "Dentistas", category: null })).toContain("consultas");
    expect(nicheBenefit({ niche: "Chaveiros", category: null })).toContain("novos clientes");
  });

  it("saudação conforme o horário e link do WhatsApp com texto", () => {
    expect(greeting(new Date("2026-09-23T14:00:00"))).toBe("Boa tarde");
    expect(greeting(new Date("2026-09-23T20:00:00"))).toBe("Boa noite");
    expect(whatsappLinkWithText("https://wa.me/5516991234567", "Olá & tudo bem?")).toBe("https://wa.me/5516991234567?text=Ol%C3%A1%20%26%20tudo%20bem%3F");
    expect(whatsappLinkWithText(null, "x")).toBeNull();
  });
});
