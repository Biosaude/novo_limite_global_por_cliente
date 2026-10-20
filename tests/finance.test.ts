import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixtures";
import { readWorkbook } from "../src/importacao/workbook";
import { suggestMappings } from "../src/importacao/mapping";
import { normalize } from "../src/importacao/normalize";
import {
  initialFilters,
  totals,
  selectRecords,
  groupBy,
  monthly,
  aging,
} from "../src/domain/finance";
import { cents, sum } from "../src/domain/money";
import { dateValue, daysBetween } from "../src/domain/dates";
const parse = async (buffer: Buffer) =>
  readWorkbook(Uint8Array.from(buffer).buffer);
const dataset = async (variant: Parameters<typeof fixture>[0] = "normal") => {
  const source = await parse(await fixture(variant));
  return normalize(source, suggestMappings(source), "2026-10-19", "teste.xlsx");
};

test("centavos exatos, formatos brasileiros e valores inválidos", () => {
  assert.equal(sum([cents(0.1), cents(0.2)]), 30);
  assert.equal(cents("R$ 1.234.567,89"), 123456789);
  assert.equal(cents("(12,34)"), -1234);
  for (const value of [
    "",
    null,
    "R$ abc",
    "1,234",
    "1.000.000",
    1.234,
    Infinity,
  ])
    assert.throws(() => cents(value));
  assert.throws(() => sum([Number.MAX_SAFE_INTEGER, 1]));
});
test("datas brasileiras, ano bissexto e diferença sem fuso horário", () => {
  assert.equal(dateValue("19/10/2026"), "2026-10-19");
  assert.equal(dateValue("31/02/2026"), null);
  assert.equal(dateValue("29/02/2024"), "2024-02-29");
  assert.equal(dateValue("29/02/2026"), null);
  assert.equal(daysBetween("2026-10-19", "2026-10-29"), -10);
});
test("Excel: preserva registros e originais; não usa nominal; YTD respeita início e fim", async () => {
  const data = await dataset();
  assert.equal(data.records.length, 6);
  const selected = selectRecords(data, initialFilters(data));
  assert.deepEqual(totals(selected), {
    upcoming: 10010,
    overdue: 5020,
    received: 5070,
    global: 20100,
    count: 4,
  });
  assert.equal(data.source.sheets[0].rows[1].cells[3], 9999);
  assert.equal(
    data.issues.filter((issue) => issue.code === "overlap").length,
    1,
  );
  assert.equal(
    data.issues.filter((issue) => issue.severity === "error").length,
    0,
  );
});
test("filtros e agrupamentos conciliam com total e não refazem o saldo histórico", async () => {
  const data = await dataset();
  const filters = initialFilters(data);
  const rows = selectRecords(data, filters);
  assert.equal(
    sum(groupBy(rows, "client").map((group) => group.global)),
    totals(rows).global,
  );
  assert.equal(
    sum(groupBy(rows, "representative").map((group) => group.global)),
    totals(rows).global,
  );
  assert.equal(
    totals(selectRecords(data, { ...filters, client: "Cliente Teste B" }))
      .global,
    3030,
  );
  assert.equal(
    totals(selectRecords(data, { ...filters, category: "overdue" })).global,
    5020,
  );
  assert.equal(
    selectRecords(data, { ...filters, representative: "Outro" }).length,
    0,
  );
  const september = totals(selectRecords(data, { ...filters, month: "09" }));
  assert.equal(september.received, 3030);
  assert.equal(september.upcoming, 10010);
  assert.equal(
    totals(selectRecords(data, { ...filters, year: "2025", month: "12" }))
      .received,
    70000,
  );
  assert.equal(sum(monthly(rows).map((item) => item.value)), 5070);
  assert.equal(
    sum(aging(rows, data.reference).map((item) => item.value)),
    5020,
  );
});
test("valor inválido é erro bloqueante; registros permanecem na conferência", async () => {
  const data = await dataset("invalid");
  assert.equal(data.records.length, 6);
  assert.equal(
    data.issues.filter((issue) => issue.code === "invalid_amount").length,
    1,
  );
  assert.equal(data.records[0].cents, null);
});
test("representante ausente gera advertência e grupo preservado", async () => {
  const data = await dataset("missing-rep");
  assert.ok(
    data.issues.some((issue) => issue.code === "missing_representative"),
  );
  assert.ok(
    groupBy(selectRecords(data, initialFilters(data)), "representative").some(
      (group) => group.name === "Sem representante",
    ),
  );
});
test("arquivo ilegível é rejeitado", async () => {
  await assert.rejects(
    () => parse(Buffer.from("não é Excel")),
    /Não foi possível ler/,
  );
});
test("datas ausentes de recebimento bloqueiam e vencimento ausente apenas adverte", async () => {
  const source = await parse(await fixture());
  const maps = suggestMappings(source);
  source.sheets[2].rows[1].cells[5] = null;
  source.sheets[0].rows[1].cells[5] = null;
  const data = normalize(source, maps, "2026-10-19", "teste.xlsx");
  assert.ok(
    data.issues.some(
      (issue) =>
        issue.code === "invalid_receipt_date" && issue.severity === "error",
    ),
  );
  assert.ok(
    data.issues.some(
      (issue) => issue.code === "missing_due" && issue.severity === "warning",
    ),
  );
});
test("cabeçalhos reordenados são identificados e não dependem de posição", async () => {
  const source = await parse(await fixture());
  for (const sheet of source.sheets)
    for (const row of sheet.rows) row.cells.reverse();
  const data = normalize(
    source,
    suggestMappings(source),
    "2026-10-19",
    "teste.xlsx",
  );
  assert.equal(totals(selectRecords(data, initialFilters(data))).global, 20100);
});
test("aba não reconhecida e coluna de valor não mapeada não são ignoradas", async () => {
  const source = await parse(await fixture());
  source.sheets[0].name = "Desconhecida";
  assert.throws(
    () =>
      normalize(source, suggestMappings(source), "2026-10-19", "teste.xlsx"),
    /Defina a categoria/,
  );
  const maps = suggestMappings(source);
  maps[0].category = "upcoming";
  maps[0].fields.amount = -1;
  assert.throws(
    () => normalize(source, maps, "2026-10-19", "teste.xlsx"),
    /Selecione a coluna/,
  );
});
test("fórmula sem cache bloqueia valores e fórmula com cache gera advertência", async () => {
  const source = await parse(await fixture());
  source.sheets[0].rows[1].cells[4] = { formula: "1+1" };
  const maps = suggestMappings(source);
  assert.ok(
    normalize(source, maps, "2026-10-19", "teste.xlsx").issues.some(
      (issue) => issue.code === "invalid_amount",
    ),
  );
  source.sheets[0].rows[1].cells[4] = { formula: "1+1", result: 2 };
  const valid = normalize(source, maps, "2026-10-19", "teste.xlsx");
  assert.equal(valid.records[0].cents, 200);
  assert.ok(valid.issues.some((issue) => issue.code === "formula"));
});
test(
  "planilha oficial: conciliação histórica, 5.099 registros, auditoria e título conferido",
  { skip: !process.env.BIOSAUDE_TEST_WORKBOOK },
  async () => {
    const source = await parse(
      await readFile(process.env.BIOSAUDE_TEST_WORKBOOK!),
    );
    const data = normalize(
      source,
      suggestMappings(source),
      "2026-10-19",
      "planilha-oficial.xlsx",
    );
    assert.equal(data.records.length, 5099);
    assert.deepEqual(
      data.source.sheets.map((sheet) => sheet.rows.length - 1),
      [1583, 765, 2751],
    );
    assert.deepEqual(totals(selectRecords(data, initialFilters(data))), {
      upcoming: 2571124724,
      overdue: 1057501521,
      received: 5699981930,
      global: 9328608175,
      count: 5099,
    });
    assert.equal(
      data.issues.filter((issue) => issue.severity === "error").length,
      0,
    );
    assert.equal(
      data.issues.filter((issue) => issue.severity === "warning").length,
      2354,
    );
    assert.equal(
      data.issues.filter((issue) => issue.code === "days").length,
      2348,
    );
    assert.equal(
      data.issues.filter((issue) => issue.code === "category_date").length,
      5,
    );
    const checked = data.records.filter(
      (record) => record.title === "87848/01",
    );
    assert.deepEqual(checked.map((record) => record.category).sort(), [
      "received",
      "upcoming",
    ]);
    assert.equal(
      data.issues.filter((issue) => issue.code === "overlap").length,
      1,
    );
    const rows = selectRecords(data, initialFilters(data));
    for (const field of ["client", "representative"] as const)
      assert.equal(
        sum(groupBy(rows, field).map((group) => group.global)),
        9328608175,
      );
    assert.equal(sum(monthly(rows).map((point) => point.value)), 5699981930);
    assert.equal(
      sum(aging(rows, data.reference).map((point) => point.value)),
      1057501521,
    );
  },
);

test("cache de fórmula compartilhada igual a zero é preservado do OOXML", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Fórmulas & valores");
  sheet.getCell("A1").value = {
    formula: "1-1",
    result: 0,
    shareType: "shared",
    ref: "A1:A2",
  };
  sheet.getCell("A2").value = { sharedFormula: "A1", result: 0 };
  const source = await parse(Buffer.from(await wb.xlsx.writeBuffer()));
  for (const row of source.sheets[0].rows) {
    const cell = row.cells[0];
    assert.ok(cell && typeof cell === "object" && !Array.isArray(cell));
    assert.equal(cell.result, 0);
  }
});

test("modelo Excel vazio conserva o esquema oficial e aceita preenchimento pelo importador", async () => {
  const { createTemplate } = await import("../src/importacao/template");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await createTemplate());
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    [
      "CONSOLIDADO - A VENCER (VA529)",
      "CONSOLIDADO - VENCIDO (VA529)",
      "CONSOLIDADO - RECEBIDO (VA527)",
    ],
  );
  for (const [index, sheet] of workbook.worksheets.entries()) {
    assert.equal(
      sheet.actualRowCount,
      1,
      "modelo não deve conter registros simulados",
    );
    const values = sheet.getRow(1).values as unknown[];
    const row = Array(sheet.columnCount).fill(null);
    const put = (header: string, value: unknown) => {
      const position = values.findIndex((item) => item === header);
      assert.ok(position > 0);
      row[position - 1] = value;
    };
    put("Nome cliente", "CLIENTE DE TESTE — MODELO");
    put("Nome representante", "REPRESENTANTE DE TESTE");
    put("Numero do titulo completo", `MODELO-${index}/01`);
    put("Vr.duplicata", 9999);
    put(index === 2 ? "Vr.recebido" : "Vr.aberto", [1.01, 2.02, 3.03][index]);
    put(
      "Dt.vencimento",
      new Date(index === 0 ? "2026-10-29T00:00:00Z" : "2026-10-09T00:00:00Z"),
    );
    if (index === 2) put("Dt.recebimento", new Date("2026-10-10T00:00:00Z"));
    sheet.addRow(row);
  }
  const source = await parse(Buffer.from(await workbook.xlsx.writeBuffer()));
  const data = normalize(
    source,
    suggestMappings(source),
    "2026-10-19",
    "modelo-preenchido-teste.xlsx",
  );
  assert.equal(
    data.issues.filter((issue) => issue.severity === "error").length,
    0,
  );
  assert.deepEqual(totals(selectRecords(data, initialFilters(data))), {
    upcoming: 101,
    overdue: 202,
    received: 303,
    global: 606,
    count: 3,
  });
});
