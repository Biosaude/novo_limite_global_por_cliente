import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./fixtures";
async function manage(page: Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Gerenciar Base", exact: true })
    .click();
}
async function stage(
  page: Page,
  variant: Parameters<typeof fixture>[0] = "normal",
) {
  await manage(page);
  await page.getByLabel("Selecionar planilha Excel").setInputFiles({
    name: "ARQUIVO_DE_TESTE.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await fixture(variant),
  });
  await expect(
    page.getByRole("heading", { name: "Conferir estrutura e mapeamento" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Validar estrutura e calcular totais" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conferência da nova base" }),
  ).toBeVisible();
}
async function importFixture(page: Page, remember = false) {
  await stage(page);
  if (remember)
    await page.getByLabel("Lembrar a nova base neste navegador").check();
  await page
    .getByRole("checkbox", { name: /Confirmar utilização da base/ })
    .check();
  await page
    .getByRole("button", { name: "Atualizar Dashboard", exact: true })
    .click();
  await expect(
    page.getByText(/Dashboard atualizado com sucesso: 6 registros/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
}

test("interface vazia: cinco cards, seis gráficos, filtros indisponíveis e responsividade", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Dashboard Limite Global por Cliente · Biosaúde",
  );
  await expect(page.locator(".kpi")).toHaveCount(5);
  await expect(page.locator(".kpi-value")).toHaveText([
    "—BRL",
    "—BRL",
    "—BRL",
    "—BRL",
    "—",
  ]);
  await expect(page.locator(".chart-panel")).toHaveCount(6);
  for (const select of await page.getByRole("combobox").all())
    await expect(select).toBeDisabled();
  for (const name of [
    "Clientes",
    "Representantes",
    "Auditoria",
    "Gerenciar Base",
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("importação calcula valores efetivos, gráficos e rankings; filtros respeitam posição e YTD", async ({
  page,
}) => {
  const errors: string[] = [],
    posts: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.goto("/");
  await importFixture(page);
  await expect(page.locator(".kpi-value").first()).toHaveText(/150,30/);
  await expect(page.locator(".chart-panel svg.recharts-surface")).toHaveCount(
    6,
  );
  await expect(
    page.getByRole("button", { name: "Cliente Teste A", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Mês de referência", { exact: true })
    .selectOption("09");
  await expect(page.locator(".kpi.received .kpi-value")).toHaveText(/30,30/);
  await expect(page.locator(".kpi.upcoming .kpi-value")).toHaveText(/100,10/);
  await page
    .getByLabel("Cliente", { exact: true })
    .selectOption("Cliente Teste B");
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/0,00/);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page
    .getByLabel("Categoria financeira", { exact: true })
    .selectOption("overdue");
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/50,20/);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Representantes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Representante Teste", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(posts).toEqual([]);
});

test("detalhamento, originais, auditoria e justificativa local funcionam e persistem sob opção", async ({
  page,
}) => {
  await page.goto("/");
  await importFixture(page, true);
  await page
    .getByRole("button", { name: "Cliente Teste A", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Linha 2: ver original" })
    .first()
    .click();
  await expect(page.locator(".original-record")).toContainText("9999");
  await page.getByRole("button", { name: "Fechar detalhamento" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Auditoria", exact: true })
    .click();
  await page.getByRole("button", { name: "Registrar conferência" }).click();
  await page
    .getByLabel("Justificativa", { exact: true })
    .fill("Conferência local de recebimento parcial.");
  await page.getByRole("button", { name: "Salvar justificativa" }).click();
  await expect(
    page.getByText("Conferido localmente", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Conferência local de recebimento parcial."),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/150,30/);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Auditoria", exact: true })
    .click();
  await expect(
    page.getByText("Conferência local de recebimento parcial."),
  ).toBeVisible();
  await manage(page);
  await page
    .getByRole("button", { name: "Desativar base atual (preservar histórico)" })
    .click();
  await expect(page.locator(".status")).toHaveText("Sem base importada");
  await page.reload();
  await expect(page.locator(".status")).toHaveText("Sem base importada");
});

test("substituição inválida preserva a base; confirmação válida troca os valores", async ({
  page,
}) => {
  await page.goto("/");
  await importFixture(page, true);
  await manage(page);
  await page.getByLabel("Selecionar planilha Excel").setInputFiles({
    name: "corrompido.xlsx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("invalid workbook"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível ler o Excel",
  );
  await expect(
    page.getByRole("heading", { name: "Base em utilização" }),
  ).toBeVisible();
  await stage(page, "invalid");
  await expect(
    page.getByRole("checkbox", { name: /Confirmar substituição da base/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/150,30/);
  await stage(page, "replacement");
  await expect(
    page.getByRole("checkbox", { name: /Confirmar substituição da base/ }),
  ).toBeEnabled();
  await page
    .getByRole("checkbox", { name: /Confirmar substituição da base/ })
    .check();
  await page
    .getByRole("button", { name: "Atualizar Dashboard", exact: true })
    .click();
  await expect(
    page.getByText(/Dashboard atualizado com sucesso:/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/92,70/);
  await page.reload();
  await expect(page.locator(".status")).toHaveText("Sem base importada");
});

test("planilha oficial no navegador: importação, totais reais, advertências e título 87848/01", async ({
  page,
}) => {
  test.skip(
    !process.env.BIOSAUDE_TEST_WORKBOOK,
    "Planilha oficial deve ser informada externamente, sem inclusão no repositório.",
  );
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4173") &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  await page.goto("/");
  await manage(page);
  await page
    .getByLabel("Selecionar planilha Excel")
    .setInputFiles(process.env.BIOSAUDE_TEST_WORKBOOK!);
  await expect(
    page.getByRole("heading", { name: "Conferir estrutura e mapeamento" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Validar estrutura e calcular totais" })
    .click();
  await expect(page.locator(".validation-panel")).toContainText(
    "5.099 registros preservados · 2.354 advertências · 0 erros bloqueantes",
  );
  await expect(page.locator(".preview-totals")).toContainText("36.286.262,45");
  await page
    .getByRole("checkbox", { name: /Confirmar utilização da base/ })
    .check();
  await page
    .getByRole("button", { name: "Atualizar Dashboard", exact: true })
    .click();
  await expect(
    page.getByText(/Dashboard atualizado com sucesso:/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(
    /36\.286\.262,45/,
  );
  await expect(page.locator(".kpi.upcoming .kpi-value")).toHaveText(
    /25\.711\.247,24/,
  );
  await expect(page.locator(".kpi.overdue .kpi-value")).toHaveText(
    /10\.575\.015,21/,
  );
  await expect(page.locator(".kpi.received .kpi-value")).toHaveText(
    /56\.999\.819,30/,
  );
  await expect(page.locator(".chart-panel svg.recharts-surface")).toHaveCount(
    6,
  );
  await expect(page.locator(".aging-average .kpi-value")).toHaveText("423,74 dias");
  await expect(page.locator(".kpi.upcoming .kpi-footer")).toContainText("70,86%");
  await expect(page.locator(".kpi.overdue .kpi-footer")).toContainText("29,14%");
  await expect(page.locator(".kpi.received .kpi-footer")).not.toContainText("%");
  await expect(page.locator(".critical-concentration > strong")).toHaveText("67,51%");
  await expect(page.locator(".aging-share-row")).toHaveCount(5);
  for (const amount of ["834.646,90", "292.886,43", "525.062,51", "1.783.670,50", "7.138.748,87"])
    await expect(page.locator(".aging-cards")).toContainText(amount);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Auditoria", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Pesquisar auditoria" })
    .fill("87848/01");
  await expect(
    page.getByText("Mesmo cliente e título em mais de uma categoria.", {
      exact: false,
    }),
  ).toBeVisible();
  const overlap = page
    .locator(".audit-table tbody tr")
    .filter({ hasText: "Mesmo cliente e título em mais de uma categoria." });
  await expect(overlap.locator(".audit-origin")).toHaveCount(2);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("modelo baixável: download real, planilha vazia compatível e controles alinhados", async ({
  page,
}, testInfo) => {
  const { readFile } = await import("node:fs/promises");
  const { default: ExcelJS } = await import("exceljs");
  await page.goto("/");
  await manage(page);
  const controls = page.getByRole("group", { name: "Controles da base" });
  await expect(controls.getByRole("button")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Atualizar Dashboard", exact: true }),
  ).toBeDisabled();
  const boxes = await Promise.all(
    (await controls.getByRole("button").all()).map((button) =>
      button.boundingBox(),
    ),
  );
  expect(boxes.every((box) => !!box)).toBe(true);
  if (page.viewportSize()!.width > 720) {
    expect(
      Math.max(...boxes.map((box) => box!.y)) -
        Math.min(...boxes.map((box) => box!.y)),
    ).toBeLessThan(2);
    expect(
      Math.max(...boxes.map((box) => box!.width)) -
        Math.min(...boxes.map((box) => box!.width)),
    ).toBeLessThan(2);
    expect(
      Math.max(...boxes.map((box) => box!.height)) -
        Math.min(...boxes.map((box) => box!.height)),
    ).toBeLessThan(2);
  }
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar Modelo da Base", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "Modelo_Base_Limite_Global_Biosaude.xlsx",
  );
  const output = testInfo.outputPath("modelo.xlsx");
  await download.saveAs(output);
  expect(await download.failure()).toBeNull();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(await readFile(output)).buffer);
  expect(workbook.worksheets).toHaveLength(3);
  for (const sheet of workbook.worksheets) {
    expect(sheet.actualRowCount).toBe(1);
    expect(sheet.getRow(1).getCell(1).value).toBe("Nome cliente");
    const headers = sheet.getRow(1).values as unknown[];
    expect(headers).toContain(
      sheet.name.includes("RECEBIDO") ? "Vr.recebido" : "Vr.aberto",
    );
  }
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Selecionar Nova Base", exact: true })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "ARQUIVO_DE_TESTE.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await fixture(),
  });
  await expect(page.locator(".preview-totals")).toContainText("150,30");
  await expect(
    page.getByRole("button", { name: "Atualizar Dashboard", exact: true }),
  ).toBeDisabled();
});

test("aplicar base exige confirmação e registra horário da aplicação; período muda FY", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-20T12:00:00Z"));
  await page.goto("/");
  await manage(page);
  await page.getByLabel("Selecionar planilha Excel").setInputFiles({
    name: "ARQUIVO_DE_TESTE.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await fixture(),
  });
  await expect(page.locator(".preview-totals")).toContainText("150,30");
  const apply = page.getByRole("button", {
    name: "Atualizar Dashboard",
    exact: true,
  });
  await expect(apply).toBeDisabled();
  await expect(page.locator(".status")).toHaveText("Sem base importada");
  await page
    .getByRole("checkbox", { name: /Confirmar utilização da base/ })
    .check();
  await expect(apply).toBeEnabled();
  await page.getByLabel("Data de referência da posição").fill("2026-10-18");
  await expect(apply).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /Confirmar utilização da base/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Validar estrutura e calcular totais" })
    .click();
  await page
    .getByRole("checkbox", { name: /Confirmar utilização da base/ })
    .check();
  await page.clock.setFixedTime(new Date("2026-10-20T15:45:00Z"));
  await apply.click();
  await expect(
    page.getByText(/Dashboard atualizado com sucesso: 6 registros/),
  ).toBeVisible();
  await expect(page.locator(".update-metadata")).toContainText(
    "20/10/2026, 12:45",
  );
  await expect(page.locator(".update-metadata")).toContainText("6 registros");
  await expect(page.locator(".status")).toHaveText("Atualizada");
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/150,30/);
  await page
    .getByRole("combobox", { name: "Ano", exact: true })
    .selectOption("2025");
  await expect(page.locator(".fiscal-subtitle")).toHaveText(
    "Dashboard Executivo — FY 2025",
  );
  expect(
    await page
      .locator(".kpi")
      .evaluateAll((cards) =>
        cards.every((card) => card.scrollWidth <= card.clientWidth),
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("painel sem menu lateral: categoria de inadimplência consistente e gráficos em largura ampliada", async ({
  page,
}) => {
  await page.goto("/");
  await importFixture(page);
  await expect(page.locator(".sidebar")).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("button")).toHaveCount(6);
  for (const button of await nav.getByRole("button").all())
    await expect(button).toBeVisible();
  await expect(page.locator(".kpi.overdue")).toContainText(
    "Vencidos (inadimplência)",
  );
  await expect(
    page
      .getByRole("combobox", { name: "Categoria financeira" })
      .locator('option[value="overdue"]'),
  ).toHaveText("Vencidos (inadimplência)");
  await expect(
    page.getByRole("columnheader", {
      name: "Vencidos (inadimplência)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".aging-card")).toHaveCount(5);
  const firstBand = page
    .locator(".aging-card")
    .filter({ hasText: "1–30 dias" });
  await expect(firstBand).toContainText("50,20");
  await expect(firstBand).toContainText("100%");
  const month = page.locator(".chart-panel").filter({
    has: page.getByRole("heading", {
      name: "Recebimentos por mês",
      exact: true,
    }),
  });
  const aging = page.locator(".chart-panel").filter({
    has: page.getByRole("heading", {
      name: "Faixas de atraso · Vencidos (inadimplência)",
      exact: true,
    }),
  });
  await expect(month).toBeVisible();
  await expect(aging).toBeVisible();
  if (page.viewportSize()!.width > 1100) {
    const monthBox = (await month.boundingBox())!,
      agingBox = (await aging.boundingBox())!;
    expect(monthBox.x).toBeLessThan(agingBox.x);
    expect(monthBox.width).toBeGreaterThan(agingBox.width);
    expect(Math.abs(monthBox.y - agingBox.y)).toBeLessThan(2);
  }
  await page
    .getByRole("combobox", { name: "Categoria financeira" })
    .selectOption("overdue");
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/50,20/);
  await expect(page.locator(".kpi.overdue .kpi-value")).toHaveText(/50,20/);
  await expect(page.getByText(/^Vencidos?$/i)).toHaveCount(0);
  expect(
    await page
      .locator(".kpi, .aging-card")
      .evaluateAll((cards) =>
        cards.every((card) => card.scrollWidth <= card.clientWidth),
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});


test("fórmulas permanentes, aging ponderado e percentuais respeitam seleção e layout", async ({page}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await importFixture(page);
  await expect(page.locator(".financial-kpis .kpi")).toHaveCount(4);
  await expect(page.locator(".financial-kpis .kpi-label")).toHaveText([
    "Exposição Financeira Total", "A Vencer", "Vencidos (inadimplência)", "Recebido YTD",
  ]);
  await expect(page.locator(".financial-kpis .kpi-value")).toHaveText([/150,30/, /100,10/, /50,20/, /50,70/]);
  await expect(page.locator(".aging-average .kpi-value")).toHaveText("10 dias");
  await expect(page.locator(".kpi.upcoming .kpi-footer")).toContainText("66,6%");
  await expect(page.locator(".kpi.overdue .kpi-footer")).toContainText("33,4%");
  await expect(page.locator(".kpi.received .kpi-footer")).not.toContainText("%");
  for (const formula of await page.locator(".financial-kpis .kpi-formula, .aging-average .kpi-formula, .aging-card .kpi-formula").all()) {
    await expect(formula).toBeVisible();
    await expect(formula).toContainText("Cálculo:");
    expect(await formula.evaluate(e => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight)).toBe(true);
  }
  const card = (await page.locator(".aging-average").boundingBox())!;
  const distribution = (await page.locator(".aging-distribution").boundingBox())!;
  const first = (await page.locator(".financial-kpis").boundingBox())!;
  expect(card.y).toBeGreaterThan(first.y + first.height);
  expect(distribution.y).toBeGreaterThan(card.y + card.height);
  await expect(page.locator(".aging-share-row")).toHaveCount(5);
  await expect(page.locator(".aging-share-row").first()).toContainText("100%");
  await expect(page.locator(".critical-concentration > strong")).toHaveText("0%");
  if (process.env.BIOSAUDE_CAPTURE_AGING && ['desktop','mobile'].includes(testInfo.project.name)) {
    await page.screenshot({path: `docs/preview-aging-${testInfo.project.name}.png`,fullPage:true});
  }
  await page.getByLabel("Mês de referência", {exact:true}).selectOption("09");
  await expect(page.locator(".aging-average .kpi-value")).toHaveText("10 dias");
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/150,30/);
  await expect(page.locator(".kpi.received .kpi-value")).toHaveText(/30,30/);
  await expect(page.locator(".filter-help")).toContainText("não reconstrói saldos históricos");
  await page.getByLabel("Cliente", {exact:true}).selectOption("Cliente Teste B");
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/0,00/);
  await expect(page.locator(".aging-average .kpi-value")).toHaveText("Não aplicável");
  await expect(page.locator(".kpi.overdue .kpi-footer")).toContainText("Não aplicável");
  await expect(page.locator(".critical-concentration > strong")).toHaveText("Não aplicável");
  await page.getByRole("button", {name:"Limpar filtros"}).click();
  await page.getByLabel("Representante", {exact:true}).selectOption("Representante Teste");
  await expect(page.locator(".aging-average .kpi-value")).toHaveText("10 dias");
  await page.getByLabel("Categoria financeira", {exact:true}).selectOption("received");
  await expect(page.locator(".aging-average .kpi-value")).toHaveText("Não aplicável");
  await expect(page.locator(".kpi.exposure .kpi-value")).toHaveText(/0,00/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
