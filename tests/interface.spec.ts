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
  await page
    .getByLabel("Selecionar planilha Excel")
    .setInputFiles({
      name: "teste.xlsx",
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
    .getByRole("button", { name: "Confirmar utilização da base" })
    .click();
  await expect(page.getByText(/Base confirmada: 6 registros/)).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
}

test("interface vazia: quatro cards, seis gráficos, filtros indisponíveis e responsividade", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Limite Global por Cliente",
  );
  await expect(page.locator(".kpi")).toHaveCount(4);
  await expect(page.locator(".kpi-value")).toHaveText([
    "—BRL",
    "—BRL",
    "—BRL",
    "—BRL",
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
  await expect(page.locator(".kpi-value").first()).toHaveText(/201,00/);
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
  await expect(page.locator(".kpi.global .kpi-value")).toHaveText(/30,30/);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page
    .getByLabel("Categoria financeira", { exact: true })
    .selectOption("overdue");
  await expect(page.locator(".kpi.global .kpi-value")).toHaveText(/50,20/);
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
  await expect(page.locator(".kpi.global .kpi-value")).toHaveText(/201,00/);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Auditoria", exact: true })
    .click();
  await expect(
    page.getByText("Conferência local de recebimento parcial."),
  ).toBeVisible();
  await manage(page);
  await page
    .getByRole("button", { name: "Remover base deste navegador" })
    .click();
  await page.reload();
  await expect(page.locator(".status")).toHaveText("Sem base importada");
});

test("substituição inválida preserva a base; confirmação válida troca os valores", async ({
  page,
}) => {
  await page.goto("/");
  await importFixture(page, true);
  await manage(page);
  await page
    .getByLabel("Selecionar planilha Excel")
    .setInputFiles({
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
    page.getByRole("button", { name: "Confirmar substituição da base" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  await expect(page.locator(".kpi.global .kpi-value")).toHaveText(/201,00/);
  await stage(page, "replacement");
  await expect(
    page.getByRole("button", { name: "Confirmar substituição da base" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirmar substituição da base" })
    .click();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  await expect(page.locator(".kpi.global .kpi-value")).toHaveText(/143,40/);
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
  await expect(page.locator(".preview-totals")).toContainText("93.286.081,75");
  await page
    .getByRole("button", { name: "Confirmar utilização da base" })
    .click();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  await expect(page.locator(".kpi.global .kpi-value")).toHaveText(
    /93\.286\.081,75/,
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
