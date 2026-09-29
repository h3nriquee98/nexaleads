import { describe, expect, it } from "vitest";
import { googlePlaceToRaw, googleTargetPerNiche } from "@/server/google-places";
import { normalizePlaces } from "@/lib/normalize";
import { validateSearch } from "@/lib/validation";

// Formato real devolvido pela Places API (New) numa busca de teste.
const realPlace = {
  id: "ChIJM3t8jm6msJQRyS3vTIZf0Mc",
  nationalPhoneNumber: "(16) 3705-3962",
  internationalPhoneNumber: "+55 16 3705-3962",
  formattedAddress: "Av. Dom Pedro I, 1208 - Parque Moema, Franca - SP, 14400-000",
  addressComponents: [
    { longText: "1208", shortText: "1208", types: ["street_number"] },
    { longText: "Avenida Dom Pedro I", shortText: "Av. Dom Pedro I", types: ["route"] },
    { longText: "Parque Moema", shortText: "Parque Moema", types: ["sublocality_level_1", "sublocality", "political"] },
    { longText: "Franca", shortText: "Franca", types: ["administrative_area_level_2", "political"] },
    { longText: "São Paulo", shortText: "SP", types: ["administrative_area_level_1", "political"] },
    { longText: "Brasil", shortText: "BR", types: ["country", "political"] },
    { longText: "14400-000", shortText: "14400-000", types: ["postal_code"] },
  ],
  rating: 4.3,
  googleMapsUri: "https://maps.google.com/?cid=14398113039124475337",
  websiteUri: "https://www.parmegianapizzas.com.br/",
  businessStatus: "OPERATIONAL",
  userRatingCount: 2462,
  displayName: { text: "Parmegiana Pizzas" },
  primaryTypeDisplayName: { text: "Delivery de Pizza" },
};

const ctx = { city: "Franca", state: "SP", niches: ["Pizzarias"], source: "google" as const };

describe("Google Places API", () => {
  it("converte o formato real da Places API para um lead completo", () => {
    const [lead] = normalizePlaces([googlePlaceToRaw(realPlace, "Pizzarias")], ctx);
    expect(lead).toMatchObject({
      id: "p_ChIJM3t8jm6msJQRyS3vTIZf0Mc",
      name: "Parmegiana Pizzas",
      category: "Delivery de Pizza",
      niche: "Pizzarias",
      street: "Av. Dom Pedro I, 1208",
      neighborhood: "Parque Moema",
      city: "Franca",
      state: "SP",
      postalCode: "14400-000",
      phone: "(16) 3705-3962",
      phoneDigits: "551637053962",
      whatsappStatus: "nao",
      siteStatus: "possui_site",
      rating: 4.3,
      reviewsCount: 2462,
      mapsUrl: "https://maps.google.com/?cid=14398113039124475337",
      inCity: true,
      source: "google",
    });
  });

  it("sem websiteUri = sem site; fechados definitivamente são descartados", () => {
    const noSite = { ...realPlace, id: "x", websiteUri: undefined, nationalPhoneNumber: "(16) 99123-4567", internationalPhoneNumber: "+55 16 99123-4567" };
    const closed = { ...realPlace, id: "y", businessStatus: "CLOSED_PERMANENTLY" };
    const leads = normalizePlaces([googlePlaceToRaw(noSite, "Pizzarias"), googlePlaceToRaw(closed, "Pizzarias")], ctx);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ siteStatus: "sem_site", whatsappStatus: "provavel", score: 100 });
  });

  it("mesmo lugar vindo do Apify e do Google vira um lead só (mesmo place ID)", () => {
    const fromApify = { title: "Parmegiana Pizzas", placeId: realPlace.id, website: "https://www.parmegianapizzas.com.br/" };
    const leads = normalizePlaces([fromApify, googlePlaceToRaw(realPlace, "Pizzarias")], ctx);
    expect(leads).toHaveLength(1);
  });

  it("pede mais resultados quando a busca é só sem site (limite de 60 por consulta)", () => {
    const base = validateSearch({ city: "Franca", state: "SP", niches: ["Pizzarias"], limit: 20 });
    const noSite = validateSearch({ city: "Franca", state: "SP", niches: ["Pizzarias"], limit: 20, onlyNoSite: true });
    const big = validateSearch({ city: "Franca", state: "SP", niches: ["Pizzarias"], limit: 50, onlyNoSite: true, onlyWhatsApp: true });
    if (!base.ok || !noSite.ok || !big.ok) throw new Error("validação");
    expect(googleTargetPerNiche(base.value)).toBe(20);
    expect(googleTargetPerNiche(noSite.value)).toBe(60);
    expect(googleTargetPerNiche(big.value)).toBe(60);
  });
});
