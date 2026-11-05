import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readWorkbook } from "../src/importacao/workbook";
import { normalize } from "../src/importacao/normalize";
import { suggestMappings } from "../src/importacao/mapping";
import { enrichIdentifiers, identifier } from "../src/importacao/identifiers";
import { clientIdentity, clientOptions } from "../src/domain/clients";
import { groupBy, initialFilters, selectRecords, totals } from "../src/domain/finance";
import { collectionRows, selectCollectionRows, initialCollectionQuery, collectionSummary, buildCollectionView } from "../src/cobranca/query";
import { receiptRows, receiptView, initialReceiptFilters } from "../src/recebimentos/analysis";
import { analyzeCredit } from "../src/credito/analysis";
import { proposedConfig } from "../src/credito/policy";
import { systemWorkbookFixture } from "./system-workbook-fixture";
import { createTemplate } from "../src/importacao/template";
import { createCollectionExcel } from "../src/relatorios/excel";
import { createReceiptsExcel } from "../src/recebimentos/reports";
import { validateDataset, decodeDataset } from "../server/persistence/dataset-codec";
import ExcelJS from "exceljs";

async function parse(buffer: Buffer) {
  const source = await readWorkbook(Uint8Array.from(buffer).buffer);
  return normalize(source, suggestMappings(source), "2026-11-04", "sintetico.xlsx");
}
test("identificadores preservam zeros e dígitos longos e removem apenas prefixos de exportação", () => {
  assert.equal(identifier("  ' 00012345678901234567890  "), "00012345678901234567890");
  for (const value of [null, "", "  ", "'      "]) assert.equal(identifier(value), "");
  assert.equal(identifier("' AB'12-003 "), "AB'12-003");
  assert.equal(identifier(0), "0");
  assert.throws(() => identifier(12345678901234567890), /precisão/);
});
test("três abas: consolidação por código/empresa, homônimos separados, pesquisas e KPIs intactos", async () => {
  const d = await parse(await systemWorkbookFixture());
  const original = JSON.stringify(d);
  assert.ok(d.mappings.every(m => m.header === 2 && m.fields.clientCode === 0 && m.fields.boleto === 39 && m.fields.representative === 31));
  assert.equal(d.records.length, 12);
  assert.equal(d.issues.filter(i => i.severity === "error").length, 0);
  assert.equal(d.records[0].boleto, "00012345678901234567890");
  assert.equal(d.records[1].boleto, "");
  assert.equal(clientOptions(d.records).length, 3);
  const f = initialFilters(d), selected = selectRecords(d, f), before = totals(selected);
  assert.deepEqual([before.overdue, before.upcoming, before.received, before.exposure], [4600, 4600, 8600, 9200]);
  const identity = clientIdentity(d.records[0]);
  const rows = selectRecords(d, { ...f, client: identity });
  assert.equal(rows.length, 6);
  assert.equal(totals(rows).exposure, 4200);
  assert.equal(groupBy(selected, "client").length, 3);
  const collection = collectionRows(d, selected);
  assert.equal(collectionSummary(collection, d.reference).clientCount, 3);
  assert.equal(selectCollectionRows(collection, d.reference, { ...initialCollectionQuery, documentSearch: "00012345678901234567890" }).length, 2);
  assert.equal(selectCollectionRows(collection, d.reference, { ...initialCollectionQuery, clientSearch: "001" }).length, 6);
  const receipts = receiptRows(d), view = receiptView(d, receipts, { ...initialReceiptFilters(d), client: identity });
  assert.equal(view.summary.count, 2); assert.equal(view.summary.total, 4100);
  assert.equal(receiptView(d, receipts, { ...initialReceiptFilters(d), search: "00012345678901234567890" }).summary.count, 1);
  assert.equal(analyzeCredit(d, f, proposedConfig).length, 3);
  assert.equal(analyzeCredit(d, { ...f, client: identity }, proposedConfig).length, 1);
  const legacy = structuredClone(d);
  for (const r of legacy.records) { delete r.clientCode; delete r.boleto; delete r.companyCode; }
  const restored = enrichIdentifiers(legacy);
  assert.deepEqual(restored.records, d.records);
  assert.equal(JSON.stringify(d), original);
  const invalidSource = structuredClone(d.source);
  invalidSource.sheets[0].rows[2].cells[0] = "";
  const invalid = normalize(invalidSource, suggestMappings(invalidSource), d.reference, "sintetico.xlsx");
  assert.equal(invalid.records.length, 12);
  assert.ok(invalid.issues.some(i => i.code === "missing_client_code" && i.severity === "error"));
});
test("original do sistema: conciliação independente de todas as linhas e modelo com 41 colunas", {
  skip: !process.env.BIOSAUDE_SYSTEM_WORKBOOK,
}, async () => {
  const path = process.env.BIOSAUDE_SYSTEM_WORKBOOK!;
  const independent = JSON.parse(execFileSync("python", ["scripts/validate_system_reference.py", path], { maxBuffer: 8 * 1024 * 1024 }).toString());
  const d = await parse(await readFile(path));
  assert.equal(d.records.length, 7442);
  assert.equal(d.issues.filter(i => i.severity === "error").length, 0);
  for (const [index, r] of d.records.entries()) {
    const hash = createHash("sha256").update(JSON.stringify([r.clientCode, r.boleto])).digest("hex");
    assert.deepEqual([r.sheet, r.row, hash, r.cents], independent.records[index]);
  }
  assert.equal(d.records.filter(r => !r.boleto).length, 5948);
  assert.equal(clientOptions(d.records).length, 249);
  assert.equal(groupBy(d.records, "client").length, 249);
  assert.deepEqual(totals(selectRecords(d, initialFilters(d))), {
    upcoming: 2526750675, overdue: 1120583068, received: 8793775347,
    exposure: 3647333743, global: 12441109090, count: 7442,
  });
  for (const option of clientOptions(d.records)) {
    const rows = selectRecords(d, { ...initialFilters(d), client: option.value });
    const hash = createHash("sha256").update(rows[0].clientCode!).digest("hex");
    const result = totals(rows), expected = independent.groups[hash];
    assert.equal(result.upcoming, expected["A VENCER"] ?? 0);
    assert.equal(result.overdue, expected.VENCIDO ?? 0);
    assert.equal(result.received, expected.RECEBIDO ?? 0);
  }
  const template = await readWorkbook(await createTemplate());
  for (const sheet of template.sheets) {
    assert.equal(sheet.columns, 41);
    assert.deepEqual(sheet.rows[1].cells, independent.headers[sheet.name]);
    assert.equal(sheet.rows.length, 2);
  }
});
test("identificadores no payload e nas exportações Excel mantêm texto e zeros", async () => {
  const d = await parse(await systemWorkbookFixture());
  assert.deepEqual(decodeDataset({ dataset_payload: validateDataset(d), reviews: {} }).records, d.records);
  const collection = buildCollectionView(d, selectRecords(d, initialFilters(d)), initialFilters(d), initialCollectionQuery);
  const receipts = receiptView(d, receiptRows(d), initialReceiptFilters(d));
  for (const [bytes, name, codeColumn, boletoColumn] of [
    [await createCollectionExcel(collection), "Duplicatas Detalhadas", 19, 20],
    [await createReceiptsExcel(receipts), "Duplicatas Recebidas", 15, 16],
  ] as const) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
    const sheet = workbook.getWorksheet(name)!;
    assert.equal(sheet.getColumn(codeColumn).numFmt, "@");
    assert.equal(sheet.getColumn(boletoColumn).numFmt, "@");
    const rows = sheet.getRows(2, sheet.rowCount - 1)!;
    assert.ok(rows.some(r => r.getCell(codeColumn).value === "001"));
    assert.ok(rows.some(r => r.getCell(boletoColumn).value === "00012345678901234567890"));
    assert.ok(rows.some(r => r.getCell(boletoColumn).value === "Boleto não informado"));
  }
});
