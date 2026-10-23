import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { collectionFixture } from "./collection-fixture";
async function activate(page: Page, real = false) {
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
            name: "ARQUIVO_SINTETICO_COBRANCA.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: await collectionFixture(),
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
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
}
const stat = (page: Page, label: string) =>
  page
    .locator(".collection-summary > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("strong");
const panel = (page: Page) =>
  page.getByRole("region", {
    name: "Consulta de Títulos e Pendências Financeiras",
  });
const cash = (value: string) => Number(value.replace(/[^\d-]/g, ""));
test("cards e barras sincronizam múltiplas faixas sem restringir KPIs nem o denominador geral", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await activate(page);
  const baseline = await page
      .locator(".financial-kpis .kpi-value")
      .allTextContents(),
    percentages = await page
      .locator(".aging-cards .aging-card > div:first-child > span")
      .allTextContents();
  await expect(stat(page, "Registros selecionados")).toHaveText("92");
  for (const label of [
    "1–30 dias",
    "31–60 dias",
    "61–90 dias",
    "91–180 dias",
    "Acima de 180 dias",
  ]) {
    const card = page.getByRole("button", {
        name: `Filtrar faixa ${label}`,
        exact: true,
      }),
      bar = page.getByRole("button", {
        name: `Filtrar barra ${label}`,
        exact: true,
      });
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(bar).toHaveAttribute("aria-pressed", "true");
    await expect(stat(page, "Registros selecionados")).toHaveText("18");
    await bar.click();
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await expect(stat(page, "Registros selecionados")).toHaveText("92");
  }
  await page
    .getByRole("button", { name: "Filtrar faixa 91–180 dias", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Filtrar barra Acima de 180 dias",
      exact: true,
    })
    .click();
  await expect(stat(page, "Registros selecionados")).toHaveText("36");
  await expect(panel(page).locator("tbody tr")).toHaveCount(20);
  await expect(page.locator(".financial-kpis .kpi-value")).toHaveText(baseline);
  await expect(
    page.locator(".aging-cards .aging-card > div:first-child > span"),
  ).toHaveText(percentages);
  await page
    .getByRole("button", { name: "Próxima página da consulta" })
    .click();
  await expect(panel(page).locator("tbody tr")).toHaveCount(16);
  await page
    .getByRole("button", { name: "Página anterior da consulta" })
    .click();
  if (
    process.env.BIOSAUDE_CAPTURE_COLLECTION &&
    ["desktop", "mobile"].includes(testInfo.project.name)
  )
    await panel(page).screenshot({
      path: `docs/preview-collection-${testInfo.project.name}.png`,
    });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Análise de Crédito", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Filtrar faixa 91–180 dias",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Remover faixa 91–180 dias", exact: true })
    .click();
  await expect(stat(page, "Registros selecionados")).toHaveText("18");
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(stat(page, "Registros selecionados")).toHaveText("92");
  expect(errors).toEqual([]);
});
test("filtros integrados, pesquisas, ordenação, sem resultados e rastreabilidade", async ({
  page,
}) => {
  await page.goto("/");
  await activate(page);
  await page
    .getByLabel("Cliente", { exact: true })
    .selectOption("Cliente Sintético A");
  await page
    .getByLabel("Representante", { exact: true })
    .selectOption("Representante X");
  await expect(panel(page).locator("tbody")).toContainText(
    "Cliente Sintético A",
  );
  await expect(panel(page).locator("tbody")).not.toContainText(
    "Cliente Sintético B",
  );
  await expect(panel(page).locator("tbody")).not.toContainText(
    "Representante Y",
  );
  await page
    .getByLabel("Pesquisar duplicata ou título", { exact: true })
    .fill("DOC-008");
  await expect(stat(page, "Registros selecionados")).toHaveText("1");
  await expect(stat(page, "Saldo em aberto selecionado")).toHaveText(/9,01/);
  await page
    .getByRole("button", { name: "Ver origem DOC-008/01", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("DOC-008/01");
  await page.getByRole("button", { name: "Fechar detalhamento" }).click();
  await page
    .getByLabel("Pesquisar duplicata ou título", { exact: true })
    .fill("");
  await page
    .getByLabel("Ordenar consulta", { exact: true })
    .selectOption("openCents");
  await page
    .getByLabel("Direção da consulta", { exact: true })
    .selectOption("desc");
  await expect(panel(page).locator("tbody tr").first()).toContainText("UP-0");
  await page
    .getByLabel("Cliente", { exact: true })
    .selectOption("Cliente Sintético B");
  await expect(stat(page, "Registros selecionados")).toHaveText("0");
  await expect(
    panel(page).getByRole("button", { name: "Exportar Excel", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await page
    .getByLabel("Categoria financeira", { exact: true })
    .selectOption("received");
  await expect(stat(page, "Registros selecionados")).toHaveText("0");
  await expect(page.locator(".kpi.received .kpi-value")).toHaveText(
    /50\.000,00/,
  );
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await page
    .getByLabel("Pesquisar cliente na consulta", { exact: true })
    .fill("inexistente");
  await expect(stat(page, "Aging ponderado da seleção")).toHaveText(
    "Não aplicável",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("downloads reais Excel e PDF respeitam filtro individual e múltiplos filtros sem limitar à página", async ({
  page,
}, testInfo) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await activate(page);
  await page
    .getByLabel("Cliente", { exact: true })
    .selectOption("Cliente Sintético A");
  for (const mode of ["individual", "multiplo"]) {
    if (mode === "multiplo") {
      await page
        .getByLabel("Representante", { exact: true })
        .selectOption("Representante X");
      await page
        .getByRole("button", { name: "Filtrar faixa 91–180 dias", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Filtrar faixa Acima de 180 dias",
          exact: true,
        })
        .click();
    }
    const count = Number(
        (await stat(page, "Registros selecionados").innerText()).replace(
          /\./g,
          "",
        ),
      ),
      total = cash(await stat(page, "Saldo em aberto selecionado").innerText());
    if (mode === "individual") expect(count).toBeGreaterThan(20);
    for (const type of ["Excel", "PDF"]) {
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: `Exportar ${type}`, exact: true })
        .click();
      const download = await pending;
      expect(await download.failure()).toBeNull();
      const path = testInfo.outputPath(
        `${mode}.${type === "Excel" ? "xlsx" : "pdf"}`,
      );
      await download.saveAs(path);
      if (type === "Excel") {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Uint8Array.from(await readFile(path)).buffer);
        expect(workbook.worksheets).toHaveLength(4);
        const sheet = workbook.worksheets[1];
        expect(sheet.rowCount).toBe(count + 2);
        let sum = 0;
        for (let n = 2; n < sheet.rowCount; n++) {
          expect(sheet.getRow(n).getCell(1).value).toBe("Cliente Sintético A");
          sum += Math.round(Number(sheet.getRow(n).getCell(12).value) * 100);
          if (mode === "multiplo") {
            expect(sheet.getRow(n).getCell(2).value).toBe("Representante X");
            expect(Number(sheet.getRow(n).getCell(8).value)).toBeGreaterThan(
              90,
            );
          }
        }
        expect(sum).toBe(total);
        expect(
          JSON.stringify(workbook.worksheets.map((s) => s.getSheetValues())),
        ).not.toContain("DONOTEXPORT");
      } else {
        const text = execFileSync("pdftotext", ["-layout", path, "-"], {
          encoding: "utf8",
        });
        expect(text).toContain("23/10/2026");
        expect(text).toContain(`${count} registros`);
        expect(text).toContain(
          await stat(page, "Saldo em aberto selecionado")
            .innerText()
            .then((v) => v.replace(/R\$\s*/, "")),
        );
        expect(text).not.toContain("DONOTEXPORT");
        expect(text).not.toContain("DOC-003");
      }
    }
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("base nova real: seleção 91–180 + acima de 180 concilia consulta e Excel com R$ 8.860.895,37", async ({
  page,
}, testInfo) => {
  test.skip(!process.env.BIOSAUDE_UPDATED_WORKBOOK, "Planilha real externa.");
  await page.goto("/");
  await activate(page, true);
  const baseline = await page
    .locator(".financial-kpis .kpi-value")
    .allTextContents();
  await page
    .getByRole("button", { name: "Filtrar faixa 91–180 dias", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Filtrar barra Acima de 180 dias",
      exact: true,
    })
    .click();
  await expect(stat(page, "Saldo em aberto selecionado")).toHaveText(
    /8\.860\.895,37/,
  );
  await expect(page.locator(".financial-kpis .kpi-value")).toHaveText(baseline);
  await expect(page.locator(".aging-average .kpi-value")).toHaveText(
    "401,31 dias",
  );
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar Excel", exact: true })
    .click();
  const file = await pending,
    path = testInfo.outputPath("base-real.xlsx");
  await file.saveAs(path);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(await readFile(path)).buffer);
  const sheet = workbook.worksheets[1];
  expect(sheet.rowCount - 2).toBe(
    Number(
      (await stat(page, "Registros selecionados").innerText()).replace(
        /\./g,
        "",
      ),
    ),
  );
  expect(
    Math.round(Number(sheet.getRow(sheet.rowCount).getCell(12).result) * 100),
  ).toBe(886089537);
});
