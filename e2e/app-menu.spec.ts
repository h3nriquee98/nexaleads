import { expect, test } from "@playwright/test";
import { login, openMenuItem } from "./helpers";

const BASE = "http://localhost:3100";
const OUT = process.env.E2E_OUT_DIR ?? "test-results";
const money = (value: string) => new RegExp(`R\\$\\s${value.replace(/\./g, "\\.")}`);

test("menu lateral: Início, Buscar leads, Meus leads e Financeiro", async ({ page }) => {
  await login(page, BASE);

  // Sem leads ainda: "Meus leads" mostra o estado vazio
  await openMenuItem(page, "Meus leads");
  await expect(page.getByText("Nenhum lead ainda")).toBeVisible();
  await openMenuItem(page, "Buscar leads");

  // Faz uma busca para ter dados
  await page.getByRole("textbox", { name: "Cidade" }).fill("Franca");
  await page.getByLabel("Estado").selectOption("SP");
  await page.getByRole("button", { name: "Barbearias" }).click();
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

  const nav = page.getByRole("navigation", { name: "Menu principal" });
  await expect(nav.getByRole("link")).toHaveText([/Início/, /Buscar leads/, /Meus leads/, /Financeiro/]);
  await expect(nav.getByRole("link", { name: /Buscar leads/ })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: /Meus leads/ })).toContainText("20");

  // Início
  await openMenuItem(page, "Início");
  await expect(page).toHaveURL(`${BASE}/`);
  await expect(page.getByRole("heading", { level: 1, name: /Bem-vindo ao/ })).toBeVisible();
  await expect(page.getByText("Leads na base")).toBeVisible();
  const opportunities = page.getByRole("region", { name: "Melhores oportunidades" });
  await expect(opportunities.getByRole("listitem").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/18-inicio.png`, fullPage: true });
  await opportunities.getByRole("button", { name: /Gerar abordagem para/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // Clique no funil abre "Meus leads" filtrado
  await page.getByRole("region", { name: "Funil de prospecção" }).getByRole("button", { name: /Novo/ }).click();
  await expect(page).toHaveURL(`${BASE}/leads?status=novo`);
  await expect(page.getByRole("heading", { level: 1, name: "Meus leads" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Filtrar por status" })).toHaveValue("novo");
  await expect(page.locator("article").first()).toBeVisible();

  // Meus leads pelo menu: todos os leads, sem filtro
  await openMenuItem(page, "Meus leads");
  await expect(page).toHaveURL(`${BASE}/leads`);
  await expect(page.locator("article")).toHaveCount(20);
  await page.screenshot({ path: `${OUT}/19-meus-leads.png` });
});

test("financeiro: lançamentos, resumo do mês, mensalidades e vínculo com o lead", async ({ page }) => {
  await login(page, BASE);
  await page.getByRole("textbox", { name: "Cidade" }).fill("Franca");
  await page.getByLabel("Estado").selectOption("SP");
  await page.getByRole("button", { name: "Pizzarias" }).click();
  await page.getByRole("button", { name: "Encontrar leads" }).click();
  await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  const leadName = (await page.locator("article h3").first().textContent())!;
  await page.locator("article").first().getByRole("button", { name: /Interessado/ }).click();

  await openMenuItem(page, "Financeiro");
  await expect(page).toHaveURL(`${BASE}/financeiro`);
  await expect(page.getByRole("heading", { level: 1, name: "Financeiro" })).toBeVisible();
  await expect(page.getByText(/Nenhum lançamento/)).toBeVisible();

  // Validação
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  let dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog.getByText("Informe uma descrição.")).toBeVisible();
  await expect(dialog.getByText(/Informe um valor válido/)).toBeVisible();

  // Venda do site vinculada ao lead
  await dialog.getByLabel("Descrição").fill("Site institucional");
  await dialog.getByLabel("Valor (R$)").fill("1.500,00");
  await dialog.getByLabel(/Cliente/).fill(leadName);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toBeHidden();

  // Mensalidade recorrente
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await dialog.getByLabel("Descrição").fill("Manutenção do site");
  await dialog.getByLabel("Valor (R$)").fill("150");
  await dialog.getByLabel("Categoria").selectOption("Manutenção mensal");
  await dialog.getByLabel(/Cliente/).fill(leadName);
  await dialog.getByLabel("Mensalidade (repete todo mês)").check();
  await dialog.getByRole("button", { name: "Salvar" }).click();

  // Despesa pendente
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await dialog.getByRole("radio", { name: "Despesa" }).click();
  await dialog.getByLabel("Descrição").fill("Créditos do Apify");
  await dialog.getByLabel("Valor (R$)").fill("200");
  await dialog.getByLabel("Já pago").uncheck();
  await dialog.getByRole("button", { name: "Salvar" }).click();

  const tile = (label: string) => page.locator(".card", { has: page.getByText(label, { exact: true }) }).first();
  await expect(tile("Recebido")).toContainText(money("1.650,00"));
  await expect(tile("Despesas")).toContainText(money("200,00"));
  await expect(tile("Lucro")).toContainText(money("1.450,00"));
  await expect(tile("Lucro")).toContainText(money("150,00"));
  await expect(page.getByRole("list", { name: "Lançamentos" }).getByRole("listitem")).toHaveCount(3);
  await page.screenshot({ path: `${OUT}/20-financeiro.png`, fullPage: true });

  // Marcar a despesa como paga e exportar
  await page.getByRole("button", { name: "Marcar como pago: Créditos do Apify" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Créditos do Apify" }).getByText("Pago", { exact: true })).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar CSV" }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^nexaleads-financeiro-\d{4}-\d{2}\.csv$/);

  // O lead virou cliente automaticamente
  await openMenuItem(page, "Meus leads");
  await expect(page.getByLabel(`Status do lead ${leadName}`)).toHaveValue("cliente");

  // Próximo mês: gerar mensalidades
  await openMenuItem(page, "Financeiro");
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByText(/1 mensalidade de .* ainda não foi lançada/)).toBeVisible();
  await page.getByRole("button", { name: "Gerar mensalidades" }).click();
  await expect(page.getByRole("list", { name: "Lançamentos" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem").filter({ hasText: "Manutenção do site" }).getByText("Pendente")).toBeVisible();
  await expect(tile("A receber")).toContainText(money("150,00"));
  await expect(page.getByText(/ainda não foi lançada/)).toHaveCount(0);

  // Persistência e exclusão
  await page.reload();
  await expect(page.getByRole("button", { name: "Mês atual" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Lançamentos" }).getByRole("listitem")).toHaveCount(3);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir Créditos do Apify" }).click();
  await expect(page.getByRole("list", { name: "Lançamentos" }).getByRole("listitem")).toHaveCount(2);
});

test("menu no celular abre como gaveta e navega", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await login(page, BASE);
  await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeHidden();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/21-celular-menu.png` });
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: /Financeiro/ }).click();
  await expect(page).toHaveURL(`${BASE}/financeiro`);
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  // Valor alto não pode ser cortado nos indicadores
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await dialog.getByLabel("Descrição").fill("Loja virtual completa");
  await dialog.getByLabel("Valor (R$)").fill("12.345,67");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.locator("[data-stat-value]").first()).toContainText(/12\.345,67/);
  await expect(page.getByRole("listitem").filter({ hasText: "Loja virtual completa" }).getByText("Loja virtual completa")).toBeVisible();
  const truncated = await page.getByText("Loja virtual completa").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(truncated).toBe(false);
  const clipped = await page.locator("[data-stat-value]").evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${OUT}/22-celular-financeiro.png`, fullPage: true });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: /Início/ }).click();
  await expect(page).toHaveURL(`${BASE}/`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${OUT}/23-celular-inicio.png`, fullPage: true });
  await context.close();
});
