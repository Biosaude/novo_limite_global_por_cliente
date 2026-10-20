import type { Dataset, Filters, FinancialRecord, Group, Totals } from "./types";
import { cutoff, daysBetween } from "./dates";
import { sum } from "./money";
export function initialFilters(dataset: Dataset): Filters {
  return {
    year: dataset.reference.slice(0, 4),
    month: dataset.reference.slice(5, 7),
    client: "",
    representative: "",
    category: "",
  };
}
export function selectRecords(
  dataset: Dataset,
  filters: Filters,
): FinancialRecord[] {
  const end = cutoff(dataset.reference, filters.year, filters.month);
  const start = `${filters.year}-01-01`;
  return dataset.records.filter(
    (record) =>
      (!filters.client ||
        (record.client || "Sem cliente") === filters.client) &&
      (!filters.representative ||
        (record.representative || "Sem representante") ===
          filters.representative) &&
      (!filters.category || record.category === filters.category) &&
      (record.category !== "received" ||
        (!!record.received &&
          record.received >= start &&
          record.received <= end)),
  );
}
export function totals(records: FinancialRecord[]): Totals {
  const by = (category: FinancialRecord["category"]) =>
    sum(
      records
        .filter((record) => record.category === category)
        .map((record) => record.cents ?? 0),
    );
  const upcoming = by("upcoming"),
    overdue = by("overdue"),
    received = by("received");
  return {
    upcoming,
    overdue,
    received,
    global: sum([upcoming, overdue, received]),
    count: records.length,
  };
}
export function groupBy(
  records: FinancialRecord[],
  field: "client" | "representative",
): Group[] {
  const groups = new Map<string, FinancialRecord[]>();
  for (const record of records) {
    const key =
      record[field] ||
      (field === "client" ? "Sem cliente" : "Sem representante");
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups]
    .map(([name, entries]) => ({ name, ...totals(entries) }))
    .sort(
      (a, b) => b.global - a.global || a.name.localeCompare(b.name, "pt-BR"),
    );
}
export function aging(records: FinancialRecord[], reference: string) {
  const ranges = [
    "Sem atraso / divergente",
    "1–30 dias",
    "31–60 dias",
    "61–90 dias",
    "91–180 dias",
    "Acima de 180 dias",
    "Sem vencimento",
  ];
  const values = ranges.map((name) => ({ name, value: 0 }));
  for (const record of records.filter(
    (record) => record.category === "overdue",
  )) {
    const days = record.due ? daysBetween(reference, record.due) : null;
    const index =
      days === null
        ? 6
        : days <= 0
          ? 0
          : days <= 30
            ? 1
            : days <= 60
              ? 2
              : days <= 90
                ? 3
                : days <= 180
                  ? 4
                  : 5;
    values[index].value = sum([values[index].value, record.cents ?? 0]);
  }
  return values;
}
export function monthly(records: FinancialRecord[]) {
  const groups = new Map<string, number[]>();
  for (const record of records)
    if (record.category === "received" && record.received) {
      const name = record.received.slice(0, 7);
      groups.set(name, [...(groups.get(name) ?? []), record.cents ?? 0]);
    }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => ({
      name: name.slice(5) + "/" + name.slice(0, 4),
      value: sum(values),
    }));
}
