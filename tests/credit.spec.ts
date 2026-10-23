import { test, expect, type Page } from "@playwright/test";
import { creditFixture } from "./credit-fixture";
import { fixture } from "./fixtures";
import { readWorkbook } from "../src/importacao/workbook";
import { normalize } from "../src/importacao/normalize";
import { suggestMappings } from "../src/importacao/mapping";
async function manage(page: Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Gerenciar Base", exact: true })
    .click();
}
async function activateCreditFixture(page: Page, remember = false) {
  await manage(page);
  await page.getByLabel("Data de referência da posição").fill("2026-03-31");
  await page
    .getByLabel("Selecionar planilha Excel")
    .setInputFiles({
      name: "ARQUIVO_DE_TESTE_CREDITO.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await creditFixture(),
    });
  await expect(page.locator(".preview-totals")).toContainText("150,00");
  if (remember)
    await page.getByLabel("Lembrar a nova base neste navegador").check();
  await page
    .getByRole("checkbox", { name: /Confirmar utilização da base/ })
    .check();
  await page
    .getByRole("button", { name: "Atualizar Dashboard", exact: true })
    .click();
  await expect(
    page.getByText(/Dashboard atualizado com sucesso:/),
  ).toBeVisible();
}
async function credit(page: Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Análise de Crédito", exact: true })
    .click();
}
test("crédito: exposição não inclui recebimentos, métricas individuais e origem rastreável", async ({
  page,
}) => {
  const errors: string[] = [],
    posts: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/");
  await activateCreditFixture(page);
  await credit(page);
  await expect(page.locator(".credit-kpis .kpi").nth(1)).toContainText(
    "150,00",
  );
  await expect(page.locator(".credit-kpis")).toContainText(
    "Sem limite aprovado",
  );
  await expect(page.locator(".credit-chart")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Cliente Teste A", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Análise de crédito individual",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".credit-metrics")).toContainText("34,83");
  await expect(dialog).toContainText("23,6 dias");
  await expect(dialog).toContainText("41,8 dias");
  await expect(dialog).toContainText("Pendente de política de crédito");
  await expect(dialog.locator(".credit-metrics")).toContainText(
    "Títulos com múltiplos lançamentos1",
  );
  await dialog
    .getByRole("button", { name: /linha 2/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Detalhamento financeiro" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Linha 2: ver original" })
    .first()
    .click();
  await expect(page.locator(".original-record")).toContainText("99999");
  await page.getByRole("button", { name: "Fechar detalhamento" }).click();
  await page
    .getByRole("combobox", {
      name: "Selecionar cliente para análise",
      exact: true,
    })
    .selectOption({ label: "Cliente Teste B" });
  await expect(page.locator(".credit-ranking")).toContainText(
    "Dados insuficientes",
  );
  await expect(page.locator(".credit-kpis").nth(0)).toContainText(
    "Não aplicável",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(posts).toEqual([]);
});
test("proposta é versionada e auditável, mas não ativa recomendação ou aprovação", async ({
  page,
}) => {
  await page.goto("/");
  await activateCreditFixture(page, true);
  await credit(page);
  await page.locator(".policy-editor > summary").click();
  await page.getByLabel("Fator proposto Alto", { exact: true }).fill("40");
  await page
    .getByLabel("Justificativa da proposta", { exact: true })
    .fill("PROPOSTA DE TESTE: revisão gerencial para análise, sem aprovação.");
  await page
    .getByRole("button", { name: "Salvar proposta para revisão", exact: true })
    .click();
  await expect(page.locator(".credit-controls")).toContainText("proposta v1");
  await expect(page.locator(".credit-kpis").first()).toContainText(
    "Pendente de política de crédito",
  );
  await page.reload();
  await credit(page);
  await page.locator(".policy-editor > summary").click();
  await expect(
    page.getByLabel("Fator proposto Alto", { exact: true }),
  ).toHaveValue("40");
  await expect(page.locator(".proposal-history")).toContainText(
    "PROPOSTA DE TESTE",
  );
  await expect(page.getByRole("button", { name: /Aprovar/ })).toHaveCount(0);
  await expect(page.locator(".credit-ranking")).toContainText(
    "Pendente de política de crédito",
  );
});
test("substituição preserva posições anteriores e reativa uma referência sem mistura", async ({
  page,
}) => {
  await page.goto("/");
  await activateCreditFixture(page, true);
  await manage(page);
  await page.getByLabel("Data de referência da posição").fill("2026-10-19");
  await page
    .getByLabel("Selecionar planilha Excel")
    .setInputFiles({
      name: "SEGUNDA_BASE_DE_TESTE.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await fixture(),
    });
  await page.getByLabel("Lembrar a nova base neste navegador").check();
  await page
    .getByRole("checkbox", { name: /Confirmar substituição da base/ })
    .check();
  await page
    .getByRole("button", { name: "Atualizar Dashboard", exact: true })
    .click();
  await expect(
    page.getByText(/Dashboard atualizado com sucesso: 6 registros/),
  ).toBeVisible();
  await page.reload();
  await manage(page);
  const versions = page.getByRole("combobox", {
    name: "Versão anterior",
    exact: true,
  });
  const oldValue = await versions
    .locator("option")
    .filter({ hasText: "31/03/2026" })
    .getAttribute("value");
  await versions.selectOption(oldValue!);
  await page
    .getByRole("button", { name: "Reativar versão selecionada", exact: true })
    .click();
  await credit(page);
  await expect(page.locator(".credit-kpis .kpi").nth(1)).toContainText(
    "150,00",
  );
  await expect(page.locator(".base-caption")).toContainText("31/03/2026");
  await expect(page.locator(".credit-ranking")).toContainText("34,83");
});
test("base IndexedDB v1 é migrada e os campos de crédito são recuperados da origem", async ({
  page,
}) => {
  const source = await readWorkbook(
    Uint8Array.from(await creditFixture()).buffer,
  );
  const legacy = normalize(
    source,
    suggestMappings(source),
    "2026-03-31",
    "BASE_ANTIGA_DE_TESTE.xlsx",
  );
  for (const record of legacy.records) {
    delete record.issued;
    delete record.document;
    delete record.installment;
  }
  for (const mapping of legacy.mappings)
    for (const field of ["issued", "document", "installment"])
      delete (mapping.fields as unknown as Record<string, number>)[field];
  await page.goto("/");
  await expect(page.locator(".status")).toHaveText("Sem base importada");
  await page.evaluate(async (dataset) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("biosaude-financeiro");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("biosaude-financeiro", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("datasets");
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("datasets", "readwrite");
        tx.objectStore("datasets").put(dataset, "active");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, legacy);
  await page.reload();
  await credit(page);
  await expect(page.locator(".credit-ranking")).toContainText("34,83");
  await page
    .getByRole("button", { name: "Cliente Teste A", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("41,8 dias");
});
test("crédito na planilha oficial: 169 clientes e exposição conciliada no navegador", async ({
  page,
}) => {
  test.skip(
    !process.env.BIOSAUDE_TEST_WORKBOOK,
    "A planilha oficial é externa ao repositório.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await manage(page);
  await page.getByLabel("Data de referência da posição").fill("2026-10-19");
  await page
    .getByLabel("Selecionar planilha Excel")
    .setInputFiles(process.env.BIOSAUDE_TEST_WORKBOOK!);
  await expect(page.locator(".preview-totals")).toContainText("36.286.262,45", {
    timeout: 30000,
  });
  await page
    .getByRole("checkbox", { name: /Confirmar utilização da base/ })
    .check();
  await page
    .getByRole("button", { name: "Atualizar Dashboard", exact: true })
    .click();
  await expect(
    page.getByText(/Dashboard atualizado com sucesso: 5.099 registros/),
  ).toBeVisible();
  await credit(page);
  await expect(page.locator(".credit-controls")).toContainText("169 clientes");
  await expect(page.locator(".credit-kpis .kpi").nth(1)).toContainText(
    "36.286.262,45",
  );
  await expect(page.locator(".credit-kpis .kpi").nth(3)).toContainText(
    "56.999.819,30",
  );
  await expect(page.locator(".credit-ranking")).toContainText(
    "Pendente de política de crédito",
  );
  await expect(page.locator(".credit-chart")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
