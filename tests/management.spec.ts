import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { managementFixture } from "./management-fixture";
test.use({ locale: "pt-BR" });
async function activate(page: Page, real = false) {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Gerenciar Base", exact: true })
    .click();
  await page.getByLabel("Data de referência da posição").fill("2026-10-23");
  await page.getByLabel("Selecionar planilha Excel").setInputFiles(
    real
      ? process.env.BIOSAUDE_UPDATED_WORKBOOK!
      : {
          name: "GESTAO_SINTETICA.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: await managementFixture(),
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
    .getByRole("button", { name: "Gestão da Inadimplência", exact: true })
    .click();
  await expect(page.locator(".management-module")).toBeVisible();
}
const values = (page: Page) => page.locator(".management-kpis .kpi-value");
async function action(page: Page, status = "Cobrança administrativa") {
  const select = page.getByLabel("Duplicata para tratamento", { exact: true });
  const key = await select
    .locator("option")
    .filter({ hasText: "P3/01" })
    .getAttribute("value");
  await select.selectOption(key!);
  await page.getByLabel("Nova etapa", { exact: true }).selectOption(status);
  await page
    .getByLabel("Responsável da ação", { exact: true })
    .fill("Analista Sintético");
  await page
    .getByLabel("Ação realizada", { exact: true })
    .fill("Contato registrado de teste");
  await page
    .getByLabel("Resultado do contato", { exact: true })
    .fill("Retorno documentado");
  await page
    .getByRole("button", { name: "Registrar tratamento", exact: true })
    .click();
}
async function legalCase(page: Page, number: string, links: string[]) {
  await page.getByLabel("Número do processo", { exact: true }).fill(number);
  await page
    .getByLabel("Natureza do procedimento", { exact: true })
    .selectOption("judicial");
  await page
    .getByLabel("Órgão judicial ou administrativo", { exact: true })
    .fill("Órgão sintético");
  await page
    .getByLabel("Fonte documental do vínculo", { exact: true })
    .fill("Documento sintético conferido");
  await page
    .getByLabel("Valor da causa (não é dívida)", { exact: true })
    .fill("99999,00");
  await page
    .getByLabel("Status processual informado", { exact: true })
    .fill("Situação declarada de teste");
  for (const t of links)
    await page
      .getByRole("checkbox", { name: "Vincular " + t, exact: true })
      .check();
  await page
    .getByRole("checkbox", {
      name: "Confirmar vínculos documentais",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Salvar processo e vínculos", exact: true })
    .click();
}
test("gestão: carteira, filtros, histórico, navegação e responsividade sem persistência automática", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await activate(page);
  await expect(values(page)).toHaveText([
    /650,00/,
    "Não disponível",
    "Não disponível",
    "Não disponível",
    /700,00/,
    "Não disponível",
  ]);
  await expect(page.locator(".operational-warning")).toContainText("perdidos");
  await page
    .getByLabel("Mês da recuperação", { exact: true })
    .selectOption("07");
  await expect(values(page).first()).toHaveText(/650,00/);
  await expect(values(page).nth(4)).toHaveText(/400,00/);
  await page.getByRole("button", { name: "Limpar filtros da gestão" }).click();
  await action(page);
  await expect(values(page).nth(1)).toHaveText(/250,00/);
  await action(page, "Em negociação");
  await expect(values(page).nth(2)).toHaveText(/250,00/);
  await expect(
    page
      .getByRole("table", { name: "Histórico do título" })
      .locator("tbody tr"),
  ).toHaveCount(2);
  await page
    .getByLabel("Status de tratamento", { exact: true })
    .selectOption("Em negociação");
  await expect(values(page).first()).toHaveText(/250,00/);
  await expect(values(page).nth(4)).toHaveText(/300,00/);
  await page
    .getByRole("checkbox", {
      name: "Gestão faixa Acima de 180 dias",
      exact: true,
    })
    .check();
  await expect(page.locator(".management-query tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Limpar filtros da gestão" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/750,00/);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Gestão da Inadimplência", exact: true })
    .click();
  await expect(values(page).nth(2)).toHaveText(/250,00/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (
    process.env.BIOSAUDE_CAPTURE_MANAGEMENT &&
    ["desktop", "mobile"].includes(info.project.name)
  )
    await page.screenshot({
      path: `docs/preview-management-${info.project.name}.png`,
      fullPage: true,
    });
  expect(errors).toEqual([]);
});
test("gestão: processos conciliados sem dupla contagem e três relatórios reais Excel/PDF", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await activate(page);
  await action(page, "Judicializado");
  await expect(page.getByRole("alert")).toContainText("exige processo");
  await legalCase(page, "CASO-SINTETICO-1", ["P3/01", "P4/01"]);
  await expect(values(page).nth(3)).toHaveText(/550,00/);
  await legalCase(page, "CASO-SINTETICO-2", ["P3/01"]);
  await expect(values(page).nth(3)).toHaveText(/550,00/);
  await expect(
    page
      .getByRole("table", { name: "Processos registrados" })
      .locator("tbody tr"),
  ).toHaveCount(2);
  await page
    .getByRole("button", {
      name: "Editar processo CASO-SINTETICO-1",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Status processual informado", { exact: true })
    .fill("Situação atualizada pelo usuário");
  await page
    .getByRole("button", { name: "Salvar processo e vínculos", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Processos registrados" }),
  ).toContainText("Situação atualizada pelo usuário");
  await action(page, "Judicializado");
  await expect(
    page
      .getByRole("table", { name: "Histórico do título" })
      .locator("tbody tr"),
  ).toHaveCount(1);
  await expect(page.getByLabel('Participação judicial selecionada')).toContainText('84,62%');
  await page.locator('.table-scroll').evaluateAll(elements=>elements.forEach(e=>e.scrollLeft=0));
  if (
    process.env.BIOSAUDE_CAPTURE_MANAGEMENT &&
    info.project.name === "desktop"
  )
    await page.screenshot({
      path: "docs/preview-management-processes.png",
      fullPage: true,
    });
  for (const kind of ["pending", "treatment", "process"]) {
    await page
      .getByLabel("Tipo de relatório da gestão", { exact: true })
      .selectOption(kind);
    const down = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar Excel da gestão" })
      .click();
    const x = await down,
      xpath = info.outputPath(kind + ".xlsx");
    await x.saveAs(xpath);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Uint8Array.from(await readFile(xpath)).buffer);
    const s = wb.getWorksheet("Pendências e Tratamentos")!;
    let total = 0;
    s.eachRow((r, i) => {
      if (i > 1) total += Math.round(Number(r.getCell(6).value) * 100);
    });
    expect(total).toBe(kind === "process" ? 55000 : 65000);
    expect(JSON.stringify(wb.model)).not.toContain("PACIENTE-NAO-EXPORTAR");
    const pdfDown = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar PDF da gestão" }).click();
    const pdf = await pdfDown,
      pdfPath = info.outputPath(kind + ".pdf");
    await pdf.saveAs(pdfPath);
    const text = execFileSync("pdftotext", [
      "-layout",
      pdfPath,
      "-",
    ]).toString();
    expect(text).toContain("Gestão da Inadimplência");
    expect(text).toContain(kind === "process" ? "550,00" : "650,00");
    expect(text).not.toContain("PACIENTE-NAO-EXPORTAR");
  }
});
test("gestão: backup e reimportação explícita, recarga limpa memória e relação processual fica sem vínculos", async ({
  page,
}, info) => {
  await activate(page);
  await action(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar histórico JSON" }).click();
  const file = await pending,
    path = info.outputPath("historico.json");
  await file.saveAs(path);
  const backup = JSON.parse(await readFile(path, "utf8"));
  expect(backup.operations.actions).toHaveLength(1);
  await page.reload();
  await activate(page);
  await expect(values(page).nth(1)).toHaveText("Não disponível");
  await page
    .getByLabel("Reimportar histórico JSON", { exact: true })
    .setInputFiles(path);
  await expect(page.getByText(/Prévia: 1 ações/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aplicar importação operacional" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Confirmar importação operacional" })
    .check();
  await page
    .getByRole("button", { name: "Aplicar importação operacional" })
    .click();
  await expect(values(page).nth(1)).toHaveText(/250,00/);
  const relation = {
    format: "biosaude-process-list",
    version: 1,
    processes: [
      {
        number: "PROCEDIMENTO-SINTETICO",
        interested: "Parte informada",
        opponent: "Adversa informada",
        kind: "administrative",
        actionType: "Procedimento administrativo",
        court: "Órgão informado",
        claimCents: 123000,
        status: "Situação informada",
        responsible: "Responsável declarado",
        nextStep: "Providência informada",
      },
    ],
  };
  await page
    .getByLabel("Importar relação de processos", { exact: true })
    .setInputFiles({
      name: "relacao.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(relation)),
    });
  await page
    .getByRole("checkbox", { name: "Confirmar importação operacional" })
    .check();
  await page
    .getByRole("button", { name: "Aplicar importação operacional" })
    .click();
  await expect(
    page.getByRole("table", { name: "Processos registrados" }),
  ).toContainText("Não conciliado");
  await expect(values(page).nth(3)).toHaveText("Não disponível");
});
test("gestão real: carteira mantém R$ 11.105.739,72, sem processos presumidos nem taxa artificial", async ({
  page,
}) => {
  test.skip(!process.env.BIOSAUDE_UPDATED_WORKBOOK, "Base real externa.");
  await activate(page, true);
  await expect(values(page)).toHaveText([
    /11\.105\.739,72/,
    "Não disponível",
    "Não disponível",
    "Não disponível",
    /27\.815\.746,35/,
    "Não disponível",
  ]);
  await expect(page.locator(".management-query")).toContainText(
    "793 registros",
  );
  await expect(
    page
      .getByRole("table", { name: "Processos registrados" })
      .locator("tbody tr"),
  ).toHaveCount(0);
  await page
    .getByLabel("Mês da recuperação", { exact: true })
    .selectOption("01");
  await expect(values(page).first()).toHaveText(/11\.105\.739,72/);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await expect(page.locator(".aging-average .kpi-value")).toHaveText(
    "401,31 dias",
  );
});
