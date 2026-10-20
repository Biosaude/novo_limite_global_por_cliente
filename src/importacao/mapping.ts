import {
  fieldLabels,
  type Category,
  type Mapping,
  type RawCell,
  type SourceWorkbook,
} from "../domain/types";
export function scalar(
  value: RawCell | undefined,
): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value !== "object") return value;
  if (!Array.isArray(value)) {
    if ("formula" in value || "sharedFormula" in value)
      return scalar(value.result);
    if (Array.isArray(value.richText))
      return value.richText
        .map((part) =>
          typeof part === "object" && part && !Array.isArray(part)
            ? (scalar(part.text) ?? "")
            : "",
        )
        .join("");
    if ("text" in value) return scalar(value.text);
  }
  return null;
}
export const cellText = (value: RawCell | undefined) =>
  String(scalar(value) ?? "");
export const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const aliases = {
  client: ["nomecliente", "cliente", "razaosocial"],
  title: ["numerodotitulocompleto", "titulocompleto", "titulo"],
  representative: ["nomerepresentante", "representante"],
  due: ["dtvencimento", "datavencimento", "vencimento"],
  received: ["dtrecebimento", "datarecebimento", "recebimento"],
  days: ["diasparavencer", "qtddediasvencidos", "diasvencidos", "diasematraso"],
};
export const amountAliases = (category: Category | "") =>
  category === "received"
    ? ["vrrecebido", "valorrecebido"]
    : ["vraberto", "saldoemaberto", "valoremaberto", "saldoaberto"];
export function suggestMappings(source: SourceWorkbook): Mapping[] {
  return source.sheets.map((sheet) => {
    const name = normalized(sheet.name);
    const category: Category | "" = name.includes("avencer")
      ? "upcoming"
      : name.includes("vencido")
        ? "overdue"
        : name.includes("recebido")
          ? "received"
          : "";
    const best = sheet.rows
      .slice(0, 30)
      .map((row) => ({
        row,
        score: row.cells.reduce<number>(
          (score, value) =>
            score +
            (Object.values(aliases)
              .flat()
              .includes(normalized(cellText(value))) ||
            [
              ...amountAliases("received"),
              ...amountAliases("upcoming"),
            ].includes(normalized(cellText(value)))
              ? 1
              : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score)[0];
    const header = best?.row.number ?? 1;
    const fields = Object.fromEntries(
      Object.keys(fieldLabels).map((field) => {
        const names =
          field === "amount"
            ? amountAliases(category)
            : aliases[field as keyof typeof aliases];
        const indices = (best?.row.cells ?? [])
          .map((cell, index) =>
            names.includes(normalized(cellText(cell))) ? index : -1,
          )
          .filter((index) => index !== -1);
        return [field, indices.length === 1 ? indices[0] : -1];
      }),
    ) as Mapping["fields"];
    return { sheet: sheet.name, category, header, fields };
  });
}
export function blank(row: { cells: RawCell[] }): boolean {
  return row.cells.every((value) => value === null || value === "");
}
