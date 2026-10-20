import ExcelJS from "exceljs";
import { formulaCache } from "./formulaCache";
import type { RawCell, SourceWorkbook } from "../domain/types";
export function rawCell(value: unknown): RawCell {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (Array.isArray(value)) return value.map(rawCell);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rawCell(entry)]),
    );
  return String(value);
}
export async function readWorkbook(
  buffer: ArrayBuffer,
): Promise<SourceWorkbook> {
  let cache: ReturnType<typeof formulaCache>;
  try {
    cache = formulaCache(buffer);
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.includes("excede")
        ? error.message
        : "Não foi possível ler o Excel. Envie um arquivo .xlsx válido, sem senha e não corrompido.",
    );
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error(
      "Não foi possível ler o Excel. Envie um arquivo .xlsx válido, sem senha e não corrompido.",
    );
  }
  let cells = 0;
  const sheets = workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > 100001 || sheet.columnCount > 256)
      throw new Error(
        "A planilha excede o limite de 100.000 linhas ou 256 colunas por aba. Nenhuma linha foi removida.",
      );
    const rows = [];
    for (let number = 1; number <= sheet.rowCount; number++) {
      const row = sheet.getRow(number);
      const values: RawCell[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) {
        const cell = row.getCell(col);
        let original = rawCell(cell.value);
        const saved = cache.get(sheet.name)?.get(cell.address);
        if (
          saved !== undefined &&
          original &&
          typeof original === "object" &&
          !Array.isArray(original) &&
          ("formula" in original || "sharedFormula" in original) &&
          (original.result === undefined || original.result === null)
        )
          original = { ...original, result: saved };
        values.push(original);
      }
      rows.push({ number, cells: values });
    }
    cells += sheet.rowCount * sheet.columnCount;
    if (cells > 2000000)
      throw new Error(
        "O arquivo excede 2 milhões de células. Nenhum registro foi descartado; divida a extração na origem.",
      );
    return { name: sheet.name, columns: sheet.columnCount, rows };
  });
  if (!sheets.length || !sheets.some((sheet) => sheet.rows.length > 1))
    throw new Error("O arquivo não contém abas com registros financeiros.");
  return { sheets, date1904: !!workbook.properties.date1904 };
}
