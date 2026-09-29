import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const TEST_PASSWORD = "senha-de-teste-123";

/** Faz login e abre a página "Buscar leads" pelo menu lateral. */
export async function login(page: Page, base: string) {
  await page.goto(base);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Bem-vindo ao/ })).toBeVisible();
  await openMenuItem(page, "Buscar leads");
  await expect(page.getByRole("heading", { name: "Encontrar novos leads" })).toBeVisible();
}

/** Navega pelo menu lateral (no celular, abre a gaveta antes). */
export async function openMenuItem(page: Page, label: string) {
  const openButton = page.getByRole("button", { name: "Abrir menu" });
  if (await openButton.isVisible()) await openButton.click();
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: label }).last().click();
}

export async function loginApi(request: APIRequestContext, base: string) {
  const res = await request.post(`${base}/api/auth/login`, { data: { password: TEST_PASSWORD } });
  expect(res.ok()).toBe(true);
}
