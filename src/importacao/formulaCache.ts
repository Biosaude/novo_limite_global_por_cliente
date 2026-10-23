import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { RawCell } from "../domain/types";
const list = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
/** Lê o cache salvo no OOXML: ExcelJS omite alguns resultados zero de fórmulas compartilhadas. */
export function formulaCache(
  buffer: ArrayBuffer,
): Map<string, Map<string, RawCell>> {
  let expanded = 0;
  const entries = unzipSync(new Uint8Array(buffer), {
    filter(file) {
      expanded += file.originalSize;
      if (expanded > 150 * 1024 * 1024)
        throw new Error(
          "O conteúdo descompactado excede 150 MB. Nenhum registro foi removido.",
        );
      return (
        file.name === "xl/workbook.xml" ||
        file.name === "xl/_rels/workbook.xml.rels" ||
        /^xl\/worksheets\/[^/]+\.xml$/.test(file.name)
      );
    },
  });
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  const parse = (path: string) => {
    if (!entries[path]) return null;
    const xml = strFromU8(entries[path]);
    if (/<!DOCTYPE/i.test(xml))
      throw new Error("Declaração XML não suportada no arquivo Excel.");
    return parser.parse(xml);
  };
  const book = parse("xl/workbook.xml");
  const relationships = list<{ "@_Id": string; "@_Target": string }>(
    parse("xl/_rels/workbook.xml.rels")?.Relationships?.Relationship,
  );
  const cache = new Map<string, Map<string, RawCell>>();
  for (const sheet of list<{ "@_name": string; "@_r:id": string }>(
    book?.workbook?.sheets?.sheet,
  )) {
    const target = relationships.find(
      (relation) => relation["@_Id"] === sheet["@_r:id"],
    )?.["@_Target"];
    if (!target) continue;
    const path = target.startsWith("/")
      ? target.slice(1)
      : "xl/" + target.replace(/^\.\//, "");
    const xml = parse(path);
    const cells = new Map<string, RawCell>();
    for (const row of list<{ c?: unknown }>(xml?.worksheet?.sheetData?.row)) {
      for (const cell of list<Record<string, unknown>>(
        row.c as Record<string, unknown>[] | undefined,
      )) {
        if (cell.f === undefined || cell.v === undefined) continue;
        const text = String(cell.v);
        if (text.trim() === "") continue; // Cache vazio não é resultado numérico zero.
        const type = cell["@_t"];
        const value: RawCell =
          type === "str"
            ? text
            : type === "e"
              ? { error: text }
              : type === "b"
                ? text === "1"
                : Number(text);
        if (typeof value === "number" && !Number.isFinite(value)) continue;
        cells.set(String(cell["@_r"]), value);
      }
    }
    cache.set(sheet["@_name"], cells);
  }
  return cache;
}
