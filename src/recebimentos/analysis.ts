import type { Dataset, FinancialRecord } from "../domain/types";
import { daysBetween, validDate } from "../domain/dates";
import { sum } from "../domain/money";
import { enrichCreditRecords } from "../credito/analysis";
import { normalized, cellText, scalar } from "../importacao/mapping";
export const conditions = {
  early: "Antecipado",
  ontime: "Em dia",
  late: "Pós-inadimplência",
  unknown: "Prazo indeterminado",
} as const;
export type Condition = keyof typeof conditions;
export type Legal = "yes" | "no" | "unknown";
export const legalLabels = {
  yes: "Ajuizado",
  no: "Não ajuizado",
  unknown: "Dados indisponíveis",
};
export interface ReceiptRow {
  record: FinancialRecord;
  client: string;
  representative: string;
  document: string;
  installment: string;
  title: string;
  issued: string | null;
  due: string | null;
  received: string | null;
  cents: number | null;
  days: number | null;
  condition: Condition;
  legal: Legal;
  legalSource: string | null;
}
export interface ReceiptFilters {
  year: string;
  month: string;
  quarter: string;
  client: string;
  representative: string;
  condition: string;
  legal: string;
  search: string;
  sort: "received" | "client" | "cents" | "days" | "document";
  ascending: boolean;
}
export const initialReceiptFilters = (
  dataset: Dataset | null,
): ReceiptFilters => ({
  year: dataset?.reference.slice(0, 4) ?? "",
  month: "",
  quarter: "",
  client: "",
  representative: "",
  condition: "",
  legal: "",
  search: "",
  sort: "received",
  ascending: false,
});
const key = (s: string) =>
  s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
/** Somente colunas explícitas de ajuizamento; não usa atraso, observações ou nomes de pacientes. */
export function receiptRows(dataset: Dataset): ReceiptRow[] {
  const sources = new Map(
    dataset.source.sheets.map((sheet) => {
      const mapping = dataset.mappings.find((m) => m.sheet === sheet.name);
      const header =
        sheet.rows.find((r) => r.number === mapping?.header)?.cells ?? [];
      const legalColumns = header
        .map((v, i) =>
          [
            "ajuizado",
            "tituloajuizado",
            "situacaodeajuizamento",
            "situacaoajuizamento",
          ].includes(normalized(cellText(v)))
            ? i
            : -1,
        )
        .filter((i) => i >= 0);
      return [
        sheet.name,
        {
          rows: new Map(sheet.rows.map((r) => [r.number, r.cells])),
          header,
          legalColumns,
        },
      ];
    }),
  );
  return enrichCreditRecords(dataset)
    .filter((r) => r.category === "received")
    .map((record) => {
      const ctx = sources.get(record.sheet);
      const col =
        ctx?.legalColumns.length === 1 ? ctx.legalColumns[0] : undefined;
      const raw =
        col === undefined
          ? undefined
          : scalar(ctx?.rows.get(record.row)?.[col] ?? null);
      const value = normalized(String(raw ?? ""));
      const legal: Legal =
        raw === true || ["sim", "ajuizado", "true", "1"].includes(value)
          ? "yes"
          : raw === false ||
              ["nao", "naoajuizado", "false", "0"].includes(value)
            ? "no"
            : "unknown";
      const received =
        record.received && validDate(record.received) ? record.received : null;
      const due = record.due && validDate(record.due) ? record.due : null;
      const days = received && due ? daysBetween(received, due) : null;
      return {
        record,
        client: record.client || "Sem cliente",
        representative: record.representative || "Sem representante",
        document: record.document ?? "",
        installment: record.installment ?? "",
        title: record.title,
        issued: record.issued ?? null,
        due,
        received,
        cents: record.cents,
        days,
        condition:
          days === null
            ? "unknown"
            : days < 0
              ? "early"
              : days === 0
                ? "ontime"
                : "late",
        legal,
        legalSource:
          col === undefined
            ? null
            : `${record.sheet} · linha ${record.row} · ${cellText(ctx!.header[col])}`,
      } satisfies ReceiptRow;
    });
}
export interface ReceiptSummary {
  total: number;
  count: number;
  titles: number;
  clients: number;
  invalidAmounts: number;
  unknownCount: number;
  negativeCount: number;
  legalTotal: number | null;
  legalKnown: number;
  legalUnknown: number;
}
export function summarize(rows: ReceiptRow[]): ReceiptSummary {
  const known = rows.filter((r) => r.legal !== "unknown");
  return {
    total: sum(rows.map((r) => r.cents ?? 0)),
    count: rows.length,
    titles: new Set(
      rows.map(
        (r) =>
          `${key(r.client)}\0${r.document && r.installment ? r.document + "\0" + r.installment : r.title || r.record.id}`,
      ),
    ).size,
    clients: new Set(rows.map((r) => key(r.client))).size,
    invalidAmounts: rows.filter((r) => r.cents === null).length,
    unknownCount: rows.filter((r) => r.condition === "unknown").length,
    negativeCount: rows.filter((r) => (r.cents ?? 0) < 0).length,
    legalTotal: known.length
      ? sum(rows.filter((r) => r.legal === "yes").map((r) => r.cents ?? 0))
      : null,
    legalKnown: known.length,
    legalUnknown: rows.length - known.length,
  };
}
export function receiptView(
  dataset: Dataset,
  all: ReceiptRow[],
  filters: ReceiptFilters,
) {
  const dated = all.filter(
    (r) => r.received && r.received <= dataset.reference,
  );
  const rows = dated
    .filter(
      (r) =>
        (!filters.year || r.received!.startsWith(filters.year + "-")) &&
        (!filters.month || r.received!.slice(5, 7) === filters.month) &&
        (!filters.quarter ||
          Math.ceil(Number(r.received!.slice(5, 7)) / 3) ===
            Number(filters.quarter)) &&
        (!filters.client || key(r.client) === key(filters.client)) &&
        (!filters.representative ||
          key(r.representative) === key(filters.representative)) &&
        (!filters.condition || r.condition === filters.condition) &&
        (!filters.legal || r.legal === filters.legal) &&
        (!filters.search ||
          key(
            [
              r.client,
              r.representative,
              r.document,
              r.installment,
              r.title,
            ].join(" "),
          ).includes(key(filters.search))),
    )
    .sort((a, b) => {
      const av = a[filters.sort],
        bv = b[filters.sort];
      if (av === null || bv === null)
        return av === bv ? 0 : av === null ? 1 : -1;
      const comparison =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      return (
        (filters.ascending ? comparison : -comparison) ||
        a.record.id.localeCompare(b.record.id)
      );
    });
  const categories = (Object.keys(conditions) as Condition[]).map(
    (condition) => ({
      key: condition,
      name: conditions[condition],
      value: sum(
        rows.filter((r) => r.condition === condition).map((r) => r.cents ?? 0),
      ),
      count: rows.filter((r) => r.condition === condition).length,
    }),
  );
  const periods = (quarter: boolean) =>
    [
      ...new Set(
        rows.map((r) =>
          quarter
            ? `${r.received!.slice(0, 4)} Q${Math.ceil(Number(r.received!.slice(5, 7)) / 3)}`
            : r.received!.slice(0, 7),
        ),
      ),
    ]
      .sort()
      .map((name) => {
        const part = rows.filter(
          (r) =>
            (quarter
              ? `${r.received!.slice(0, 4)} Q${Math.ceil(Number(r.received!.slice(5, 7)) / 3)}`
              : r.received!.slice(0, 7)) === name,
        );
        return {
          name,
          total: sum(part.map((r) => r.cents ?? 0)),
          ...Object.fromEntries(
            (Object.keys(conditions) as Condition[]).map((c) => [
              c,
              sum(
                part.filter((r) => r.condition === c).map((r) => r.cents ?? 0),
              ),
            ]),
          ),
        } as { name: string; total: number } & Record<Condition, number>;
      });
  const groups = (field: "client" | "representative") => {
    const map = new Map<string, { name: string; rows: ReceiptRow[] }>();
    for (const r of rows) {
      const k = key(r[field]);
      const group = map.get(k) ?? { name: r[field], rows: [] };
      group.rows.push(r);
      map.set(k, group);
    }
    return [...map.values()]
      .map((g) => ({ name: g.name, ...summarize(g.rows) }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  };
  return {
    rows,
    summary: summarize(rows),
    categories,
    monthly: periods(false),
    quarterly: periods(true),
    clients: groups("client"),
    representatives: groups("representative"),
    filters: { ...filters },
    filename: dataset.filename,
    reference: dataset.reference,
    excludedDates: all.length - dated.length,
  };
}
export type ReceiptView = ReturnType<typeof receiptView>;
export function receiptFilterLabels(view: ReceiptView): string[][] {
  const f = view.filters;
  return [
    ["Ano", f.year || "Todos"],
    ["Mês", f.month || "Todos"],
    ["Trimestre", f.quarter ? "Q" + f.quarter : "Todos"],
    ["Cliente", f.client || "Todos"],
    ["Representante", f.representative || "Todos"],
    ["Condição", conditions[f.condition as Condition] || "Todas"],
    ["Ajuizamento", legalLabels[f.legal as Legal] || "Todos"],
    ["Pesquisa", f.search || "Sem pesquisa"],
    ["Ordenação", `${{received:"Recebimento",client:"Cliente",cents:"Valor recebido",days:"Dias",document:"Duplicata"}[f.sort]} · ${f.ascending ? "crescente" : "decrescente"}`],
  ];
}
export function quarterVariation(
  current: number,
  previous: number | null,
): number | null {
  return previous === null || previous <= 0
    ? null
    : ((current - previous) / previous) * 100;
}
