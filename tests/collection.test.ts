import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { collectionFixture } from "./collection-fixture";
import { readWorkbook } from "../src/importacao/workbook";
import { normalize } from "../src/importacao/normalize";
import { suggestMappings } from "../src/importacao/mapping";
import {
  initialFilters,
  selectRecords,
  totals,
  aging,
} from "../src/domain/finance";
import {
  buildCollectionView,
  initialCollectionQuery,
  collectionSummary,
  selectCollectionRows,
  collectionRows,
} from "../src/cobranca/query";
import { createCollectionExcel } from "../src/relatorios/excel";
import { createCollectionPdf } from "../src/relatorios/pdf";
async function data() {
  const source = await readWorkbook(
    Uint8Array.from(await collectionFixture()).buffer,
  );
  return normalize(
    source,
    suggestMappings(source),
    "2026-10-23",
    "SINTETICO.xlsx",
  );
}
const font = () => readFile("src/relatorios/assets/DejaVuSans.ttf", "base64");
test("consulta de cobrança exclui recebido e aplica cliente/representante/categoria em interseção", async () => {
  const dataset = await data(),
    filters = initialFilters(dataset),
    all = selectRecords(dataset, filters),
    before = JSON.stringify(dataset);
  const view = buildCollectionView(
    dataset,
    all,
    filters,
    initialCollectionQuery,
  );
  assert.equal(view.rows.length, 92);
  assert.equal(view.summary.totalOpen, 439590);
  assert.equal(totals(all).received, 5000000);
  for (const patch of [
    { client: "Cliente Sintético A" },
    { representative: "Representante X" },
    { client: "Cliente Sintético B", representative: "Representante Y" },
    { category: "overdue" },
    { category: "received" },
  ]) {
    const f = { ...filters, ...patch },
      rows = selectRecords(dataset, f),
      selected = buildCollectionView(dataset, rows, f, initialCollectionQuery);
    assert.ok(
      selected.rows.every(
        (row) =>
          (!f.client || row.client === f.client) &&
          (!f.representative || row.representative === f.representative) &&
          (!f.category || row.record.category === f.category),
      ),
    );
    if (f.category === "received") assert.equal(selected.rows.length, 0);
  }
  assert.equal(JSON.stringify(dataset), before);
});
test("cinco faixas e união não duplicam lançamentos nem alteram o contexto dos KPIs", async () => {
  const dataset = await data(),
    f = initialFilters(dataset),
    records = selectRecords(dataset, f),
    baseline = totals(records),
    rows = collectionRows(dataset, records);
  for (const band of [1, 2, 3, 4, 5] as const) {
    const view = buildCollectionView(dataset, records, f, {
      ...initialCollectionQuery,
      bands: [band],
    });
    assert.equal(view.rows.length, 18);
    assert.ok(view.rows.every((row) => row.record.category === "overdue"));
  }
  const selected = selectCollectionRows(rows, dataset.reference, {
    ...initialCollectionQuery,
    bands: [4, 5, 4],
  });
  assert.equal(selected.length, 36);
  assert.equal(new Set(selected.map((row) => row.record.id)).size, 36);
  assert.deepEqual(totals(records), baseline);
  assert.equal(aging(records, dataset.reference).length, 7);
});
test("pesquisas, ordenação, vazios e referências históricas usam os mesmos registros", async () => {
  const dataset = await data(),
    filters = initialFilters(dataset),
    records = selectRecords(dataset, filters);
  const one = buildCollectionView(dataset, records, filters, {
    ...initialCollectionQuery,
    documentSearch: "DOC-008",
    clientSearch: "sintético a",
  });
  assert.equal(one.rows.length, 1);
  assert.equal(one.rows[0].days, 181);
  assert.equal(one.summary.totalOpen, 901);
  assert.equal(one.rows[0].nominalCents, 9099);
  assert.equal(one.rows[0].discountCents, 100);
  assert.equal(one.rows[0].hospital, "Hospital Sintético");
  assert.ok(!JSON.stringify(one).includes("DONOTEXPORT"));
  const empty = buildCollectionView(dataset, records, filters, {
    ...initialCollectionQuery,
    clientSearch: "inexistente",
  });
  assert.equal(empty.summary.totalOpen, 0);
  assert.equal(empty.summary.agingDays, null);
  for (const sort of ["due", "openCents", "days"] as const) {
    const rows = buildCollectionView(dataset, records, filters, {
      ...initialCollectionQuery,
      sort,
      ascending: false,
    }).rows;
    for (let i = 1; i < rows.length; i++)
      if (rows[i - 1][sort] !== null && rows[i][sort] !== null)
        assert.ok(rows[i - 1][sort]! >= rows[i][sort]!);
  }
});
test("títulos parciais contam lançamentos separadamente sem descartar valores e inconsistências preservam limitações", async () => {
  const dataset = await data(),
    rows = collectionRows(
      dataset,
      selectRecords(dataset, initialFilters(dataset)),
    )
      .filter((row) => row.record.category === "overdue")
      .slice(0, 2);
  rows[1] = {
    ...rows[1],
    document: rows[0].document,
    installment: rows[0].installment,
    title: rows[0].title,
  };
  const summary = collectionSummary(rows, dataset.reference);
  assert.equal(summary.recordCount, 2);
  assert.equal(summary.titleCount, 1);
  assert.equal(summary.totalOpen, 302);
  rows[0] = { ...rows[0], record: { ...rows[0].record, due: null }, due: null };
  assert.equal(collectionSummary(rows, dataset.reference).agingDays, null);
});
test("Excel exporta quatro abas, toda a seleção, tipos numéricos, origem, filtros, fórmulas e nenhum paciente", async () => {
  const dataset = await data(),
    filters = initialFilters(dataset),
    view = buildCollectionView(
      dataset,
      selectRecords(dataset, filters),
      filters,
      { ...initialCollectionQuery, bands: [4, 5] },
    );
  const bytes = await createCollectionExcel(view, "2026-10-23T14:00:00Z"),
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Uint8Array.from(bytes).buffer);
  assert.deepEqual(
    wb.worksheets.map((s) => s.name),
    [
      "Resumo Financeiro",
      "Duplicatas Detalhadas",
      "Resumo por Cliente",
      "Resumo por Representante",
    ],
  );
  const sheet = wb.worksheets[1];
  assert.equal(sheet.rowCount, view.rows.length + 2);
  assert.equal(sheet.views[0].state, "frozen");
  assert.ok(sheet.autoFilter);
  let total = 0;
  for (let n = 2; n <= view.rows.length + 1; n++) {
    const row = sheet.getRow(n);
    assert.equal(row.getCell(5).value, view.rows[n - 2].title);
    assert.ok(row.getCell(7).value instanceof Date);
    assert.equal(typeof row.getCell(12).value, "number");
    total += Math.round(Number(row.getCell(12).value) * 100);
  }
  assert.equal(total, view.summary.totalOpen);
  assert.match(
    sheet.getRow(sheet.rowCount).getCell(12).formula,
    /SUM\(L2:L37\)/,
  );
  assert.equal(
    Math.round(Number(sheet.getRow(sheet.rowCount).getCell(12).result) * 100),
    view.summary.totalOpen,
  );
  const all = JSON.stringify(wb.worksheets.map((s) => s.getSheetValues()));
  assert.ok(!all.includes("DONOTEXPORT"));
  assert.ok(!all.includes("Paciente"));
  assert.ok(all.includes("91–180 dias, Acima de 180 dias"));
  assert.ok(all.includes("23/10/2026"));
  for (const s of [wb.worksheets[2], wb.worksheets[3]]) {
    let total = 0;
    const col = s === wb.worksheets[2] ? 4 : 5;
    for (let n = 2; n <= s.rowCount; n++)
      total += Math.round(Number(s.getRow(n).getCell(col).value) * 100);
    assert.equal(total, view.summary.totalOpen);
  }
});
test("PDF real multipágina, UTF-8, total, referência, cabeçalho repetido e sem pacientes", async () => {
  const dataset = await data(),
    f = initialFilters(dataset),
    view = buildCollectionView(
      dataset,
      selectRecords(dataset, f),
      f,
      initialCollectionQuery,
    );
  const directory = await mkdtemp(join(tmpdir(), "biosaude-pdf-")),
    path = join(directory, "teste.pdf");
  await writeFile(
    path,
    createCollectionPdf(view, await font(), "2026-10-23T14:00:00Z"),
  );
  const info = execFileSync("pdfinfo", [path], { encoding: "utf8" }),
    text = execFileSync("pdftotext", ["-layout", path, "-"], {
      encoding: "utf8",
    });
  const pages = Number(/Pages:\s+(\d+)/.exec(info)![1]);
  assert.ok(pages > 1);
  assert.match(info, /841\.89 x 595\.28/);
  assert.ok(text.includes("Biosaúde Produtos Hospitalares"));
  assert.ok(text.includes("23/10/2026"));
  assert.ok(text.includes("4.395,90"));
  assert.ok(text.includes("DOC-089"));
  assert.equal(
    (text.match(/Biosaúde Produtos Hospitalares/g) ?? []).length,
    pages,
  );
  assert.equal((text.match(/Página \d+ de \d+/g) ?? []).length, pages);
  assert.ok(!text.includes("DONOTEXPORT"));
  assert.ok(!text.includes("Paciente"));
});
test("sem resultados não gera arquivos vazios enganosos", async () => {
  const dataset = await data(),
    f = initialFilters(dataset),
    view = buildCollectionView(dataset, [], f, initialCollectionQuery);
  await assert.rejects(createCollectionExcel(view));
  assert.throws(() => createCollectionPdf(view, "invalid"));
});
test(
  "nova planilha real concilia consulta e arquivos com as faixas e saldos independentes",
  { skip: !process.env.BIOSAUDE_UPDATED_WORKBOOK },
  async () => {
    const path = process.env.BIOSAUDE_UPDATED_WORKBOOK!,
      source = await readWorkbook(Uint8Array.from(await readFile(path)).buffer),
      dataset = normalize(
        source,
        suggestMappings(source),
        "2026-10-23",
        "real.xlsx",
      ),
      f = initialFilters(dataset),
      records = selectRecords(dataset, f);
    const view = buildCollectionView(dataset, records, f, {
      ...initialCollectionQuery,
      bands: [4, 5],
    });
    assert.equal(view.summary.totalOpen, 886089537);
    assert.equal(
      view.summary.totalOpen,
      aging(records, dataset.reference)
        .filter((_, i) => i === 4 || i === 5)
        .reduce((n, b) => n + b.value, 0),
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      Uint8Array.from(await createCollectionExcel(view)).buffer,
    );
    assert.equal(wb.worksheets[1].rowCount, view.rows.length + 2);
    assert.equal(
      Math.round(
        Number(
          wb.worksheets[1].getRow(wb.worksheets[1].rowCount).getCell(12).result,
        ) * 100,
      ),
      886089537,
    );
    assert.equal(dataset.records.length, 5212);
    assert.equal(dataset.issues.length, 11);
  },
);
