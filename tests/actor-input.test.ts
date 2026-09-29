import { describe, expect, it } from "vitest";
import { buildActorInput } from "@/server/apify";
import type { ApifyConfig } from "@/server/config";
import { fetchLimit, validateSearch } from "@/lib/validation";

const config: ApifyConfig = {
  token: "t",
  actorId: "compass~crawler-google-places",
  maxLeads: 100,
  language: "pt-BR",
  runTimeoutSecs: 600,
  maxChargeUsd: null,
  extraInput: {},
  baseUrl: "https://api.apify.com",
  googleApiKey: null,
  googleBaseUrl: "https://places.googleapis.com",
  sources: { apify: true, google: false },
  demoMode: false,
  configError: null,
};

describe("buscar apenas empresas sem site", () => {
  it("envia o filtro website=withoutWebsite ao Google Maps Scraper quando ligado", () => {
    const r = validateSearch({ city: "Franca", state: "SP", niches: ["Pizzarias"], onlyNoSite: true });
    expect(r.ok && r.value.onlyNoSite).toBe(true);
    if (r.ok) expect(buildActorInput(r.value, config)).toMatchObject({ website: "withoutWebsite", searchStringsArray: ["Pizzarias"] });
  });

  it("não envia o filtro quando desligado", () => {
    const r = validateSearch({ city: "Franca", state: "SP", niches: ["Pizzarias"] });
    expect(r.ok && r.value.onlyNoSite).toBe(false);
    if (r.ok) expect(buildActorInput(r.value, config)).not.toHaveProperty("website");
  });

  it("aceita o parâmetro vindo da URL e diferencia buscas com e sem o filtro", () => {
    const a = validateSearch({ city: "Franca", state: "SP", niches: ["A"], onlyNoSite: "1" });
    const b = validateSearch({ city: "Franca", state: "SP", niches: ["A"], onlyNoSite: "0" });
    expect(a.ok && a.value.onlyNoSite).toBe(true);
    expect(b.ok && b.value.onlyNoSite).toBe(false);
  });
});

describe("apenas empresas com WhatsApp", () => {
  it("busca o dobro de empresas para compensar as que não têm WhatsApp", () => {
    const r = validateSearch({ city: "Franca", state: "SP", niches: ["Pizzarias", "Docerias"], limit: 20, onlyWhatsApp: "1" });
    expect(r.ok && r.value.onlyWhatsApp).toBe(true);
    if (r.ok) {
      expect(fetchLimit(r.value)).toBe(40);
      expect(buildActorInput(r.value, config).maxCrawledPlacesPerSearch).toBe(20);
    }
  });

  it("sem a opção, busca exatamente a quantidade pedida", () => {
    const r = validateSearch({ city: "Franca", state: "SP", niches: ["Pizzarias", "Docerias"], limit: 20 });
    expect(r.ok && r.value.onlyWhatsApp).toBe(false);
    if (r.ok) {
      expect(fetchLimit(r.value)).toBe(20);
      expect(buildActorInput(r.value, config).maxCrawledPlacesPerSearch).toBe(10);
    }
  });
});
