import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { login, openMenuItem } from "./helpers";

const BASE = "http://localhost:3100";
const OUT = process.env.E2E_OUT_DIR ?? "test-results";

async function scores(page: Page) {
  return page.locator("article [role=img][aria-label^='Pontuação']").evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute("aria-label")!.replace(/\D+/g, " ").trim().split(" ")[0])),
  );
}

test("fluxo completo no modo demonstração", async ({ page }) => {
  await login(page, BASE);
  await expect(page.getByText("Modo demonstração").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resultados da última busca" })).toHaveCount(0);

  // Validação dos campos
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.getByText("Informe a cidade (ex.: Franca).")).toBeVisible();
  await expect(page.getByText("Selecione pelo menos um nicho.")).toBeVisible();

  // Cidade no formato "Franca, SP" e nichos
  await page.getByRole("textbox", { name: "Cidade" }).fill("Franca, SP");
  await page.getByRole("textbox", { name: "Cidade" }).blur();
  await expect(page.getByRole("textbox", { name: "Cidade" })).toHaveValue("Franca");
  await expect(page.getByLabel("Estado")).toHaveValue("SP");
  await page.getByRole("button", { name: "Pizzarias" }).click();
  await page.getByRole("button", { name: "Barbearias" }).click();
  await page.getByLabel("Nicho personalizado").fill("Pet shops");
  await page.getByLabel("Nicho personalizado").press("Enter");
  await page.getByLabel(/Quantidade de leads/).fill("30");

  await page.getByRole("button", { name: "Encontrar leads" }).click();
  // Estado de carregamento
  await expect(page.getByRole("button", { name: "Buscando…" })).toBeDisabled();
  await expect(page.getByText(/Buscando Pizzarias, Barbearias, Pet shops em Franca - SP/)).toBeVisible();
  await page.screenshot({ path: `${OUT}/01-carregando.png`, fullPage: false });

  await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/leads? encontrados?/).first()).toBeVisible();
  await expect(page.getByText("Fictício").first()).toBeVisible();
  const count = await page.locator("article").count();
  expect(count).toBeGreaterThan(10);

  // Ordenação pela pontuação
  const s = await scores(page);
  expect(s).toEqual([...s].sort((a, b) => b - a));
  await expect(page.locator("article").first().getByText("Sem site")).toBeVisible();
  await page.screenshot({ path: `${OUT}/02-resultados-desktop.png`, fullPage: true });

  // Filtro "Apenas sem site"
  await page.getByRole("button", { name: "Apenas sem site" }).click();
  const noSiteCards = page.locator("article");
  const noSiteCount = await noSiteCards.count();
  expect(noSiteCount).toBeGreaterThan(0);
  expect(noSiteCount).toBeLessThan(count);
  for (let i = 0; i < noSiteCount; i++) await expect(noSiteCards.nth(i).locator(".badge").first()).toContainText("Sem site");

  // Links do lead
  const first = page.locator("article").first();
  const maps = first.getByRole("link", { name: /Google Maps/ });
  await expect(maps).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\//);
  await expect(maps).toHaveAttribute("target", "_blank");
  await expect(maps).toHaveAttribute("rel", /noopener/);
  const withPhone = page.locator("article").filter({ has: page.getByRole("link", { name: /^Ligar para/ }) }).first();
  await expect(withPhone.getByRole("link", { name: /^Ligar para/ })).toHaveAttribute("href", /^tel:\+55\d{10,11}$/);
  await expect(withPhone.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/55\d{10,11}$/);
  // O sandbox de testes não acessa a internet: responde localmente às URLs do Google.
  await page.context().route("https://www.google.com/**", (route) => route.fulfill({ status: 200, body: "maps" }));
  const [popup] = await Promise.all([page.waitForEvent("popup"), maps.click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toMatch(/google\.com/);
  await popup.close();

  // Copiar dados
  await first.getByRole("button", { name: /Copiar dados/ }).click();
  await expect(page.getByText("Dados do lead copiados.")).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("Pontuação:");

  // Gerar abordagem (mensagem personalizada, envio manual)
  const pitchTarget = page.locator("article").filter({ has: page.getByRole("link", { name: /^Ligar para/ }) }).first();
  const pitchName = (await pitchTarget.locator("h3").textContent())!;
  await pitchTarget.getByRole("button", { name: `Gerar abordagem para ${pitchName}` }).click();
  const dialog = page.getByRole("dialog", { name: pitchName });
  await expect(dialog).toBeVisible();
  const message = dialog.getByLabel("Mensagem de abordagem");
  await expect(message).toHaveValue(new RegExp(pitchName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(message).toHaveValue(/não têm um site/);
  await expect(message).toHaveValue(/demonstração (gratuita e )?sem compromisso/);
  await dialog.getByPlaceholder("Ex.: Thiago").fill("Thiago");
  await expect(message).toHaveValue(/Aqui é Thiago, da Nexa Agency\./);
  const firstVersion = await message.inputValue();
  await dialog.getByRole("button", { name: /Outra versão/ }).click();
  expect(await message.inputValue()).not.toBe(firstVersion);
  await message.fill("Mensagem editada à mão");
  await expect(dialog.getByRole("link", { name: "Abrir no WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/55\d{10,11}\?text=Mensagem%20editada%20%C3%A0%20m%C3%A3o$/,
  );
  await page.screenshot({ path: `${OUT}/11-gerar-abordagem.png` });
  await dialog.getByRole("button", { name: "Copiar mensagem" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Mensagem editada à mão");
  await dialog.getByRole("button", { name: "Marcar como contatado" }).click();
  await expect(dialog.getByRole("button", { name: "Contatado" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(`Status do lead ${pitchName}`)).toHaveValue("contatado");
  await page.getByLabel(`Status do lead ${pitchName}`).selectOption("novo");

  // Exportação CSV (somente os filtrados)
  const [csvDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
  expect(csvDl.suggestedFilename()).toMatch(/^nexaleads-.*\.csv$/);
  const csvPath = `${OUT}/export.csv`;
  await csvDl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("Pontuação;Empresa;Categoria;Nicho;Status do site");
  expect(csv.trim().split("\r\n")).toHaveLength(noSiteCount + 1);

  // Excel e "Baixar só sem site"
  const [xlsxDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
  expect(xlsxDl.suggestedFilename()).toMatch(/\.xlsx$/);
  await xlsxDl.saveAs(`${OUT}/export.xlsx`);
  await page.getByRole("button", { name: "Apenas sem site" }).click();
  const [noSiteDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar só sem site" }).click()]);
  expect(noSiteDl.suggestedFilename()).toMatch(/^nexaleads-sem-site-.*\.csv$/);
  await noSiteDl.saveAs(`${OUT}/sem-site.csv`);
  const noSiteCsv = fs.readFileSync(`${OUT}/sem-site.csv`, "utf8").trim().split("\r\n").slice(1);
  expect(noSiteCsv).toHaveLength(noSiteCount);
  expect(noSiteCsv.every((line) => line.includes(";Sem site"))).toBe(true);

  // Salvamento de status (persiste após recarregar)
  const target = page.locator("article").first();
  const name = (await target.locator("h3").textContent())!;
  await target.getByRole("button", { name: /Contatado/ }).click();
  await expect(target.getByLabel(`Status do lead ${name}`)).toHaveValue("contatado");
  const second = page.locator("article").nth(1);
  const name2 = (await second.locator("h3").textContent())!;
  await second.getByLabel(`Status do lead ${name2}`).selectOption("cliente");
  await page.reload();
  await expect(page.getByLabel(`Status do lead ${name}`)).toHaveValue("contatado");
  await expect(page.getByLabel(`Status do lead ${name2}`)).toHaveValue("cliente");
  await openMenuItem(page, "Início");
  await expect(page.getByRole("region", { name: "Funil de prospecção" }).getByText("Contatado")).toBeVisible();
  await openMenuItem(page, "Buscar leads");
  await expect(page.locator("article").first()).toBeVisible();

  // Descartar lead
  await page.locator("article", { hasText: name }).getByRole("button", { name: /Descartar/ }).click();
  await expect(page.locator("article h3", { hasText: name })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver descartados" }).click();
  await expect(page.locator("article h3", { hasText: name })).toHaveCount(1);
  await page.getByRole("button", { name: "Ver descartados" }).click();

  // Visualização em tabela
  await page.getByRole("button", { name: "Tabela" }).click();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/03-tabela.png`, fullPage: false });
  await page.getByRole("button", { name: "Cards" }).click();
});

test("layout responsivo no celular", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await login(page, BASE);
  await page.getByRole("textbox", { name: "Cidade" }).fill("Ribeirão Preto");
  await page.getByLabel("Estado").selectOption("SP");
  await page.getByRole("button", { name: "Docerias" }).click();
  await page.getByRole("switch", { name: /Buscar apenas empresas sem site/ }).click();
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  const mobileCards = page.locator("article");
  const mobileCount = await mobileCards.count();
  for (let i = 0; i < mobileCount; i++) await expect(mobileCards.nth(i).locator(".badge").first()).toContainText("Sem site");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Filtros recolhidos no celular, abrem pelo botão
  await expect(page.getByRole("button", { name: "Apenas sem site" })).toBeHidden();
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByRole("button", { name: "Apenas sem site" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/04-celular-topo.png` });
  await page.locator("article").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/05-celular-cards.png` });
  await page.screenshot({ path: `${OUT}/06-celular-completo.png`, fullPage: true });
  await page.locator("article").first().getByRole("button", { name: /Gerar abordagem/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${OUT}/12-celular-abordagem.png` });
  await context.close();
});
