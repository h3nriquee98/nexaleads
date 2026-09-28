import { expect, test, type Page } from "@playwright/test";
import { login, loginApi } from "./helpers";

const BASE = "http://localhost:3101";
const MOCK = "http://localhost:4010";
const OUT = process.env.E2E_OUT_DIR ?? "test-results";

async function search(page: Page, niche: string) {
  await page.getByRole("textbox", { name: "Cidade" }).fill("Franca");
  await page.getByLabel("Estado").selectOption("SP");
  const chip = page.getByRole("button", { name: niche, exact: true });
  if (await chip.count()) await chip.click();
  else {
    await page.getByLabel("Nicho personalizado").fill(niche);
    await page.getByLabel("Nicho personalizado").press("Enter");
  }
  await page.getByRole("button", { name: "Encontrar leads" }).click();
}

test("busca real via Apify (API simulada) com carregamento e polling", async ({ page, request }) => {
  await login(page, BASE);
  await loginApi(request, BASE);
  await expect(page.getByText("Apify conectado")).toBeVisible();
  const before = (await (await request.get(`${MOCK}/__last-input`)).json()).runsStarted;

  await search(page, "Pizzarias");
  // Clique duplo não deve gerar outra execução
  await page.getByRole("button", { name: /Buscando…|Encontrar leads/ }).click({ force: true }).catch(() => {});
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect(page.getByText(/Coletando empresas|Crawled/)).toBeVisible();
  await page.screenshot({ path: `${OUT}/07-apify-carregando.png` });

  await expect(page.locator("article").first()).toBeVisible({ timeout: 30_000 });
  const last = await (await request.get(`${MOCK}/__last-input`)).json();
  expect(last.runsStarted - before).toBe(1);
  expect(last.input).toMatchObject({
    searchStringsArray: ["Pizzarias"],
    locationQuery: "Franca, SP, Brasil",
    maxCrawledPlacesPerSearch: 20,
    language: "pt-BR",
    skipClosedPlaces: true,
  });
  expect(last.query.maxItems).toBe("20");

  const cards = page.locator("article");
  await expect(cards).toHaveCount(4); // fechada definitivamente foi removida
  await expect(cards.first().locator("h3")).toHaveText("Pizzaria Sem Site Teste");
  await expect(cards.first().getByRole("img", { name: "Pontuação 100 de 100" })).toBeVisible();
  await expect(page.locator("article", { hasText: "Pizzaria Só Instagram" }).getByRole("link", { name: "Instagram", exact: true })).toHaveAttribute(
    "href",
    "https://www.instagram.com/perfil_teste/",
  );
  await expect(page.locator("article", { hasText: "Pizzaria Cidade Vizinha" }).getByText("Outra cidade")).toBeVisible();
  await expect(page.locator("article", { hasText: "Pizzaria Com Site Teste" }).getByText("Possui site")).toBeVisible();
  await expect(page.getByText("Fictício")).toHaveCount(0);

  // Filtro por cidade
  await page.getByRole("combobox", { name: "Filtrar por cidade" }).selectOption("Franca - São Paulo");
  await expect(cards).toHaveCount(3);
  await page.screenshot({ path: `${OUT}/08-apify-resultados.png`, fullPage: true });

  // O token nunca chega ao navegador
  const html = await page.content();
  expect(html).not.toContain("test-token");
  const scripts = await page.locator("script[src]").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
  for (const src of scripts) expect(await (await request.get(src)).text()).not.toContain("test-token");
  const statusRes = await request.get(`${BASE}/api/status`);
  expect(statusRes.status()).toBe(200);
  const status = await statusRes.text();
  expect(status).not.toContain("test-token");
  expect(status).not.toContain("senha-de-teste");
});

test("buscar apenas empresas sem site envia o filtro ao Apify", async ({ page, request }) => {
  await login(page, BASE);
  await page.getByRole("textbox", { name: "Cidade" }).fill("Franca");
  await page.getByLabel("Estado").selectOption("SP");
  const toggle = page.getByRole("switch", { name: /Buscar apenas empresas sem site/ });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Nicho personalizado").fill("Lanchonetes");
  await page.getByLabel("Nicho personalizado").press("Enter");
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.getByText(/Buscando Lanchonetes sem site em Franca - SP/)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible({ timeout: 30_000 });

  const last = await (await request.get(`${MOCK}/__last-input`)).json();
  expect(last.input).toMatchObject({ website: "withoutWebsite", searchStringsArray: ["Lanchonetes"] });

  const cards = page.locator("article");
  await expect(cards).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(cards.nth(i).locator(".badge").first()).toContainText("Sem site");
  await expect(page.getByRole("button", { name: "Apenas sem site" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${OUT}/14-apenas-sem-site.png`, fullPage: true });

  // A opção fica lembrada para a próxima busca
  await page.reload();
  await expect(page.getByRole("switch", { name: /Buscar apenas empresas sem site/ })).toHaveAttribute("aria-checked", "true");
});

test("apenas empresas com WhatsApp descarta quem não tem WhatsApp", async ({ page, request }) => {
  await login(page, BASE);
  await page.getByRole("textbox", { name: "Cidade" }).fill("Franca");
  await page.getByLabel("Estado").selectOption("SP");
  const noSite = page.getByRole("switch", { name: /Buscar apenas empresas sem site/ });
  if ((await noSite.getAttribute("aria-checked")) === "true") await noSite.click();
  const whats = page.getByRole("switch", { name: /Apenas empresas com WhatsApp/ });
  await expect(whats).toHaveAttribute("aria-checked", "false");
  await whats.click();
  await page.getByLabel("Nicho personalizado").fill("Sorveterias");
  await page.getByLabel("Nicho personalizado").press("Enter");
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.getByText(/Buscando Sorveterias com WhatsApp em Franca - SP/)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible({ timeout: 30_000 });

  // Pede o dobro ao Apify para compensar os descartados
  const last = await (await request.get(`${MOCK}/__last-input`)).json();
  expect(last.input.searchStringsArray).toEqual(["Sorveterias"]);
  expect(last.input.maxCrawledPlacesPerSearch).toBe(40);
  expect(last.query.maxItems).toBe("40");
  expect(last.input).not.toHaveProperty("website");

  // Fixo ("Com Site Teste") e sem telefone ("Só Instagram") ficam de fora
  const cards = page.locator("article");
  await expect(cards).toHaveCount(2);
  await expect(page.locator("article h3")).toHaveText(["Sorveteria Sem Site Teste", "Sorveteria Cidade Vizinha"]);
  await expect(page.getByText("WhatsApp não identificado")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Com WhatsApp" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${OUT}/15-apenas-whatsapp.png` });
});

test("mensagens de erro: limite de requisições e ausência de resultados", async ({ page }) => {
  await login(page, BASE);
  await search(page, "Limite");
  await expect(page.getByRole("alert").filter({ hasText: "Limite de requisições atingido" })).toBeVisible();
  await expect(page.getByText("Aguarde alguns instantes")).toBeVisible();
  await page.screenshot({ path: `${OUT}/09-erro-limite.png` });

  await page.getByRole("button", { name: "Remover nicho Limite" }).click();
  await search(page, "Nada");
  await expect(page.getByText("Nenhum resultado encontrado")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/10-sem-resultados.png` });
});

test("API valida entradas e bloqueia outras origens", async ({ request }) => {
  await loginApi(request, BASE);
  const bad = await request.post(`${BASE}/api/search-leads`, { data: { city: "", niches: [] } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).code).toBe("VALIDATION_ERROR");

  const tooMany = await request.post(`${BASE}/api/search-leads`, { data: { city: "Franca", state: "SP", niches: ["A"], limit: 999 } });
  expect(tooMany.status()).toBe(400);

  const foreign = await request.post(`${BASE}/api/search-leads`, {
    data: { city: "Franca", state: "SP", niches: ["Bares"] },
    headers: { Origin: "https://site-malicioso.example" },
  });
  expect(foreign.status()).toBe(403);

  const badRun = await request.get(`${BASE}/api/search-leads?runId=../../x&city=Franca&state=SP&niche=A`);
  expect(badRun.status()).toBe(400);
});
