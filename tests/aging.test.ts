import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Decimal from "decimal.js";
import type { FinancialRecord } from "../src/domain/types";
import { aging, weightedOverdueAging, totals, initialFilters, selectRecords } from "../src/domain/finance";
import { readWorkbook } from "../src/importacao/workbook";
import { suggestMappings } from "../src/importacao/mapping";
import { normalize } from "../src/importacao/normalize";
const ref = "2026-10-19";
const record = (cents: number | null, due: string | null, category: FinancialRecord['category'] = 'overdue'): FinancialRecord => ({
  id: `${cents}-${due}`, sheet: 'Teste', row: 2, category, client: 'Teste', title: 'T/01', representative: 'R', cents, due, received: null, reportedDays: 999,
});

test('exposição exclui recebido; aging pondera saldos e ignora dias informados', () => {
  const rows = [record(1000000, '2026-09-19'), record(3000000, '2026-07-21'), record(9999999, null, 'received'), record(500000, '2026-11-01', 'upcoming')];
  assert.equal(totals(rows).exposure, 4500000);
  assert.equal(weightedOverdueAging(rows, ref).days, 75);
  assert.notEqual(weightedOverdueAging(rows, ref).days, 60);
  const result = weightedOverdueAging([record(1, '2026-10-18'), record(2, '2026-10-17')], ref);
  assert.ok(Math.abs(result.days! - 5/3) < 1e-12);
});

test('faixas preservam fronteiras inclusivas; no dia-base não é vencido', () => {
  const offsets = [0, 1, 30, 31, 60, 61, 90, 91, 180, 181, -1];
  const rows = offsets.map(n => record(100, new Date(Date.parse(ref) - n * 86400000).toISOString().slice(0,10)));
  rows.push(record(100, null));
  assert.deepEqual(aging(rows, ref).map(b => b.value), [200,200,200,200,200,100,100]);
  assert.equal(weightedOverdueAging(rows, ref).excludedCount, 3);
  assert.equal(weightedOverdueAging(rows, ref).days, null);
  assert.equal(weightedOverdueAging([record(100, '2024-02-28')], '2024-03-01').days, 2);
});

test('ausência de dívida, negativos, data inválida e zero não publicam média enganosa', () => {
  for (const rows of [[], [record(0, null)], [record(100,null)], [record(-100,'2026-01-01')], [record(null,'2026-01-01')], [record(100,'inválida')], [record(100,ref)]]) {
    assert.equal(weightedOverdueAging(rows, ref).days, null);
  }
  const rows = [record(Number.MAX_SAFE_INTEGER - 1, '2026-01-01'), record(1, '2026-10-18')];
  const expected = new Decimal(Number.MAX_SAFE_INTEGER-1).times(291).plus(1).div(Number.MAX_SAFE_INTEGER).toNumber();
  assert.equal(weightedOverdueAging(rows, ref).days, expected);
});

test('agrupamentos recalculam a ponderação global; lançamentos parciais não são eliminados', () => {
  const a = [record(100, '2026-10-09'), record(300, '2026-10-09')];
  const b = [record(1000, '2026-07-11')];
  assert.equal(weightedOverdueAging(a, ref).days, 10);
  assert.equal(weightedOverdueAging(b, ref).days, 100);
  assert.equal(weightedOverdueAging([...a,...b], ref).days, 104000/1400);
  assert.equal(weightedOverdueAging(a, ref).eligibleCount, 2);
  assert.equal(totals(a).overdue,400);
});

test('planilha oficial: comparação independente dos KPIs/aging por cliente e representante', {skip: !process.env.BIOSAUDE_TEST_WORKBOOK}, async () => {
  const path = process.env.BIOSAUDE_TEST_WORKBOOK!;
  const independent = JSON.parse(execFileSync('python', ['scripts/validate_aging_reference.py',path], {encoding:'utf8',maxBuffer:8*1024*1024}));
  const source = await readWorkbook(Uint8Array.from(await readFile(path)).buffer);
  const data = normalize(source, suggestMappings(source), ref, 'oficial.xlsx');
  assert.equal(data.records.length,5099);
  const filters = initialFilters(data);
  const compare = (rows: FinancialRecord[], expected: any) => {
    const summary = totals(rows);
    for(const key of ['upcoming','overdue','received','exposure'] as const) assert.equal(summary[key],expected[key]);
    assert.deepEqual(aging(rows,ref).map(b=>b.value), expected.bands);
    const weighted = weightedOverdueAging(rows,ref);
    assert.equal(weighted.eligibleCount, expected.eligibleCount);
    assert.equal(weighted.excludedCount, expected.excludedCount);
    if(expected.agingDays === null) assert.equal(weighted.days,null);
    else assert.ok(Math.abs(weighted.days! - Number(expected.agingDays))<1e-10);
    assert.equal(aging(rows,ref).reduce((n,b)=>n+b.value,0),summary.overdue);
    if(summary.exposure) {
      assert.ok(Math.abs(summary.upcoming/summary.exposure - Number(expected.upcomingRatio))<1e-12);
      assert.ok(Math.abs(summary.overdue/summary.exposure - Number(expected.overdueRatio))<1e-12);
    }
  };
  compare(selectRecords(data,filters), independent.all);
  assert.equal(independent.all.eligibleCount,765);
  assert.equal(independent.all.excludedCount,0);
  assert.equal(independent.all.exposure,3628626245);
  for(const field of ['client','representative'] as const) {
    const names = new Set(data.records.map(r=>r[field] || (field==='client'?'Sem cliente':'Sem representante')));
    for(const name of names) {
      const key = field+':'+createHash('sha256').update(name).digest('hex');
      compare(selectRecords(data,{...filters,[field]:name}),independent[key]);
    }
  }
  const september = selectRecords(data,{...filters,month:'09'});
  assert.equal(totals(september).exposure,independent.all.exposure);
  assert.equal(weightedOverdueAging(september,ref).days,weightedOverdueAging(data.records,ref).days);
  for(const category of ['upcoming','overdue','received']) {
    const rows = selectRecords(data,{...filters,category});
    assert.equal(rows.every(r=>r.category === category),true);
    if(category!=='overdue') assert.equal(weightedOverdueAging(rows,ref).days,null);
  }
});
