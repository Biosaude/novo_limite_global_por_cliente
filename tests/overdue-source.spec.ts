import { test, expect } from "@playwright/test";

test("base do incidente: zeros originais, exposição, faixas e IndexedDB preservados", async ({ page }) => {
  test.skip(!process.env.BIOSAUDE_INCIDENT_WORKBOOK, "Planilha real externa ao Git.");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Gerenciar Base", exact: true }).click();
  await page.getByLabel("Data de referência da posição").fill("2026-11-04");
  await page.getByLabel("Selecionar planilha Excel").setInputFiles(process.env.BIOSAUDE_INCIDENT_WORKBOOK!);
  await expect(page.getByRole("heading", { name: "Conferência da nova base" })).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Lembrar a nova base neste navegador").check();
  await page.getByRole("checkbox", { name: /Confirmar utilização da base/ }).check();
  await page.getByRole("button", { name: "Atualizar Dashboard", exact: true }).click();
  await expect(page.getByText(/Dashboard atualizado com sucesso: 7.489 registros/)).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  async function check() {
    await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/25\.903\.933,68/);
    await expect(page.locator(".kpi.upcoming .kpi-value")).toHaveText(/25\.903\.933,68/);
    await expect(page.locator(".kpi.overdue .kpi-value")).toHaveText(/0,00/);
    await expect(page.locator(".kpi.overdue .kpi-footer")).toContainText("869 registros");
    await expect(page.locator(".kpi.overdue .kpi-footer")).toContainText("Inadimplência: 0%");
    await expect(page.locator(".kpi.received .kpi-value")).toHaveText(/87\.937\.753,47/);
    await expect(page.locator(".aging-average .kpi-value")).toHaveText("Não aplicável");
    await expect(page.locator(".aging-card > strong")).toHaveCount(5);
    for (const value of await page.locator(".aging-card > strong").all())
      await expect(value).toHaveText(/0,00/);
    for (const percentage of await page.locator(".aging-share-row > strong").all())
      await expect(percentage).toHaveText("—");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await check();
  await page.reload();
  await check();
  await page.getByLabel("Categoria financeira", { exact: true }).selectOption("overdue");
  await expect(page.locator(".kpi.overdue .kpi-footer")).toContainText("869 registros");
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/0,00/);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await check();
  expect(errors).toEqual([]);
});
