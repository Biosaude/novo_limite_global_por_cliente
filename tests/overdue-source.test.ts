import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixtures";
import { readWorkbook } from "../src/importacao/workbook";
import { suggestMappings } from "../src/importacao/mapping";
import { normalize } from "../src/importacao/normalize";
import { aging, initialFilters, selectRecords, totals, weightedOverdueAging } from "../src/domain/finance";
import { sum } from "../src/domain/money";
import type { FinancialRecord } from "../src/domain/types";

test("saldo aberto zero preserva título vencido e nunca usa valor nominal como dívida", async () => {
  const source = await readWorkbook(Uint8Array.from(await fixture()).buffer);
  const mappings = suggestMappings(source);
  const mapping = mappings.find(m => m.category === "overdue")!;
  const sheet = source.sheets.find(s => s.name === mapping.sheet)!;
  sheet.rows[1].cells[mapping.fields.amount] = 0;
  const original = structuredClone(source);
  const data = normalize(source, mappings, "2026-10-19", "sintetico.xlsx");
  const selected = selectRecords(data, initialFilters(data));
  assert.deepEqual(source, original);
  assert.equal(data.records.filter(r => r.category === "overdue").length, 1);
  assert.equal(data.issues.filter(i => i.severity === "error").length, 0);
  assert.equal(totals(selected).overdue, 0);
  assert.equal(totals(selected).exposure, totals(selected).upcoming);
  assert.equal(totals(selected).received, 5070);
  assert.equal(sum(aging(selected, data.reference).map(b => b.value)), 0);
  assert.equal(weightedOverdueAging(selected, data.reference).days, null);
});

test("base do incidente: conciliação independente, zeros, categorias, faixas e filtros", {
  skip: !process.env.BIOSAUDE_INCIDENT_WORKBOOK,
}, async () => {
  const path = process.env.BIOSAUDE_INCIDENT_WORKBOOK!;
  // Referência informada pelo responsável e compatível com os caches da extração.
  const reference = "2026-11-04";
  const independent = JSON.parse(execFileSync("python", [
    "scripts/validate_aging_reference.py", path, reference,
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
  const source = await readWorkbook(Uint8Array.from(await readFile(path)).buffer);
  const mappings = suggestMappings(source);
  const original = structuredClone(source);
  const data = normalize(source, mappings, reference, "base-incidente.xlsx");
  assert.deepEqual(source, original);
  assert.equal(data.records.length, 7489);
  assert.equal(data.issues.filter(i => i.severity === "error").length, 0);
  assert.deepEqual(mappings.map(m => [m.category, m.fields.amount]), [
    ["upcoming", 13], ["overdue", 13], ["received", 14],
  ]);
  for (const record of data.records) {
    const mapping = mappings.find(m => m.sheet === record.sheet)!;
    const sheet = source.sheets.find(s => s.name === record.sheet)!;
    const row = sheet.rows.find(r => r.number === record.row)!;
    assert.equal(record.category, mapping.category);
    const raw = row.cells[mapping.fields.amount];
    assert.equal(typeof raw, "number");
    assert.equal(record.cents, Math.round(Number(raw) * 100));
  }
  const overdue = data.records.filter(r => r.category === "overdue");
  assert.equal(overdue.length, 869);
  assert.ok(overdue.every(r => r.cents === 0));
  const filters = initialFilters(data);
  function compare(rows: FinancialRecord[], expected: typeof independent.all) {
    const result = totals(rows);
    for (const key of ["upcoming", "overdue", "received", "exposure"] as const)
      assert.equal(result[key], expected[key]);
    assert.equal(result.exposure, sum([result.upcoming, result.overdue]));
    const bands = aging(rows, reference);
    assert.deepEqual(bands.map(b => b.value), expected.bands);
    assert.equal(sum(bands.slice(1, 6).map(b => b.value)), result.overdue);
    assert.equal(weightedOverdueAging(rows, reference).days, null);
  }
  compare(selectRecords(data, filters), independent.all);
  assert.deepEqual(totals(selectRecords(data, filters)), {
    upcoming: 2590393368, overdue: 0, received: 8793775347,
    exposure: 2590393368, global: 11384168715, count: 7489,
  });
  for (const field of ["client", "representative"] as const) {
    const names = new Set(data.records.map(r => r[field] || (field === "client" ? "Sem cliente" : "Sem representante")));
    let count = 0;
    for (const name of names) {
      const rows = selectRecords(data, { ...filters, [field]: name });
      compare(rows, independent[field + ":" + createHash("sha256").update(name).digest("hex")]);
      count += rows.length;
    }
    assert.equal(count, 7489);
  }
  for (const year of ["2025", "2026", "2027"])
    for (const month of ["01", "06", "10", "11", "12"]) {
      const rows = selectRecords(data, { ...filters, year, month });
      assert.equal(rows.filter(r => r.category === "overdue").length, 869);
      assert.equal(rows.filter(r => r.category === "upcoming").length, 1632);
      assert.equal(totals(rows).exposure, 2590393368);
    }
  for (const category of ["upcoming", "overdue", "received"] as const) {
    const rows = selectRecords(data, { ...filters, category });
    assert.ok(rows.every(r => r.category === category));
    assert.equal(rows.length, { upcoming: 1632, overdue: 869, received: 4988 }[category]);
  }
});
