import { normalize } from "../../src/importacao/normalize";
import {
  fieldLabels,
  type Dataset,
  type Mapping,
  type RawCell,
  type SourceWorkbook,
} from "../../src/domain/types";
import { validDate } from "../../src/domain/dates";
import { validateDataset } from "../persistence/dataset-codec";
import { ServerError } from "../errors";
export const badInput = () =>
  new ServerError("INVALID_INPUT", "Entrada inválida.", 400);
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw badInput();
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((k) => !keys.includes(k))) throw badInput();
}
export function versionId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw badInput();
  return value;
}
/** Reutiliza o normalizador financeiro; nunca confia em saldos/categorias já calculados pelo cliente. */
export function normalizeImport(value: unknown): Dataset {
  try {
    const input = object(value);
    exact(input, ["source", "mappings", "reference", "filename", "confirm"]);
    if (
      typeof input.reference !== "string" ||
      !validDate(input.reference) ||
      typeof input.filename !== "string" ||
      !input.filename.trim() ||
      input.filename.length > 200
    )
      throw badInput();
    const source = object(input.source);
    exact(source, ["sheets", "date1904"]);
    if (
      typeof source.date1904 !== "boolean" ||
      !Array.isArray(source.sheets) ||
      source.sheets.length < 1 ||
      source.sheets.length > 20 ||
      !Array.isArray(input.mappings)
    )
      throw badInput();
    const names = new Set<string>();
    let cells = 0;
    function cell(value: unknown, depth = 0): value is RawCell {
      if (++cells > 250000 || depth > 8) throw badInput();
      if (value === null || typeof value === "boolean") return true;
      if (typeof value === "string") return value.length <= 20000;
      if (typeof value === "number") return Number.isFinite(value);
      if (Array.isArray(value)) return value.every((v) => cell(v, depth + 1));
      if (value && typeof value === "object")
        return Object.entries(value).every(
          ([k, v]) =>
            !["__proto__", "constructor", "prototype"].includes(k) &&
            cell(v, depth + 1),
        );
      return false;
    }
    for (const entry of source.sheets) {
      const sheet = object(entry);
      exact(sheet, ["name", "rows", "columns"]);
      if (
        typeof sheet.name !== "string" ||
        !sheet.name.trim() ||
        sheet.name.length > 200 ||
        names.has(sheet.name) ||
        !Number.isSafeInteger(sheet.columns) ||
        Number(sheet.columns) < 1 ||
        Number(sheet.columns) > 500 ||
        !Array.isArray(sheet.rows) ||
        sheet.rows.length > 100001
      )
        throw badInput();
      names.add(sheet.name);
      const numbers = new Set<number>();
      for (const item of sheet.rows) {
        const row = object(item);
        exact(row, ["number", "cells"]);
        if (
          !Number.isSafeInteger(row.number) ||
          Number(row.number) < 1 ||
          numbers.has(Number(row.number)) ||
          !Array.isArray(row.cells) ||
          row.cells.length > Number(sheet.columns) ||
          !row.cells.every((v) => cell(v))
        )
          throw badInput();
        numbers.add(Number(row.number));
      }
    }
    if (input.mappings.length !== names.size) throw badInput();
    const mapped = new Set<string>();
    for (const entry of input.mappings) {
      const m = object(entry),
        fields = object(m.fields);
      exact(m, ["sheet", "category", "header", "fields"]);
      if (
        typeof m.sheet !== "string" ||
        !names.has(m.sheet) ||
        mapped.has(m.sheet) ||
        !["upcoming", "overdue", "received"].includes(String(m.category)) ||
        !Number.isSafeInteger(m.header) ||
        Number(m.header) < 1
      )
        throw badInput();
      mapped.add(m.sheet);
      exact(fields, Object.keys(fieldLabels));
      if (
        !Object.keys(fieldLabels).every(
          (k) =>
            Number.isSafeInteger(fields[k]) &&
            Number(fields[k]) >= -1 &&
            Number(fields[k]) < 500,
        )
      )
        throw badInput();
    }
    const dataset = validateDataset(
      normalize(
        source as unknown as SourceWorkbook,
        input.mappings as Mapping[],
        input.reference,
        input.filename,
      ),
    );
    if (Buffer.byteLength(JSON.stringify(dataset), "utf8") > 3_000_000)
      throw new ServerError("PAYLOAD_TOO_LARGE", "Carga excede o limite.", 413);
    return dataset;
  } catch (error) {
    if (error instanceof ServerError && error.code === "PAYLOAD_TOO_LARGE") throw error;
    throw badInput();
  }
}
export function reviewInput(value: unknown): {
  versionId: string;
  reviews: Dataset["reviews"];
} {
  const input = object(value);
  exact(input, ["versionId", "reviews"]);
  const entries = Object.entries(object(input.reviews));
  if (entries.length > 10000) throw badInput();
  const reviewedAt = new Date().toISOString();
  const reviews = Object.fromEntries(
    entries.map(([key, value]) => {
      if (
        !key.trim() ||
        key.length > 300 ||
        ["__proto__", "constructor", "prototype"].includes(key) ||
        typeof value !== "string" ||
        !value.trim() ||
        value.length > 4000
      )
        throw badInput();
      return [key, { note: value, reviewedAt }];
    }),
  );
  return { versionId: versionId(input.versionId), reviews };
}
