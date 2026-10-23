import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fixture } from "./fixtures";
import { officialDaysFormulaFixture } from "./days-formula-fixture";
import { readWorkbook } from "../src/importacao/workbook";
import { suggestMappings } from "../src/importacao/mapping";
import { normalize } from "../src/importacao/normalize";
import { createTemplate } from "../src/importacao/template";
import { refreshDayAnalysis } from "../src/importacao/dayAnalysis";
import { audit } from "../src/auditoria/audit";
import { currentDate } from "../src/domain/dates";
import { aging, weightedOverdueAging, totals, selectRecords, initialFilters } from "../src/domain/finance";
import type { RawCell } from "../src/domain/types";
const read = (buffer: Buffer | ArrayBuffer) => readWorkbook(buffer instanceof ArrayBuffer ? buffer : Uint8Array.from(buffer).buffer);
const setup = async () => {
  const source = await read(await fixture());
  const mappings = suggestMappings(source);
  return { source, mappings };
};
const related = (data: ReturnType<typeof normalize>) => data.issues.filter(issue => ['days','invalid_days','invalid_days_formula'].includes(issue.code));

test('A Vencer reconhece TODAY/HOJE, sinal positivo e fórmulas com ou sem cache', async () => {
  const {source,mappings} = await setup();
  const map = mappings[0], row = source.sheets[0].rows[1];
  for(const expression of ['F2-TODAY()', '=F2-HOJE()', ' $F$2 - today() ', '=F2 - HOJE ( )']) {
    for(const result of [undefined, 0, -999, 12345]) {
      row.cells[map.fields.days] = {formula: expression, ...(result === undefined ? {} : {result})};
      const data = normalize(source,mappings,'2026-10-19','teste.xlsx');
      assert.equal(data.records[0].dayCalculation?.days,10);
      assert.equal(data.records[0].dayCalculation?.kind,'formula');
      assert.equal(related(data).filter(i=>i.records.includes(data.records[0].id)).length,0);
      assert.equal(data.records[0].reportedDays, result ?? null);
    }
  }
  row.cells[map.fields.days] = '=F2-HOJE()';
  assert.equal(normalize(source,mappings,'2026-10-19','teste.xlsx').records[0].dayCalculation?.kind,'formula');
});

test('Vencidos reconhece TODAY()/HOJE() menos vencimento sem depender do cache', async () => {
  const {source,mappings} = await setup();
  const map = mappings[1], row = source.sheets[1].rows[1];
  for(const formula of ['TODAY()-F2', '=HOJE()-$F$2', ' today ( ) - F2 ']) {
    row.cells[map.fields.days] = {formula};
    const data = normalize(source,mappings,'2026-10-19','teste.xlsx');
    assert.equal(data.records[1].dayCalculation?.days,10);
    assert.equal(related(data).length,0);
    assert.equal(weightedOverdueAging(data.records,'2026-10-19').days,10);
  }
});

test('números manuais obedecem à convenção da aba e inconsistências continuam auditadas', async () => {
  const {source,mappings} = await setup();
  assert.equal(related(normalize(source,mappings,'2026-10-19','teste.xlsx')).length,0);
  source.sheets[0].rows[1].cells[mappings[0].fields.days] = -10;
  const data = normalize(source,mappings,'2026-10-19','teste.xlsx');
  assert.equal(related(data).length,1);
  assert.equal(related(data)[0].code,'days');
  assert.match(related(data)[0].message,/vencimento − referência/);
});

test('sentido, coluna, linha e expressões arbitrárias incorretas geram alertas mesmo com cache correto', async () => {
  const {source,mappings} = await setup();
  const row = source.sheets[0].rows[1];
  for(const formula of ['TODAY()-F2','E2-TODAY()','F3-TODAY()', 'F2-TODAY()+0', 'IF(TODAY()>D2,TODAY()-F2,0)', 'globalThis.alert(1)', "'Outra aba'!F2-TODAY()",'[externo.xlsx]F2-TODAY()']) {
    row.cells[mappings[0].fields.days] = {formula,result:10};
    const data = normalize(source,mappings,'2026-10-19','teste.xlsx');
    assert.equal(related(data).length,1,formula);
    assert.equal(related(data)[0].code,'invalid_days_formula');
    assert.equal(data.records[0].cents,10010);
  }
});

test('cache numérico vazio no OOXML não vira zero; caches zero verdadeiros são preservados', async () => {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook(), sheet = wb.addWorksheet('Teste');
  sheet.getCell('A1').value = {formula:'1+1'};
  sheet.getCell('A2').value = {formula:'1-1',result:0};
  const source = await read(Buffer.from(await wb.xlsx.writeBuffer()));
  const one = source.sheets[0].rows[0].cells[0] as Record<string,RawCell>;
  const two = source.sheets[0].rows[1].cells[0] as Record<string,RawCell>;
  assert.ok(one.result === undefined || one.result === null);
  assert.equal(two.result,0);
});

test('fórmulas compartilhadas resolvem referências relativas e respeitam travas absolutas', async () => {
  const {source,mappings} = await setup();
  const sheet = source.sheets[0], map = mappings[0];
  const second = {number:3,cells:structuredClone(sheet.rows[1].cells)};
  sheet.rows.push(second);
  sheet.rows[1].cells[map.fields.days] = {formula:'F2-TODAY()',shareType:'shared',ref:'G2:G3'};
  second.cells[map.fields.days] = {sharedFormula:'G2'};
  let data = normalize(source,mappings,'2026-10-19','teste.xlsx');
  assert.equal(related(data).length,0);
  assert.equal(data.records[1].dayCalculation?.formula,'F3-TODAY()');
  assert.equal(data.records[1].dayCalculation?.days,10);
  sheet.rows[1].cells[map.fields.days] = {formula:'$F$2-TODAY()'};
  data = normalize(source,mappings,'2026-10-19','teste.xlsx');
  assert.equal(related(data).length,1);
  assert.match(related(data)[0].message,/Referência de célula incorreta/);
  second.cells[map.fields.days] = {sharedFormula:'G999'};
  assert.match(related(normalize(source,mappings,'2026-10-19','teste.xlsx'))[0].message,/origem verificável/);
});

test('datas inválidas mantêm auditoria legítima e não produzem alertas falsos de cache', async () => {
  const {source,mappings} = await setup();
  source.sheets[0].rows[1].cells[mappings[0].fields.days] = {formula:'F2-TODAY()'};
  source.sheets[0].rows[1].cells[mappings[0].fields.due] = '31/02/2026';
  const data = normalize(source,mappings,'2026-10-19','teste.xlsx');
  assert.ok(data.issues.some(i=>i.code==='missing_due'));
  assert.equal(related(data).length,0);
  assert.equal(data.records[0].dayCalculation?.days,null);
});

test('posição histórica não usa o relógio; data brasileira respeita a virada do dia', async () => {
  assert.equal(currentDate(new Date('2026-10-24T01:00:00Z')),'2026-10-23');
  const {source,mappings} = await setup();
  source.sheets[0].rows[1].cells[mappings[0].fields.days] = {formula:'F2-TODAY()',result:-999};
  const historical = normalize(source,mappings,'2026-10-19','teste.xlsx');
  assert.equal(historical.records[0].dayCalculation?.days,10);
  const current = normalize(source,mappings,'2026-10-23','teste.xlsx');
  assert.equal(current.records[0].dayCalculation?.days,6);
  assert.equal(refreshDayAnalysis(historical).records[0].dayCalculation?.days,10);
  assert.equal(historical.reference,'2026-10-19');
  assert.deepEqual(totals(historical.records),totals(current.records));
});

test('vencimento hoje não é atraso; divergências preservam saldo e categoria', async () => {
  const {source,mappings} = await setup();
  for(const [index, formula] of ['F2-TODAY()','TODAY()-F2'].entries())
    source.sheets[index].rows[1].cells[mappings[index].fields.days]={formula};
  const due = source.sheets[0].rows[1].cells[mappings[0].fields.due];
  source.sheets[1].rows[1].cells[mappings[1].fields.due]=due;
  const today=normalize(source,mappings,'2026-10-29','teste.xlsx');
  assert.equal(today.records[0].dayCalculation?.days,0);
  assert.equal(today.records[1].dayCalculation?.days,0);
  assert.equal(today.issues.filter(i=>i.code==='category_date').length,1);
  assert.equal(aging(today.records,'2026-10-29')[0].value,5020);
  const yesterday=normalize(source,mappings,'2026-10-30','teste.xlsx');
  assert.equal(yesterday.records[0].dayCalculation?.days,-1);
  assert.equal(yesterday.records[1].dayCalculation?.days,1);
  const tomorrow=normalize(source,mappings,'2026-10-28','teste.xlsx');
  assert.equal(tomorrow.records[0].dayCalculation?.days,1);
  assert.deepEqual(totals(today.records),totals(yesterday.records));
  assert.deepEqual(today.records.map(r=>r.category),yesterday.records.map(r=>r.category));
});

test('faixas e média ponderada usam vencimento e referência e ignoram caches desatualizados', async () => {
  const {source,mappings}=await setup(), sheet=source.sheets[1], map=mappings[1];
  sheet.rows=sheet.rows.slice(0,1);
  for(const [i,days] of [1,30,31,60,61,90,91,180,181].entries()) {
    const cells=structuredClone(source.sheets[0].rows[1].cells);
    cells[map.fields.due]=new Date(Date.parse('2026-10-23')-days*86400000).toISOString();
    cells[map.fields.days]={formula:`TODAY()-F${i+2}`,result:999};
    cells[map.fields.amount]=(i+1);
    sheet.rows.push({number:i+2,cells});
  }
  const data=normalize(source,mappings,'2026-10-23','teste.xlsx');
  assert.equal(related(data).filter(i=>i.records.some(id=>id.startsWith(sheet.name+':'))).length,0);
  assert.deepEqual(aging(data.records,'2026-10-23').slice(1,6).map(b=>b.value),[300,700,1100,1500,900]);
  const expected=[1,30,31,60,61,90,91,180,181].reduce((n,day,i)=>n+(i+1)*day,0)/45;
  assert.equal(weightedOverdueAging(data.records,'2026-10-23').days,expected);
});

test('modelo baixável inclui fórmulas oficiais sem registros fictícios e preserva auditoria de linhas incompletas', async () => {
  const source=await read(await createTemplate()), mappings=suggestMappings(source);
  assert.equal((source.sheets[0].rows[1].cells[5] as any).formula,'E2-TODAY()');
  assert.equal((source.sheets[1].rows[1].cells[5] as any).formula,'TODAY()-E2');
  assert.throws(()=>normalize(source,mappings,'2026-10-23','modelo.xlsx'),/não contém registros/);
  source.sheets[0].rows[1].cells[0]='Linha incompleta';
  const base=await setup();
  source.sheets[1]=base.source.sheets[1];source.sheets[2]=base.source.sheets[2];
  const data=normalize(source,suggestMappings(source),'2026-10-23','modelo.xlsx');
  assert.ok(data.issues.some(i=>i.code==='invalid_amount'));
  assert.ok(data.issues.some(i=>i.code==='missing_due'));
});

test('integridade de dias recalculados é auditada; finanças e informações obrigatórias continuam protegidas', async () => {
  const {source,mappings}=await setup();
  source.sheets[0].rows[1].cells[mappings[0].fields.days]={formula:'F2-TODAY()'};
  const data=normalize(source,mappings,'2026-10-19','teste.xlsx');
  data.records[0].dayCalculation!.days=999;
  assert.ok(audit(data.records,data.reference).some(i=>i.code==='days'));
  source.sheets[0].rows[1].cells[mappings[0].fields.amount]='inválido';
  source.sheets[0].rows[1].cells[mappings[0].fields.client]='';
  source.sheets[0].rows[1].cells[mappings[0].fields.representative]='';
  const invalid=normalize(source,mappings,'2026-10-19','teste.xlsx');
  for(const code of ['invalid_amount','missing_client','missing_representative']) assert.ok(invalid.issues.some(i=>i.code===code));
  assert.ok(data.issues.some(i=>i.code==='overlap'));
});

test('base local antiga é reavaliada sem mudar identidade, referência, originais ou valores', async () => {
  const {source,mappings}=await setup();
  source.sheets[0].rows[1].cells[mappings[0].fields.days]={formula:'F2-TODAY()',result:-999};
  const data=normalize(source,mappings,'2026-10-19','teste.xlsx');
  delete data.records[0].dayCalculation;
  data.issues.push({id:'antigo',code:'days',severity:'warning',records:[data.records[0].id],message:'comparação antiga'});
  data.reviews['antigo']={note:'Nota preservada',reviewedAt:'2026-10-19T12:00:00Z'};
  const before=structuredClone(data), updated=refreshDayAnalysis(data);
  assert.deepEqual(data,before);
  assert.equal(updated.id,before.id);assert.equal(updated.importedAt,before.importedAt);assert.equal(updated.reference,before.reference);
  assert.deepEqual(updated.source,before.source);assert.deepEqual(updated.reviews,before.reviews);
  assert.deepEqual(totals(updated.records),totals(before.records));
  assert.equal(related(updated).length,0);
  assert.equal(updated.records[0].dayCalculation?.days,10);
});

test('arquivo oficial: cópia com novas fórmulas sem cache elimina alertas de dias e concilia valores independentemente', {skip:!process.env.BIOSAUDE_TEST_WORKBOOK}, async () => {
  const buffer=await readFile(process.env.BIOSAUDE_TEST_WORKBOOK!);
  const original=await read(buffer), updated=await read(officialDaysFormulaFixture(buffer));
  const previous=normalize(original,suggestMappings(original),'2026-10-19','original.xlsx');
  const data=normalize(updated,suggestMappings(updated),'2026-10-19','copia-teste-novas-formulas.xlsx');
  assert.equal(data.records.length,5099);assert.equal(previous.issues.length,2354);
  assert.equal(previous.issues.filter(i=>i.code==='invalid_days_formula').length,2348);
  assert.equal(related(data).length,0);
  assert.equal(data.issues.length,6);
  assert.equal(data.issues.filter(i=>i.code==='category_date').length,5);
  assert.equal(data.issues.filter(i=>i.code==='overlap').length,1);
  assert.deepEqual(totals(data.records),totals(previous.records));
  assert.deepEqual(aging(data.records,data.reference),aging(previous.records,previous.reference));
  const independent=JSON.parse(execFileSync('python',['scripts/validate_aging_reference.py',process.env.BIOSAUDE_TEST_WORKBOOK!],{encoding:'utf8'})).all;
  const summary=totals(selectRecords(data,initialFilters(data)));
  for(const key of ['upcoming','overdue','received','exposure'] as const) assert.equal(summary[key],independent[key]);
  assert.equal(weightedOverdueAging(data.records,data.reference).days,Number(independent.agingDays));
  assert.equal(data.records.filter(r=>r.dayCalculation?.kind==='formula').length,2348);
});

test('nova planilha real de 23/10/2026: 5.212 registros, 11 fórmulas com +1 auditadas e finanças conciliadas', {skip:!process.env.BIOSAUDE_UPDATED_WORKBOOK}, async () => {
  const path=process.env.BIOSAUDE_UPDATED_WORKBOOK!;
  const source=await read(await readFile(path));
  const data=normalize(source,suggestMappings(source),'2026-10-23','Modelo_Base_Limite_Global_Biosaude.xlsx');
  const independent=JSON.parse(execFileSync('python',['scripts/validate_aging_reference.py',path,'2026-10-23'],{encoding:'utf8'})).all;
  assert.equal(data.records.length,5212);
  assert.deepEqual(source.sheets.map(s=>s.rows.length-1),[1632,793,2787]);
  assert.equal(data.issues.length,11);
  assert.ok(data.issues.every(issue=>issue.code==='invalid_days_formula'&&issue.severity==='warning'));
  assert.deepEqual(data.issues.map(i=>data.records.find(r=>r.id===i.records[0])!.row),Array.from({length:11},(_,i)=>i+2));
  assert.equal(data.records.filter(r=>r.dayCalculation?.kind==='formula').length,2414);
  const rows=selectRecords(data,initialFilters(data)),summary=totals(rows);
  assert.deepEqual(summary,{upcoming:2495083248,overdue:1110573972,exposure:3605657220,received:5790201798,global:9395859018,count:5212});
  for(const key of ['upcoming','overdue','received','exposure'] as const) assert.equal(summary[key],independent[key]);
  assert.deepEqual(aging(rows,data.reference).map(b=>b.value),independent.bands);
  assert.equal(weightedOverdueAging(rows,data.reference).days,Number(independent.agingDays));
  assert.equal(weightedOverdueAging(rows,data.reference).excludedCount,0);
  assert.equal(weightedOverdueAging(rows,data.reference).eligibleCount,793);
  for(const record of data.records.filter(r=>r.category!=='received')) {
    const original=source.sheets.find(s=>s.name===record.sheet)!.rows.find(row=>row.number===record.row)!;
    const expression=original.cells[5] as Record<string,RawCell>;
    assert.ok(expression.formula || expression.sharedFormula);
    if(record.row<=12 && record.category==='upcoming') assert.equal(record.dayCalculation!.kind,'invalid-formula');
    assert.equal(record.dayCalculation!.reference,'2026-10-23');
  }
});
