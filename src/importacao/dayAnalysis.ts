import type { Dataset, DayCalculation, Issue, Mapping, SourceRow, SourceSheet } from "../domain/types";
import { scalar } from "./mapping";
import { calculatedDays, recognizeDaysFormula } from "./daysFormula";
import { audit } from "../auditoria/audit";
export function analyzeDayCell(sheet: SourceSheet, map: Mapping, row: SourceRow, due: string | null, reference: string) {
  const cell = row.cells[map.fields.days];
  const original = scalar(cell);
  const reportedDays = original !== null && String(original).trim() !== "" && Number.isInteger(Number(original)) && typeof original !== "boolean"
    ? Number(original) : null;
  const formula = recognizeDaysFormula(cell, sheet, map, row.number);
  const issues: Issue[] = [];
  const id = `${sheet.name}:${row.number}`;
  let kind: DayCalculation["kind"] = "empty";
  if (formula.kind === "invalid") {
    kind = "invalid-formula";
    issues.push({ id: `${id}:invalid_days_formula`, code: "invalid_days_formula", severity: "warning", records: [id],
      message: `${formula.reason} Linha ${row.number}, aba ${sheet.name}. Dias recalculados a partir do vencimento na referência ${reference}; expressão e cache originais preservados.` });
  } else if (formula.kind === "valid") kind = "formula";
  else if (original !== null && String(original).trim() !== "") {
    kind = reportedDays === null ? "invalid-value" : "numeric";
    if (kind === "invalid-value") issues.push({ id: `${id}:invalid_days`, code: "invalid_days", severity: "warning", records: [id],
      message: "Quantidade de dias inválida; dias calculados com vencimento e referência da posição." });
  }
  const dayCalculation: DayCalculation = { kind, formula: formula.kind === "valid" ? formula.expression : null,
    reference, days: calculatedDays(map.category || "received", due, reference) };
  return { reportedDays, dayCalculation, issues };
}
/** Reavalia somente os dias de bases locais antigas; sem migração, escrita ou mudança financeira. */
export function refreshDayAnalysis(dataset: Dataset): Dataset {
  const touched = new Set<string>();
  const newIssues: Issue[] = [];
  const sheets = new Map(dataset.source.sheets.map(sheet => [sheet.name, sheet]));
  const maps = new Map(dataset.mappings.map(map => [map.sheet, map]));
  const rowMaps = new Map(dataset.source.sheets.map(sheet => [sheet.name, new Map(sheet.rows.map(row => [row.number, row]))]));
  const records = dataset.records.map(record => {
    if (record.category === "received") return record;
    const sheet = sheets.get(record.sheet), map = maps.get(record.sheet), row = rowMaps.get(record.sheet)?.get(record.row);
    if (!sheet || !map || !row) return record;
    const analysis = analyzeDayCell(sheet, map, row, record.due, dataset.reference);
    touched.add(record.id);
    newIssues.push(...analysis.issues);
    return { ...record, reportedDays: analysis.reportedDays, dayCalculation: analysis.dayCalculation };
  });
  return { ...dataset, records, issues: [
    ...dataset.issues.filter(issue => !["days", "invalid_days", "invalid_days_formula"].includes(issue.code) || !issue.records.length || !issue.records.every(id => touched.has(id))),
    ...newIssues,
    ...audit(records.filter(record => touched.has(record.id)), dataset.reference).filter(issue => issue.code === "days"),
  ] };
}
