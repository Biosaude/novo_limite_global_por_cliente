import type { Category, Mapping, RawCell, SourceRow, SourceSheet } from "../domain/types.js";

type Reference = { column: number; row: number; absoluteColumn: boolean; absoluteRow: boolean };
type Parsed = { reference: Reference; category: "upcoming" | "overdue" };
export type DaysFormula =
  | { kind: "none" }
  | { kind: "valid"; expression: string }
  | { kind: "invalid"; reason: string };
const object = (value: RawCell | undefined) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;
function address(text: string): Reference | null {
  const match = /^(\$?)([A-Z]{1,3})(\$?)([1-9]\d{0,6})$/.exec(text);
  if (!match) return null;
  let column = 0;
  for (const char of match[2]) column = column * 26 + char.charCodeAt(0) - 64;
  const row = Number(match[4]);
  return column <= 16384 && row <= 1048576
    ? { column, row, absoluteColumn: !!match[1], absoluteRow: !!match[3] }
    : null;
}
function parse(expression: string): Parsed | null {
  const text = expression.trim().replace(/^=/, "").replace(/\s+/g, "").toUpperCase();
  const upcoming = /^(\$?[A-Z]{1,3}\$?[1-9]\d{0,6})-(?:TODAY|HOJE)\(\)$/.exec(text);
  const overdue = /^(?:TODAY|HOJE)\(\)-(\$?[A-Z]{1,3}\$?[1-9]\d{0,6})$/.exec(text);
  const match = upcoming ?? overdue;
  const reference = match && address(match[1]);
  return reference ? { reference, category: upcoming ? "upcoming" : "overdue" } : null;
}
function columnName(column: number): string {
  let name = "";
  while (column > 0) {
    column--;
    name = String.fromCharCode(65 + column % 26) + name;
    column = Math.floor(column / 26);
  }
  return name;
}
/** Reconhecimento restrito de subtrações de data. Nunca executa fórmulas Excel. */
export function recognizeDaysFormula(
  cell: RawCell | undefined, sheet: SourceSheet, map: Mapping, row: number,
): DaysFormula {
  const value = object(cell);
  const isTextFormula = typeof cell === "string" && (/^\s*=/.test(cell) || /(?:TODAY|HOJE)\s*\(/i.test(cell));
  if (!isTextFormula && !(value && ("formula" in value || "sharedFormula" in value))) return { kind: "none" };
  let expression: unknown = isTextFormula ? cell : value?.formula;
  let offsetRow = 0, offsetColumn = 0;
  if (value && "sharedFormula" in value) {
    const anchor = typeof value.sharedFormula === "string" ? address(value.sharedFormula.toUpperCase()) : null;
    if (!anchor) return { kind: "invalid", reason: "Origem da fórmula compartilhada inválida." };
    const master = object(sheet.rows.find(entry => entry.number === anchor.row)?.cells[anchor.column - 1]);
    if (!master || "sharedFormula" in master || typeof master.formula !== "string")
      return { kind: "invalid", reason: "Fórmula compartilhada sem expressão de origem verificável." };
    expression = master.formula;
    offsetRow = row - anchor.row;
    offsetColumn = map.fields.days + 1 - anchor.column;
  }
  const parsed = typeof expression === "string" ? parse(expression) : null;
  if (!parsed) return { kind: "invalid", reason: "Fórmula incompatível. Esperado vencimento − HOJE() em A Vencer ou HOJE() − vencimento em Vencidos." };
  if (parsed.category !== map.category)
    return { kind: "invalid", reason: "Sentido da subtração incompatível com a regra da aba." };
  const ref = parsed.reference;
  const resolvedRow = ref.row + (ref.absoluteRow ? 0 : offsetRow);
  const resolvedColumn = ref.column + (ref.absoluteColumn ? 0 : offsetColumn);
  if (resolvedRow !== row || resolvedColumn !== map.fields.due + 1)
    return { kind: "invalid", reason: "Referência de célula incorreta: use o vencimento mapeado na mesma linha do registro." };
  const target = `${columnName(resolvedColumn)}${resolvedRow}`;
  return { kind: "valid", expression: map.category === "upcoming" ? `${target}-TODAY()` : `TODAY()-${target}` };
}
/** O modelo tem uma célula de orientação F2, sem cliente/valor/datas: não é um registro. */
export function isDaysFormulaGuide(row: SourceRow, sheet: SourceSheet, map: Mapping): boolean {
  return row.cells.every((cell, index) => index === map.fields.days || cell == null || cell === "") &&
    recognizeDaysFormula(row.cells[map.fields.days], sheet, map, row.number).kind === "valid";
}
export function calculatedDays(category: Category, due: string | null, reference: string): number | null {
  if (!due || category === "received") return null;
  const difference = Math.round((Date.parse(due) - Date.parse(reference)) / 86400000);
  return Number.isFinite(difference) ? difference === 0 ? 0 : category === "upcoming" ? difference : -difference : null;
}
