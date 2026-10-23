import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { receiptsFixture } from "./receipts-fixture";
async function activate(page: Page, repeats = 1, real = false) {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Gerenciar Base", exact: true })
    .click();
  await page.getByLabel("Data de referência da posição").fill("2026-10-23");
  await page
    .getByLabel("Selecionar planilha Excel")
    .setInputFiles(
      real
        ? process.env.BIOSAUDE_UPDATED_WORKBOOK!
        : {
            name: "RECEBIMENTOS_SINTETICOS.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: await receiptsFixture(repeats),
          },
    );
  await expect(
    page.getByRole("heading", { name: "Conferência da nova base" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("checkbox", { name: /Confirmar utilização da base/ })
    .check();
  await page
    .getByRole("button", { name: "Atualizar Dashboard", exact: true })
    .click();
  await expect(
    page.getByText(/Dashboard atualizado com sucesso/),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Análise de Recebimentos", exact: true })
    .click();
  await expect(page.locator(".receipts-module")).toBeVisible();
}
const values = (page: Page) => page.locator(".receipt-kpis .kpi-value");
test("recebimentos: navegação, KPIs, filtros independentes, gráficos e rastreabilidade", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'Análise de Recebimentos',exact:true}).click();
  await expect(page.getByText('Importe e ative uma planilha para analisar os recebimentos.')).toBeVisible();
  await expect(values(page)).toHaveCount(0);
  await activate(page);
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText([
    "Visão geral",
    "Análise de Recebimentos",
    "Gestão da Inadimplência",
    "Análise de Crédito",
    "Auditoria",
    "Gerenciar Base",
  ]);
  await expect(values(page)).toHaveText([
    /1\.100,00/,
    /700,00/,
    /200,00/,
    /600,00/,
  ]);
  await expect(page.locator(".receipt-chart .recharts-wrapper > svg.recharts-surface")).toHaveCount(
    3,
  );
  await expect(page.locator(".receipt-legal")).toContainText(
    "5 lançamentos com situação conhecida; 1 sem informação",
  );
  await page
    .getByLabel("Condição do recebimento", { exact: true })
    .selectOption("ontime");
  await expect(values(page).first()).toHaveText(/200,00/);
  await page
    .getByRole("button", { name: "Limpar filtros de recebimentos" })
    .click();
  await page
    .getByLabel("Trimestre dos recebimentos", { exact: true })
    .selectOption("4");
  await page
    .getByLabel("Mês dos recebimentos", { exact: true })
    .selectOption("10");
  await page
    .getByLabel("Cliente dos recebimentos", { exact: true })
    .selectOption("Cliente Sintético A");
  await page
    .getByLabel("Situação de ajuizamento", { exact: true })
    .selectOption("yes");
  await expect(values(page).first()).toHaveText(/100,00/);
  await expect(page.locator(".receipt-table tbody tr")).toHaveCount(2);
  await page
    .getByLabel("Trimestre dos recebimentos", { exact: true })
    .selectOption("1");
  await expect(values(page).first()).toHaveText(/0,00/);
  await expect(
    page.getByRole("button", { name: "Exportar Excel", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Limpar filtros de recebimentos" })
    .click();
  await page.getByLabel("Pesquisar recebimentos", { exact: true }).fill("P3");
  await expect(values(page).first()).toHaveText(/300,00/);
  await page.getByRole("button", { name: "P3/01", exact: true }).click();
  await page.getByRole("button", { name: "Linha 4: ver original", exact: true }).click();
  await expect(page.locator(".original-record")).toContainText("CONSOLIDADO - RECEBIDO");
  await page.getByRole("button", { name: "Fechar detalhamento" }).click();
  await page
    .getByRole("button", { name: "Limpar filtros de recebimentos" })
    .click();
  await page
    .getByLabel("Representante dos recebimentos", { exact: true })
    .selectOption("Rep Y");
  await expect(values(page).first()).toHaveText(/600,00/);
  await page
    .getByRole("button", { name: "Limpar filtros de recebimentos" })
    .click();
  await page
    .getByLabel("Ordenar recebimentos", { exact: true })
    .selectOption("cents");
  await page
    .getByLabel("Direção dos recebimentos", { exact: true })
    .selectOption("true");
  await expect(page.locator(".receipt-table tbody tr").first()).toContainText(
    "50,00",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (
    process.env.BIOSAUDE_CAPTURE_RECEIPTS &&
    ["desktop", "mobile"].includes(info.project.name)
  ) {
    await page.screenshot({
      path: `docs/preview-receipts-${info.project.name}.png`,
      fullPage: true,
    });
    if (info.project.name === "desktop")
      await page
        .locator(".receipt-kpis")
        .screenshot({ path: "docs/preview-receipts-kpis.png" });
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/200,00/);
  await expect(page.locator(".aging-average .kpi-value")).toHaveText("22 dias");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Auditoria", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Auditoria da base" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Análise de Crédito", exact: true })
    .click();
  await expect(page.locator(".credit-module")).toBeVisible();
  expect(errors).toEqual([]);
});
test("recebimentos: exportações Excel e PDF respeitam filtros e incluem resultados além da página", async ({
  page,
}, info) => {
  await activate(page, 6);
  await expect(page.locator(".receipt-table tbody tr")).toHaveCount(20);
  await page
    .getByRole("button", { name: "Próxima página dos recebimentos" })
    .click();
  await expect(page.locator(".receipt-table tbody tr")).toHaveCount(16);
  await page
    .getByLabel("Representante dos recebimentos", { exact: true })
    .selectOption("Rep X");
  await expect(values(page).first()).toHaveText(/3\.000,00/);
  await expect(page.locator(".receipt-table tbody tr")).toHaveCount(20);
  const xlsx = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar Excel", exact: true })
    .click();
  const excel = await xlsx;
  const excelPath = info.outputPath("recebimentos.xlsx");
  await excel.saveAs(excelPath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Uint8Array.from(await readFile(excelPath)).buffer);
  expect(wb.worksheets).toHaveLength(8);
  const details = wb.getWorksheet("Duplicatas Recebidas")!;
  expect(details.rowCount).toBe(25);
  let total = 0;
  details.eachRow((row, i) => {
    if (i > 1) {
      total += Math.round(Number(row.getCell(10).value) * 100);
      expect(row.getCell(2).value).toBe("Rep X");
    }
  });
  expect(total).toBe(300000);
  expect(JSON.stringify(wb.model)).not.toContain("PACIENTE-NAO-EXPORTAR");
  const pdfPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PDF", exact: true }).click();
  const pdf = await pdfPending;
  const pdfPath = info.outputPath("recebimentos.pdf");
  await pdf.saveAs(pdfPath);
  const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"]).toString();
  expect(text).toContain("3.000,00");
  expect(text).toContain("Resumo por Cliente");
  expect(text).toContain("Resumo por Representante");
  expect(text).toContain("Evolução Mensal");
  expect(text).toContain("Pós-inadimplência");
  expect(text).not.toContain("PACIENTE-NAO-EXPORTAR");
  expect(text).not.toContain("Rep Y");
  expect(text.match(/P1\/01/g)?.length).toBe(18);
});
test("recebimentos reais: total e classificações conciliados e ajuizamento indisponível", async ({
  page,
}) => {
  test.skip(!process.env.BIOSAUDE_UPDATED_WORKBOOK, "Planilha real externa.");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await activate(page, 1, true);
  await expect(values(page)).toHaveText([
    /57\.902\.017,98/,
    /27\.815\.746,35/,
    /24\.865\.707,80/,
    "Dados indisponíveis",
  ]);
  await expect(
    page.getByLabel("Situação de ajuizamento", { exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".receipt-legend")).toContainText("5.220.563,83");
  await expect(page.locator(".receipt-detail")).toContainText(
    "2787 lançamentos",
  );
  await page
    .getByLabel("Condição do recebimento", { exact: true })
    .selectOption("ontime");
  await expect(values(page).first()).toHaveText(/5\.220\.563,83/);
  await expect(page.locator(".receipt-detail")).toContainText(
    "266 lançamentos",
  );
  expect(errors).toEqual([]);
});
