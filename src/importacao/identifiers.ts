import type { Dataset } from "../domain/types";
import { scalar, normalized, cellText } from "./mapping";

/** Remove somente preenchimento externo e prefixos de exportação; nunca usa Number em texto. */
export function identifier(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
    throw new Error("Identificador numérico sem precisão segura; exporte a coluna como texto.");
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("Identificador inválido; exporte a coluna como texto.");
  return String(value).replace(/^[\s']+/, "").trim();
}

/** Recupera somente identificadores ausentes de versões locais antigas, sem reescrever saldos. */
export function enrichIdentifiers(dataset: Dataset): Dataset {
  const contexts = new Map(dataset.source.sheets.map(sheet => {
    const map = dataset.mappings.find(m => m.sheet === sheet.name);
    const header = sheet.rows.find(r => r.number === map?.header);
    const find = (field: "clientCode" | "boleto" | "companyCode", names: string[]) => {
      const explicit = map?.fields[field];
      const matches = header?.cells.flatMap((c, i) => names.includes(normalized(cellText(c))) ? [i] : []) ?? [];
      return explicit !== undefined && explicit >= 0 ? explicit : matches.length === 1 ? matches[0] : -1;
    };
    return [sheet.name, { rows: new Map(sheet.rows.map(r => [r.number, r.cells])),
      clientCode: find("clientCode", ["codigo", "codigocliente", "codcliente"]),
      boleto: find("boleto", ["nrboleto", "numeroboleto", "numerodoboleto"]),
      companyCode: find("companyCode", ["codempresa", "codigoempresa", "codigodaempresa", "empresa"]),
    }];
  }));
  return { ...dataset, records: dataset.records.map(record => {
    const ctx = contexts.get(record.sheet), cells = ctx?.rows.get(record.row);
    const read = (field: "clientCode" | "boleto" | "companyCode") => record[field] ?? identifier(scalar(cells?.[ctx?.[field] ?? -1]));
    return { ...record, clientCode: read("clientCode"), boleto: read("boleto"), companyCode: read("companyCode") };
  }) };
}
