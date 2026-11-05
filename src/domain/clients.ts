import type { FinancialRecord } from "./types";

/** Identidade dentro da posição: nunca combina códigos de empresas distintas. */
export function clientIdentity(record: FinancialRecord): string {
  return record.clientCode
    ? JSON.stringify(["code", record.companyCode || "", record.clientCode])
    : JSON.stringify(["name", record.client || "Sem cliente"]);
}
export const clientFilterValue = (record: FinancialRecord) =>
  record.clientCode ? clientIdentity(record) : record.client || "Sem cliente";
export const matchesClient = (record: FinancialRecord, value: string) =>
  !value || clientFilterValue(record) === value;
export function clientFilterLabel(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length === 3 && parsed[0] === "code" && typeof parsed[1] === "string" && typeof parsed[2] === "string")
      return `Código ${parsed[2]}${parsed[1] ? ` · Empresa ${parsed[1]}` : ""}`;
  } catch { /* Filtros legados já contêm o nome exibido. */ }
  return value;
}
export function clientLabel(record: FinancialRecord): string {
  const name = record.client || "Sem cliente";
  return record.clientCode
    ? `${record.clientCode} — ${name}${record.companyCode ? ` · Empresa ${record.companyCode}` : ""}`
    : name;
}
export function clientOptions(records: FinancialRecord[]) {
  const groups = new Map<string, FinancialRecord>();
  for (const record of records) {
    const key = clientIdentity(record), previous = groups.get(key);
    if (!previous || record.client.localeCompare(previous.client, "pt-BR") < 0)
      groups.set(key, record);
  }
  return [...groups.values()].map(record => ({ value: clientFilterValue(record), label: clientLabel(record) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
}
