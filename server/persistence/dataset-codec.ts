import { createHash } from "node:crypto";
import type { Dataset } from "../../src/domain/types.js";
import { validDate } from "../../src/domain/dates.js";
import { ServerError } from "../errors.js";
const invalid = () =>
  new ServerError(
    "DATASET_INVALID",
    "Estrutura da versão financeira inválida.",
    400,
  );
const text = (v: unknown) => typeof v === "string";
/** Não altera categorias, centavos, datas ou linhas; dados inválidos não viram zero. */
export function validateDataset(value: unknown): Dataset {
  try {
    const d = value as Dataset;
    if (
      !d ||
      d.version !== 1 ||
      !text(d.id) ||
      !d.id ||
      !text(d.filename) ||
      !validDate(d.reference) ||
      !Number.isFinite(Date.parse(d.importedAt)) ||
      (d.updatedAt !== undefined &&
        !Number.isFinite(Date.parse(d.updatedAt))) ||
      !d.source ||
      !Array.isArray(d.source.sheets) ||
      !Array.isArray(d.mappings) ||
      !Array.isArray(d.records) ||
      d.records.length > 100000 ||
      !Array.isArray(d.issues) ||
      !d.reviews ||
      typeof d.reviews !== "object" ||
      Array.isArray(d.reviews)
    )
      throw invalid();
    const ids = new Set<string>();
    let absoluteTotal = 0;
    for (const r of d.records) {
      if (
        !text(r.id) ||
        !r.id ||
        ids.has(r.id) ||
        !["upcoming", "overdue", "received"].includes(r.category) ||
        !text(r.client) ||
        !text(r.title) ||
        !text(r.representative) ||
        !text(r.sheet) ||
        !Number.isSafeInteger(r.row) ||
        r.row < 1 ||
        !(r.cents === null || Number.isSafeInteger(r.cents)) ||
        ![r.due, r.received, r.issued ?? null].every(
          (date) =>
            date === null || (typeof date === "string" && validDate(date)),
        ) ||
        (r.document !== undefined && !text(r.document)) ||
        (r.installment !== undefined && !text(r.installment))
      )
        throw invalid();
      absoluteTotal += Math.abs(r.cents ?? 0);
      if (!Number.isSafeInteger(absoluteTotal)) throw invalid();
      ids.add(r.id);
    }
    for (const issue of d.issues)
      if (
        !text(issue.id) ||
        !text(issue.code) ||
        !text(issue.message) ||
        !["warning", "error"].includes(issue.severity) ||
        !Array.isArray(issue.records) ||
        !issue.records.every(text)
      )
        throw invalid();
    for (const review of Object.values(d.reviews))
      if (
        !review ||
        !text(review.note) ||
        !Number.isFinite(Date.parse(review.reviewedAt))
      )
        throw invalid();
    if (Buffer.byteLength(JSON.stringify(d), "utf8") > 32_000_000)
      throw invalid();
    return structuredClone(d);
  } catch {
    throw invalid();
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  return value;
}
export function financialSnapshot(dataset: Dataset) {
  const { reviews: _, updatedAt: __, ...payload } = dataset;
  const identity = {
    ...payload,
    issues: undefined,
    records: payload.records.map(
      ({ dayCalculation: _, reportedDays: __, ...record }) => record,
    ),
  };
  return {
    payload,
    hash: createHash("sha256")
      .update(JSON.stringify(canonical(identity)))
      .digest("hex"),
  };
}
export function decodeDataset(row: Record<string, unknown>): Dataset {
  const payload =
    typeof row.dataset_payload === "string"
      ? JSON.parse(row.dataset_payload)
      : row.dataset_payload;
  return validateDataset({
    ...(payload as object),
    reviews: row.reviews ?? {},
    ...(row.client_updated_at
      ? { updatedAt: String(row.client_updated_at) }
      : {}),
  });
}
