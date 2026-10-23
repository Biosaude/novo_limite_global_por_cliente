import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { receiptsFixture } from "./receipts-fixture";
import { readWorkbook } from "../src/importacao/workbook";
import { suggestMappings } from "../src/importacao/mapping";
import { normalize } from "../src/importacao/normalize";
import {
  receiptRows,
  receiptView,
  initialReceiptFilters,
  quarterVariation,
} from "../src/recebimentos/analysis";
import {
  createReceiptsExcel,
  createReceiptsPdf,
} from "../src/recebimentos/reports";
const parse = async (buffer: Buffer, ref = "2026-10-23") => {
  const source = await readWorkbook(Uint8Array.from(buffer).buffer);
  return normalize(source, suggestMappings(source), ref, "base.xlsx");
};
test("recebimentos: categorias exclusivas, centavos, pagamentos parciais e ajuizamento complementar", async () => {
  const d = await parse(await receiptsFixture());
  const original = JSON.stringify(d);
  const rows = receiptRows(d),
    v = receiptView(d, rows, initialReceiptFilters(d));
  assert.equal(v.summary.total, 110000);
  assert.equal(v.summary.count, 6);
  assert.equal(v.summary.titles, 4);
  assert.deepEqual(
    v.categories.map((c) => c.value),
    [20000, 20000, 70000, 0],
  );
  assert.equal(v.summary.legalTotal, 60000);
  assert.equal(v.summary.legalUnknown, 1);
  assert.equal(v.summary.legalKnown, 5);
  assert.equal(
    v.monthly.reduce((s, p) => s + p.total, 0),
    110000,
  );
  assert.equal(
    v.quarterly.reduce((s, p) => s + p.total, 0),
    110000,
  );
  assert.equal(JSON.stringify(d), original);
  assert.equal(rows[0].days, -10);
  assert.equal(rows[1].days, 0);
  assert.equal(rows[2].days, 5);
});
test("recebimentos: filtros combinados por data efetiva, trimestre, mês, condição e cliente", async () => {
  const d = await parse(await receiptsFixture()),
    r = receiptRows(d),
    f = initialReceiptFilters(d);
  assert.equal(
    receiptView(d, r, {
      ...f,
      quarter: "4",
      month: "10",
      client: "Cliente Sintético A",
      representative: "Rep X",
      condition: "early",
      legal: "yes",
      search: "P1",
    }).summary.total,
    10000,
  );
  assert.equal(
    receiptView(d, r, { ...f, quarter: "1", month: "10" }).summary.count,
    0,
  );
  assert.equal(receiptView(d, r, { ...f, quarter: "1" }).summary.total, 30000);
  assert.equal(
    receiptView(d, r, { ...f, sort: "cents", ascending: true }).rows[0].cents,
    5000,
  );
  assert.equal(
    receiptView(d, r, { ...f, condition: "late" }).summary.total,
    70000,
  );
  assert.equal(quarterVariation(10, 0), null);
  assert.equal(quarterVariation(20, -10), null);
  assert.equal(quarterVariation(200, 100), 100);
});
test("recebimentos: ausência e ambiguidade de ajuizamento não viram zero; atraso não presume ação", async () => {
  const d = await parse(await receiptsFixture());
  const s = d.source.sheets[2];
  s.rows[0].cells[s.rows[0].cells.length - 1] = "Observações";
  let r = receiptRows(d);
  assert.ok(r.every((r) => r.legal === "unknown"));
  assert.equal(
    receiptView(d, r, initialReceiptFilters(d)).summary.legalTotal,
    null,
  );
  s.rows[0].cells.push("Ajuizado", "Título ajuizado");
  r = receiptRows(d);
  assert.ok(r.every((r) => r.legal === "unknown"));
});
test("recebimentos: datas inválidas, negativos e valores ausentes são preservados e sinalizados", async () => {
  const d = await parse(await receiptsFixture());
  const rows = d.records.filter((r) => r.category === "received");
  rows[0].due = null;
  rows[1].received = null;
  rows[2].received = "2026-11-01";
  rows[3].cents = -100;
  rows[4].cents = null;
  const v = receiptView(d, receiptRows(d), initialReceiptFilters(d));
  assert.equal(v.excludedDates, 2);
  assert.equal(v.summary.unknownCount, 1);
  assert.equal(v.summary.negativeCount, 1);
  assert.equal(v.summary.invalidAmounts, 1);
  assert.equal(v.summary.total, 14900);
  await assert.rejects(createReceiptsExcel(v), /válida/);
});
test("recebimentos: Excel contém todas as seções, valores efetivos, origem e nenhum paciente", async () => {
  const d = await parse(await receiptsFixture()),
    v = receiptView(d, receiptRows(d), initialReceiptFilters(d));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Uint8Array.from(await createReceiptsExcel(v)).buffer);
  assert.equal(wb.worksheets.length, 8);
  const details = wb.getWorksheet("Duplicatas Recebidas")!;
  assert.equal(details.rowCount, 7);
  let total = 0;
  details.eachRow((row, i) => {
    if (i > 1) total += Math.round(Number(row.getCell(10).value) * 100);
  });
  assert.equal(total, v.summary.total);
  assert.ok(!JSON.stringify(wb.model).includes("PACIENTE-NAO-EXPORTAR"));
  const row = details.getRows(2, 6)!.find((r) => r.getCell(3).value === "P4")!;
  assert.equal(row.getCell(10).value, 400);
  assert.equal(
    row.getCell(13).value,
    "CONSOLIDADO - RECEBIDO (VA527) · linha 5 · Título ajuizado",
  );
});
test("recebimentos: PDF local suporta acentos, categorias e valores sem dados de pacientes", async () => {
  const d = await parse(await receiptsFixture()),
    v = receiptView(d, receiptRows(d), initialReceiptFilters(d)),
    font = (await readFile("src/relatorios/assets/DejaVuSans.ttf")).toString(
      "base64",
    );
  const pdf = await createReceiptsPdf(v, font);
  const text = execFileSync("pdftotext", ["-", "-"], { input: pdf }).toString();
  assert.match(text, /Análise de Recebimentos/);
  assert.match(text, /Pós-inadimplência/);
  assert.match(text, /1\.100,00/);
  assert.ok(!text.includes("PACIENTE-NAO-EXPORTAR"));
  assert.match(text, /Resumo por Representante/);
});
for (const [env, ref] of [
  ["BIOSAUDE_TEST_WORKBOOK", "2026-10-19"],
  ["BIOSAUDE_UPDATED_WORKBOOK", "2026-10-23"],
])
  test(
    `recebimentos oficiais: leitura independente ${ref}`,
    { skip: !process.env[env] },
    async () => {
      const path = process.env[env]!,
        d = await parse(await readFile(path), ref),
        v = receiptView(d, receiptRows(d), initialReceiptFilters(d));
      const independent = JSON.parse(
        execFileSync("python", [
          "scripts/validate_receipts_reference.py",
          path,
          ref,
        ]).toString(),
      );
      assert.equal(v.summary.total, independent.total);
      assert.equal(v.summary.count, independent.count);
      assert.equal(v.excludedDates, independent.excluded);
      for (const c of v.categories) {
        assert.equal(c.value, independent.amounts[c.key] ?? 0);
        assert.equal(c.count, independent.counts[c.key] ?? 0);
      }
      assert.deepEqual(
        Object.fromEntries(v.monthly.map((p) => [p.name, p.total])),
        independent.monthly,
      );
      assert.deepEqual(
        Object.fromEntries(v.quarterly.map((p) => [p.name, p.total])),
        independent.quarterly,
      );
      for (const [groups, expected] of [
        [v.clients, independent.clients],
        [v.representatives, independent.representatives],
      ] as const) {
        assert.deepEqual(
          Object.fromEntries(
            groups.map((g) => [
              createHash("sha256")
                .update(
                  g.name
                    .normalize("NFC")
                    .trim()
                    .replace(/\s+/g, " ")
                    .toUpperCase(),
                )
                .digest("hex"),
              g.total,
            ]),
          ),
          expected,
        );
      }
      assert.equal(v.summary.legalTotal, null);
      assert.equal(v.summary.legalKnown, 0);
    },
  );
