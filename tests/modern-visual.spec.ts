import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
test("modernização: fonte local, proporções válidas, chips independentes, rosca e consulta final", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Gerenciar Base", exact: true })
    .click();
  await page.getByLabel("Data de referência da posição").fill("2026-10-19");
  await page.getByLabel("Selecionar planilha Excel").setInputFiles({
    name: "TESTE_VISUAL_EXECUTIVO.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await fixture(),
  });
  await expect(
    page.getByRole("heading", { name: "Conferência da nova base" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /Confirmar utilização da base/ })
    .check();
  await page
    .getByRole("button", { name: "Atualizar Dashboard", exact: true })
    .click();
  await page.getByRole("button", { name: "Voltar ao dashboard" }).click();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check("400 14px Inter")),
  ).toBe(true);
  expect(
    await page
      .locator(".main-title")
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(26);
  const values = await page
    .locator(".financial-kpis .kpi-value")
    .allTextContents();
  await expect(page.locator(".kpi-progress")).toHaveCount(2);
  expect(
    await page.locator(".kpi-progress").evaluateAll((elements) =>
      elements.every((e) => {
        const p = e as HTMLProgressElement;
        return p.max > 0 && p.value >= 0 && p.value <= p.max;
      }),
    ),
  ).toBe(true);
  await page
    .getByLabel("Cliente", { exact: true })
    .selectOption("Cliente Teste A");
  await page
    .getByLabel("Representante", { exact: true })
    .selectOption("Representante Teste");
  await expect(page.locator(".kpi.received .kpi-value")).toHaveText(/20,40/);
  await page
    .getByRole("button", { name: "Remover filtro Cliente", exact: true })
    .click();
  await expect(page.getByLabel("Representante", { exact: true })).toHaveValue(
    "Representante Teste",
  );
  await expect(page.locator(".kpi.received .kpi-value")).toHaveText(/50,70/);
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(page.locator(".financial-kpis .kpi-value")).toHaveText(values);
  await expect(page.locator(".recharts-reference-dot")).toHaveCount(1);
  await expect(page.locator(".donut-total")).toContainText("Total");
  const pie = page.locator(".chart-panel").filter({
    has: page.getByRole("heading", {
      name: "Composição da movimentação gerencial",
      exact: true,
    }),
  });
  await pie.scrollIntoViewIfNeeded();
  const bounds = (await pie.locator("svg.recharts-surface").boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 70,
    bounds.y + bounds.height / 2 - 15,
  );
  await expect(pie.locator(".recharts-tooltip-wrapper")).toBeVisible();
  expect(
    await page
      .locator(".collection-panel")
      .evaluate((e) => e.nextElementSibling?.tagName),
  ).toBe("FOOTER");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (
    process.env.BIOSAUDE_CAPTURE_MODERN &&
    ["desktop", "mobile"].includes(info.project.name)
  ) {
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `docs/preview-modern-${info.project.name}.png`,
      fullPage: true,
    });
    if (info.project.name === "desktop")
      await page
        .locator(".financial-kpis")
        .screenshot({ path: "docs/preview-modern-kpis.png" });
  }
  expect(errors).toEqual([]);
});
