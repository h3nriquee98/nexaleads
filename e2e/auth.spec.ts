import { expect, test } from "@playwright/test";
import { TEST_PASSWORD } from "./helpers";

const BASE = "http://localhost:3101";
const OUT = process.env.E2E_OUT_DIR ?? "test-results";

test("sem login ninguém acessa o app nem a API", async ({ page, request }) => {
  await page.goto(`${BASE}/`);
  await expect(page).toHaveURL(`${BASE}/login`);
  await expect(page.getByRole("heading", { name: "NexaLeads" })).toBeVisible();

  for (const [method, path] of [
    ["GET", "/api/status"],
    ["POST", "/api/search-leads"],
    ["GET", "/api/search-leads?runId=abcdefghijRUN&city=Franca&state=SP&niche=A"],
    ["DELETE", "/api/search-leads?runId=abcdefghijRUN"],
  ] as const) {
    const res = await request.fetch(`${BASE}${path}`, { method, data: method === "POST" ? { city: "Franca", state: "SP", niches: ["Bares"] } : undefined });
    expect(res.status(), `${method} ${path}`).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  }

  // Cookie falsificado não funciona
  const forged = await request.get(`${BASE}/api/status`, { headers: { cookie: "nexaleads_session=9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } });
  expect(forged.status()).toBe(401);
});

test("login, senha errada, redirecionamento e sair", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Senha incorreta.")).toBeVisible();
  await page.screenshot({ path: `${OUT}/13-login.png` });

  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(`${BASE}/`);
  await expect(page.getByRole("heading", { level: 1, name: /Bem-vindo ao/ })).toBeVisible();
  const cookie = (await page.context().cookies()).find((c) => c.name === "nexaleads_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");

  // Já logado: /login volta para o app
  await page.goto(`${BASE}/login`);
  await expect(page).toHaveURL(`${BASE}/`);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(`${BASE}/login`);
  await page.goto(`${BASE}/`);
  await expect(page).toHaveURL(`${BASE}/login`);
});

test("bloqueia tentativas repetidas de senha", async ({ request }) => {
  let last = 0;
  for (let i = 0; i < 7; i++) {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { password: `chute-${i}` },
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    last = res.status();
  }
  expect(last).toBe(429);
});
