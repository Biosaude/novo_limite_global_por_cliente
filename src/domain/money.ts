import Decimal from "decimal.js";
/** Centavos inteiros; nenhum cálculo monetário usa soma de ponto flutuante em reais. */
export function cents(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("Valor ausente ou não numérico.");
  let text = String(value)
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/[\s\u00a0]/g, "");
  if (/^\(.*\)$/.test(text)) text = "-" + text.slice(1, -1);
  if (text.includes(",")) {
    if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,2}$/.test(text))
      throw new Error("Formato monetário brasileiro inválido.");
    text = text.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text))
    throw new Error("Valor monetário inválido.");
  const amount = new Decimal(text).times(100);
  if (!amount.isInteger())
    throw new Error(
      "Valor com precisão superior a centavos. Conferir a origem.",
    );
  const result = amount.toNumber();
  if (!Number.isSafeInteger(result))
    throw new Error("Valor excede a precisão monetária suportada.");
  return result;
}
export function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(total))
      throw new Error("O total excede a precisão monetária suportada.");
  }
  return total;
}
export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );
export const compactMoney = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 1,
  }).format(value / 100);
export const percentage = (value: number, total: number) =>
  total === 0
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(value / total);
