import type {
  Dataset,
  Filters,
  FinancialRecord,
  RawCell,
} from "../domain/types";
import { aging, weightedOverdueAging } from "../domain/finance";
import {
  agingBandIndex,
  agingBandNames,
  type AgingBandIndex,
} from "../domain/agingBands";
import { daysBetween, dateValue } from "../domain/dates";
import { cents, sum } from "../domain/money";
import { cellText, normalized, scalar } from "../importacao/mapping";
export interface CollectionRow {
  record: FinancialRecord;
  client: string;
  representative: string;
  document: string;
  installment: string;
  title: string;
  issued: string | null;
  due: string | null;
  days: number | null;
  band: string;
  nominalCents: number | null;
  discountCents: number | null;
  openCents: number | null;
  hospital: string;
  healthPlan: string;
  observations: string;
}
export type CollectionSort =
  "due" | "openCents" | "days" | "client" | "document";
export interface CollectionQuery {
  bands: AgingBandIndex[];
  clientSearch: string;
  documentSearch: string;
  sort: CollectionSort;
  ascending: boolean;
}
export const initialCollectionQuery: CollectionQuery = {
  bands: [],
  clientSearch: "",
  documentSearch: "",
  sort: "due",
  ascending: true,
};
const matchKey = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
const titleKey = (row: CollectionRow) =>
  `${matchKey(row.client)}\u0000${row.document ? row.document + "\u0000" + row.installment : row.title || row.record.id}`;
export function collectionRows(
  dataset: Dataset,
  records: FinancialRecord[],
): CollectionRow[] {
  const context = new Map(
    dataset.source.sheets.map((sheet) => {
      const mapping = dataset.mappings.find((m) => m.sheet === sheet.name);
      const header =
        sheet.rows.find((row) => row.number === mapping?.header)?.cells ?? [];
      const indices = new Map(
        header.map((cell, index) => [normalized(cellText(cell)), index]),
      );
      return [
        sheet.name,
        {
          rows: new Map(sheet.rows.map((row) => [row.number, row])),
          mapping,
          indices,
        },
      ];
    }),
  );
  return records
    .filter((record) => record.category !== "received")
    .map((record) => {
      const ctx = context.get(record.sheet),
        cells = ctx?.rows.get(record.row)?.cells ?? [];
      const get = (...names: string[]): RawCell | undefined => {
        for (const name of names) {
          const index = ctx?.indices.get(normalized(name));
          if (index !== undefined) return cells[index];
        }
        return undefined;
      };
      const notes: string[] = [];
      const amount = (label: string, value: RawCell | undefined) => {
        const original = scalar(value);
        if (original === null || original === "") return null;
        try {
          return cents(original);
        } catch {
          notes.push(`${label} inválido na origem`);
          return null;
        }
      };
      const due = record.due,
        days = due ? Math.max(0, daysBetween(dataset.reference, due)) : null;
      const divergent =
        due &&
        ((record.category === "upcoming" && (days ?? 0) > 0) ||
          (record.category === "overdue" &&
            daysBetween(dataset.reference, due) <= 0));
      if (divergent)
        notes.push(
          "Categoria divergente da data; classificação original preservada",
        );
      if (!due) notes.push("Vencimento não informado ou inválido");
      return {
        record,
        client: record.client || "Sem cliente",
        representative: record.representative || "Sem representante",
        document: record.document || cellText(get("Duplicata")),
        installment: record.installment || cellText(get("Parcela")),
        title: record.title,
        issued:
          record.issued ??
          dateValue(scalar(get("Dt.emissao")), dataset.source.date1904),
        due,
        days,
        band:
          record.category === "overdue"
            ? agingBandNames[agingBandIndex(record, dataset.reference)]
            : divergent
              ? "A Vencer — categoria divergente"
              : "A Vencer",
        nominalCents: amount("Valor nominal", get("Vr.duplicata")),
        discountCents: amount("Desconto", get("Vr.desconto")),
        openCents: record.cents,
        hospital: cellText(get("Nome hospital")),
        healthPlan: cellText(get("Descricao do plano de saude")),
        observations: notes.join("; "),
      };
    });
}
export function selectCollectionRows(
  rows: CollectionRow[],
  reference: string,
  query: CollectionQuery,
): CollectionRow[] {
  return rows
    .filter(
      (row) =>
        (!query.bands.length ||
          (row.record.category === "overdue" &&
            query.bands.includes(
              agingBandIndex(row.record, reference) as AgingBandIndex,
            ))) &&
        (!query.clientSearch ||
          matchKey(row.client).includes(matchKey(query.clientSearch))) &&
        (!query.documentSearch ||
          matchKey(row.document + " " + row.title).includes(
            matchKey(query.documentSearch),
          )),
    )
    .sort((a, b) => {
      const key = query.sort,
        av = a[key],
        bv = b[key];
      if (av === null && bv !== null) return 1;
      if (bv === null && av !== null) return -1;
      const comparison =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", {
              numeric: true,
            });
      return (
        (query.ascending ? comparison : -comparison) ||
        a.record.id.localeCompare(b.record.id)
      );
    });
}
export function collectionSummary(rows: CollectionRow[], reference: string) {
  const records = rows.map((row) => row.record),
    weighted = weightedOverdueAging(records, reference);
  return {
    recordCount: rows.length,
    titleCount: new Set(rows.map(titleKey)).size,
    clientCount: new Set(rows.map((row) => matchKey(row.client))).size,
    totalOpen: sum(rows.map((row) => row.openCents ?? 0)),
    totalOverdue: sum(
      rows
        .filter((row) => row.record.category === "overdue")
        .map((row) => row.openCents ?? 0),
    ),
    agingDays: weighted.days,
    excludedAgingCount: weighted.excludedCount,
    maxDelay: rows.reduce(
      (maximum, row) =>
        row.record.category === "overdue"
          ? Math.max(maximum, row.days ?? 0)
          : maximum,
      0,
    ),
    invalidAmounts: rows.filter((row) => row.openCents === null).length,
  };
}
export function collectionGroups(
  rows: CollectionRow[],
  reference: string,
  field: "client" | "representative",
) {
  const groups = new Map<string, CollectionRow[]>();
  for (const row of rows) {
    const key = matchKey(row[field]);
    const entries = groups.get(key) ?? [];
    entries.push(row);
    groups.set(key, entries);
  }
  return [...groups.values()]
    .map((entries) => ({
      name: entries[0][field],
      ...collectionSummary(entries, reference),
    }))
    .sort(
      (a, b) =>
        b.totalOpen - a.totalOpen || a.name.localeCompare(b.name, "pt-BR"),
    );
}
export function buildCollectionView(
  dataset: Dataset,
  records: FinancialRecord[],
  filters: Filters,
  query: CollectionQuery,
) {
  const rows = selectCollectionRows(
    collectionRows(dataset, records),
    dataset.reference,
    query,
  );
  return {
    rows,
    summary: collectionSummary(rows, dataset.reference),
    bands: aging(
      rows.map((row) => row.record),
      dataset.reference,
    ),
    clients: collectionGroups(rows, dataset.reference, "client"),
    representatives: collectionGroups(
      rows,
      dataset.reference,
      "representative",
    ),
    reference: dataset.reference,
    filename: dataset.filename,
    filters: { ...filters },
    query: { ...query, bands: [...query.bands] },
  };
}
export type CollectionView = ReturnType<typeof buildCollectionView>;
export function reportFilters(view: CollectionView): string[] {
  return [
    `Ano: ${view.filters.year}`,
    `Mês de referência: ${view.filters.month}`,
    `Cliente: ${view.filters.client || "Todos"}`,
    `Representante: ${view.filters.representative || "Todos"}`,
    `Categoria: ${view.filters.category === "overdue" ? "Vencidos (inadimplência)" : view.filters.category === "upcoming" ? "A Vencer" : view.filters.category === "received" ? "Recebido (sem pendências)" : "Todas"}`,
    `Faixas: ${view.query.bands.length ? view.query.bands.map((index) => agingBandNames[index]).join(", ") : "Todas"}`,
    `Pesquisa cliente: ${view.query.clientSearch || "Sem restrição"}`,
    `Pesquisa duplicata/título: ${view.query.documentSearch || "Sem restrição"}`,
    `Ordenação: ${{ due: "Vencimento", openCents: "Saldo em aberto", days: "Dias vencidos", client: "Cliente", document: "Duplicata" }[view.query.sort]} (${view.query.ascending ? "crescente" : "decrescente"})`,
  ];
}
