import type { FinancialRecord, Issue } from "../domain/types";
import { daysBetween } from "../domain/dates";
export function audit(records: FinancialRecord[], reference: string): Issue[] {
  const issues: Issue[] = [];
  const titles = new Map<string, FinancialRecord[]>();
  const add = (record: FinancialRecord, code: string, message: string) =>
    issues.push({
      id: `${record.id}:${code}`,
      severity: "warning",
      code,
      message,
      records: [record.id],
    });
  for (const record of records) {
    if (!record.client.trim())
      add(
        record,
        "missing_client",
        "Cliente não informado; registro preservado no grupo Sem cliente.",
      );
    if (!record.title.trim())
      add(
        record,
        "missing_title",
        "Título não informado; registro preservado sem deduplicação.",
      );
    if (!record.representative.trim())
      add(
        record,
        "missing_representative",
        "Representante não informado; registro preservado no grupo Sem representante.",
      );
    if (record.cents !== null && record.cents < 0)
      add(
        record,
        "negative",
        "Valor financeiro negativo preservado; conferir a origem.",
      );
    if (!record.due)
      add(
        record,
        "missing_due",
        "Data de vencimento ausente ou inválida; título preservado e atraso indeterminado.",
      );
    else if (record.category !== "received") {
      const days = daysBetween(reference, record.due);
      if (
        (record.category === "upcoming" && days > 0) ||
        (record.category === "overdue" && days <= 0)
      )
        add(
          record,
          "category_date",
          `Categoria divergente do vencimento: ${days} dias em relação à referência. A categoria original foi mantida.`,
        );
      if (record.reportedDays !== null && record.reportedDays !== days)
        add(
          record,
          "days",
          `Dias informados: ${record.reportedDays}; calculados (referência − vencimento): ${days}; diferença: ${record.reportedDays - days}. O valor original foi mantido.`,
        );
    }
    if (record.title.trim() && record.client.trim()) {
      const key = `${record.client.trim().toLocaleUpperCase("pt-BR")}\u0000${record.title.trim().toLocaleUpperCase("pt-BR")}`;
      titles.set(key, [...(titles.get(key) ?? []), record]);
    }
  }
  for (const entries of titles.values()) {
    if (entries.length < 2) continue;
    const categories = new Set(entries.map((record) => record.category));
    issues.push({
      id: `overlap:${entries.map((record) => record.id).join("|")}`,
      code: categories.size > 1 ? "overlap" : "repeated_title",
      severity: "warning",
      message:
        categories.size > 1
          ? "Mesmo cliente e título em mais de uma categoria. Pode representar recebimento parcial; nenhum registro foi excluído."
          : "Mesmo cliente e título repetidos na mesma categoria; conferir, sem exclusão automática.",
      records: entries.map((record) => record.id),
    });
  }
  return issues;
}
