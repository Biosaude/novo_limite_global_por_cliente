import {
  fieldLabels,
  type Dataset,
  type FinancialRecord,
  type Issue,
  type Mapping,
  type SourceWorkbook,
} from "../domain/types";
import { scalar, cellText, blank } from "./mapping";
import { dateValue, validDate } from "../domain/dates";
import { cents, sum } from "../domain/money";
import { audit } from "../auditoria/audit";
export function normalize(
  source: SourceWorkbook,
  mappings: Mapping[],
  reference: string,
  filename: string,
): Dataset {
  if (!validDate(reference))
    throw new Error("Informe uma data de referência válida para a extração.");
  const records: FinancialRecord[] = [],
    issues: Issue[] = [];
  for (const sheet of source.sheets) {
    const map = mappings.find((mapping) => mapping.sheet === sheet.name);
    if (!map?.category)
      throw new Error(
        `Defina a categoria financeira da aba “${sheet.name}”. Nenhuma aba é ignorada automaticamente.`,
      );
    const header = sheet.rows.find((row) => row.number === map.header);
    if (!header)
      throw new Error(`Cabeçalho inexistente na aba “${sheet.name}”.`);
    const required: (keyof Mapping["fields"])[] =
      map.category === "received"
        ? ["client", "amount", "received"]
        : ["client", "amount"];
    for (const field of required) {
      if (map.fields[field] < 0 || map.fields[field] >= sheet.columns)
        throw new Error(
          `Selecione a coluna ${fieldLabels[field]} na aba “${sheet.name}”.`,
        );
    }
    const selected = Object.values(map.fields).filter((index) => index >= 0);
    if (new Set(selected).size !== selected.length)
      throw new Error(
        `Uma coluna está mapeada para dois campos na aba “${sheet.name}”. Confira o mapeamento.`,
      );
    const rows = sheet.rows.filter(
      (row) => row.number > map.header && !blank(row),
    );
    if (!rows.length)
      throw new Error(
        `A aba “${sheet.name}” não contém registros após o cabeçalho selecionado.`,
      );
    for (const row of rows) {
      const get = (field: keyof Mapping["fields"]) =>
        scalar(row.cells[map.fields[field]]);
      const id = `${sheet.name}:${row.number}`;
      const error = (code: string, message: string) =>
        issues.push({
          id: `${id}:${code}`,
          severity: "error",
          code,
          message: `Linha ${row.number}, aba ${sheet.name}: ${message}`,
          records: [id],
        });
      let amount: number | null = null;
      try {
        amount = cents(get("amount"));
      } catch (e) {
        error(
          "invalid_amount",
          `${e instanceof Error ? e.message : "Valor financeiro inválido."} Valor original: ${cellText(row.cells[map.fields.amount]) || "(ausente)"}.`,
        );
      }
      const received = dateValue(get("received"), source.date1904);
      if (map.category === "received" && !received)
        error(
          "invalid_receipt_date",
          `Data de recebimento ausente ou inválida; impossível determinar o Recebido YTD. Valor original: ${cellText(row.cells[map.fields.received]) || "(ausente)"}. Valor financeiro: ${String(get("amount") ?? "(ausente)")}.`,
        );
      const days = get("days");
      const reportedDays =
        days !== null &&
        String(days).trim() !== "" &&
        Number.isInteger(Number(days))
          ? Number(days)
          : null;
      if (days !== null && String(days).trim() !== "" && reportedDays === null)
        issues.push({
          id: `${id}:invalid_days`,
          code: "invalid_days",
          severity: "warning",
          records: [id],
          message:
            "Quantidade de dias inválida; atraso calculado com vencimento e referência.",
        });
      records.push({
        id,
        sheet: sheet.name,
        row: row.number,
        category: map.category,
        client: String(get("client") ?? "").trim(),
        title: String(get("title") ?? "").trim(),
        representative: String(get("representative") ?? "").trim(),
        cents: amount,
        due: dateValue(get("due"), source.date1904),
        received,
        reportedDays,
      });
      // Células com fórmula usam somente resultado armazenado; nunca avaliam expressões.
      if (
        [map.fields.amount, map.fields.due, map.fields.received]
          .filter((index) => index >= 0)
          .some((index) => {
            const value = row.cells[index];
            return (
              value &&
              typeof value === "object" &&
              !Array.isArray(value) &&
              ("formula" in value || "sharedFormula" in value)
            );
          })
      ) {
        issues.push({
          id: `${id}:formula`,
          code: "formula",
          severity: "warning",
          records: [id],
          message:
            "Há fórmula em valor financeiro ou data. Usado o resultado salvo no Excel; conferir atualização no arquivo de origem.",
        });
      }
    }
  }
  try {
    // Verifica também somatórios intermediários em valor absoluto, para não ocultar overflow por cancelamento.
    sum(records.map((record) => Math.abs(record.cents ?? 0)));
  } catch {
    issues.push({
      id: "overflow",
      severity: "error",
      code: "overflow",
      message:
        "A soma excede a precisão monetária suportada. A base não pode ser confirmada.",
      records: [],
    });
  }
  if (!records.length)
    throw new Error("Nenhum registro financeiro foi identificado.");
  return {
    version: 1,
    id: crypto.randomUUID(),
    filename,
    importedAt: new Date().toISOString(),
    reference,
    source,
    mappings,
    records,
    issues: [...issues, ...audit(records, reference)],
    reviews: {},
  };
}
