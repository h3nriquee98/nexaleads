import { expect, test, type Page } from "@playwright/test";
import { login, loginApi } from "./helpers";

const BASE = "http://localhost:3102";
const MOCK = "http://localhost:4010";
const OUT = process.env.E2E_OUT_DIR ?? "test-results";

async function fillSearch(page: Page, niche: string) {
  await page.getByRole("textbox", { name: "Cidade" }).fill("Franca");
  await page.getByLabel("Estado").selectOption("SP");
  await page.getByLabel("Nicho personalizado").fill(niche);
  await page.getByLabel("Nicho personalizado").press("Enter");
}

test("Apify + Google: leads do Google aparecem na hora e o Apify completa depois, sem duplicar", async ({ page, request }) => {
  await login(page, BASE);
  await expect(page.getByText("Apify + Google conectados")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Apify \+ Google/ })).toHaveAttribute("aria-checked", "true");
  const before = await (await request.get(`${MOCK}/__last-input`)).json();

  await fillSearch(page, "Cantinas");
  await page.getByRole("button", { name: "Encontrar leads" }).click();

  // Google já chegou, o Apify ainda está rodando
  await expect(page.getByText(/3 leads do Google Places já estão na lista/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(3);
  await page.screenshot({ path: `${OUT}/16-google-parcial.png` });

  // Apify termina: 3 do Google + 4 do Apify - 1 repetido = 6
  await expect(page.getByText(/6 leads encontrados/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("article")).toHaveCount(6);
  await expect(page.locator("article h3", { hasText: "Cantina Sem Site Teste" })).toHaveCount(1);
  await expect(page.locator("article h3", { hasText: "Cantina Google Fechada" })).toHaveCount(0);
  await expect(page.locator("article", { hasText: "Cantina Google Com Site" }).getByText("Possui site")).toBeVisible();
  const googleNoSite = page.locator("article", { hasText: "Cantina Google Sem Site" });
  await expect(googleNoSite.getByText("Sem site", { exact: true })).toBeVisible();
  await expect(googleNoSite.getByRole("link", { name: /Google Maps/ })).toHaveAttribute("href", "https://maps.google.com/?cid=222");

  const after = await (await request.get(`${MOCK}/__last-input`)).json();
  expect(after.runsStarted - before.runsStarted).toBe(1);
  expect(after.googleCalls - before.googleCalls).toBe(1);
  expect(after.lastGoogleBody).toMatchObject({ textQuery: "Cantinas em Franca, SP, Brasil", languageCode: "pt-BR", regionCode: "BR" });
  await page.screenshot({ path: `${OUT}/17-apify-mais-google.png`, fullPage: true });

  // A chave do Google nunca chega ao navegador
  await loginApi(request, BASE);
  const status = await (await request.get(`${BASE}/api/status`)).text();
  expect(status).not.toContain("test-google-key");
  expect(await page.content()).not.toContain("test-google-key");
});

test("Só Google Places: resultado imediato, sem executar o Apify", async ({ page, request }) => {
  await login(page, BASE);
  const before = await (await request.get(`${MOCK}/__last-input`)).json();
  await page.getByRole("radio", { name: /Só Google Places/ }).click();
  await fillSearch(page, "Quitandas");
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.getByText(/3 leads encontrados · 2 sem site/)).toBeVisible();
  await expect(page.locator("article")).toHaveCount(3);
  const after = await (await request.get(`${MOCK}/__last-input`)).json();
  expect(after.runsStarted).toBe(before.runsStarted);
  expect(after.googleCalls - before.googleCalls).toBe(1);
  await expect(page.getByRole("radio", { name: /Só Google Places/ })).toHaveAttribute("aria-checked", "true");
});

test("Só Google Places: filtro sem site pede mais resultados e erro de cota aparece claro", async ({ page, request }) => {
  await login(page, BASE);
  await page.getByRole("radio", { name: /Só Google Places/ }).click();
  await page.getByRole("switch", { name: /Buscar apenas empresas sem site/ }).click();
  await fillSearch(page, "Mercearias");
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.locator("article")).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(page.locator("article").nth(i).locator(".badge").first()).toContainText("Sem site");
  const last = await (await request.get(`${MOCK}/__last-input`)).json();
  expect(last.lastGoogleBody.pageSize).toBe(20);

  await page.getByRole("button", { name: "Remover nicho Mercearias" }).click();
  await fillSearch(page, "Limite");
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Limite de uso da Google Places API atingido" })).toBeVisible();
});
