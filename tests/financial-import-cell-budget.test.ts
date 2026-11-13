import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeImport } from "../server/financial/import-input.js";

function input(cellsPerRow: number, count: number) {
  const rows = [
    { number: 1, cells: ["Nome cliente", "Vr.aberto", ...Array(cellsPerRow - 2).fill(null)] },
    ...Array.from({ length: count }, (_, n) => ({
      number: n + 2,
      cells: [`Cliente ${n}`, 100, ...Array(cellsPerRow - 2).fill(null)],
    })),
  ];
  return {
    source: { date1904: false, sheets: [{ name: "VENCIDO", columns: cellsPerRow, rows }] },
    mappings: [{
      sheet: "VENCIDO", category: "overdue", header: 1,
      fields: {
        client: 0, amount: 1, title: -1, representative: -1,
        due: -1, received: -1, issued: -1, document: -1,
        installment: -1, days: -1,
      },
    }],
    reference: "2026-11-12", filename: "teste-sintetico.xlsx", confirm: true,
  };
}
test("validação aceita mais de 250 mil células até o limite do leitor", () => {
  const value = input(41, 7_550);
  assert.ok(value.source.sheets[0].rows.length * 41 > 250_000);
  const result = normalizeImport(value);
  assert.equal(result.records.length, 7_550);
});
test("validação recusa dados excessivamente aninhados", () => {
  const value = input(5, 1);
  let deep: unknown = "valor";
  for (let i = 0; i < 10; i++) deep = [deep];
  (value.source.sheets[0].rows[1].cells as unknown[])[2] = deep;
  assert.throws(() => normalizeImport(value), (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error &&
    error.code === "INVALID_INPUT");
});
