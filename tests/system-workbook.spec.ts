import { test, expect } from "@playwright/test";
import { systemWorkbookFixture } from "./system-workbook-fixture";

async function activate(page: import("@playwright/test").Page, real = false) {
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Gerenciar Base", exact: true }).click();
  await page.getByLabel("Data de referência da posição").fill("2026-11-04");
  await page.getByLabel("Selecionar planilha Excel").setInputFiles(real ? process.env.BIOSAUDE_SYSTEM_WORKBOOK! : {
    name: "EXPORTACAO_SINTETICA.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await systemWorkbookFixture(),
  });
  await expect(page.getByRole("heading", { name: "Conferência da nova base" })).toBeVisible({ timeout: 60000 });
  for (const sheet of ["VENCIDO", "A VENCER", "RECEBIDO"]) {
    await expect(page.getByLabel(`Cabeçalho ${sheet}`, { exact: true })).toHaveValue("2");
    await expect(page.getByLabel(`Código do Cliente ${sheet}`, { exact: true })).toHaveValue("0");
    await expect(page.getByLabel(`Nº do Boleto ${sheet}`, { exact: true })).toHaveValue("39");
  }
  await page.getByLabel("Lembrar a nova base neste navegador").check();
  await page.getByRole("checkbox", { name: /Confirmar utilização da base/ }).check();
  await page.getByRole("button", { name: "Atualizar Dashboard", exact: true }).click();
  await expect(page.getByText(/Dashboard atualizado com sucesso/)).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
}

test("exportação do sistema: código, empresa, boleto, pesquisa e restauração local", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await activate(page);
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/92,00/);
  const clients = page.getByLabel("Cliente", { exact: true });
  await expect(clients.locator("option")).toHaveCount(4);
  await clients.selectOption(JSON.stringify(["code", "E1", "001"]));
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/42,00/);
  await expect(page.locator(".collection-panel")).toContainText("Nome Original");
  await expect(page.locator(".collection-panel")).toContainText("Nome Alterado");
  await expect(page.locator(".collection-panel")).toContainText("00012345678901234567890");
  await expect(page.locator(".collection-panel")).toContainText("Boleto não informado");
  await page.getByLabel("Pesquisar cliente na consulta", { exact: true }).fill("00012345678901234567890");
  await expect(page.locator(".collection-table tbody tr")).toHaveCount(2);
  await page.locator(".collection-table tbody button").first().click();
  await expect(page.getByRole("dialog")).toContainText("Código do Cliente");
  await expect(page.getByRole("dialog")).toContainText("Nº do Boleto");
  await page.getByRole("button", { name: "Fechar detalhamento" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Análise de Recebimentos", exact: true }).click();
  await page.getByLabel("Cliente dos recebimentos", { exact: true }).selectOption(JSON.stringify(["code", "E1", "001"]));
  await expect(page.locator(".receipt-kpis .kpi-value").first()).toHaveText(/41,00/);
  await page.getByLabel("Pesquisar recebimentos", { exact: true }).fill("00012345678901234567890");
  await expect(page.locator(".receipt-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".receipt-table")).toContainText("00012345678901234567890");
  await page.reload();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/92,00/);
  await expect(page.getByLabel("Cliente", { exact: true }).locator("option")).toHaveCount(4);
  await page.getByRole("navigation").getByRole("button", { name: "Análise de Crédito", exact: true }).click();
  await page.getByPlaceholder("Pesquisar cliente", { exact: true }).fill("00012345678901234567890");
  await expect(page.locator(".client-link")).toHaveCount(1);
  await page.locator(".client-link").click();
  await expect(page.getByRole("dialog")).toContainText("Código do Cliente");
  await expect(page.getByRole("dialog")).toContainText("Nº do Boleto");
  await page.getByRole("button", { name: "Fechar análise", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/biosaude-system-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("arquivo original: importação direta das três abas e preservação dos KPIs", async ({ page }) => {
  test.skip(!process.env.BIOSAUDE_SYSTEM_WORKBOOK, "Arquivo original externo ao Git.");
  test.setTimeout(90000);
  await activate(page, true);
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/36\.473\.337,43/);
  await expect(page.locator(".kpi.upcoming .kpi-value")).toHaveText(/25\.267\.506,75/);
  await expect(page.locator(".kpi.overdue .kpi-value")).toHaveText(/11\.205\.830,68/);
  await expect(page.locator(".kpi.received .kpi-value")).toHaveText(/87\.937\.753,47/);
  await expect(page.getByLabel("Cliente", { exact: true }).locator("option")).toHaveCount(250);
  await page.reload();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/36\.473\.337,43/);
  await expect(page.getByLabel("Cliente", { exact: true }).locator("option")).toHaveCount(250);
});
