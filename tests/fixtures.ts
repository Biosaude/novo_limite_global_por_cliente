import ExcelJS from "exceljs";
export async function fixture(
  variant: "normal" | "replacement" | "invalid" | "missing-rep" = "normal",
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const upcoming = wb.addWorksheet("A Vencer");
  upcoming.addRow([
    "Nome cliente",
    "Numero do titulo completo",
    "Nome representante",
    "Vr.duplicata",
    "Vr.aberto",
    "Dt.vencimento",
    "Dias para vencer",
  ]);
  upcoming.addRow([
    "Cliente Teste A",
    "X/01",
    variant === "missing-rep" ? "" : "Representante Teste",
    9999,
    variant === "replacement"
      ? 42.5
      : variant === "invalid"
        ? "valor inválido"
        : 100.1,
    new Date("2026-10-29T00:00:00Z"),
    -10,
  ]);
  const overdue = wb.addWorksheet("Vencido");
  overdue.addRow([
    "Nome cliente",
    "Numero do titulo completo",
    "Nome representante",
    "Vr.duplicata",
    "Vr.aberto",
    "Dt.vencimento",
    "Qtd. De dias vencidos",
  ]);
  overdue.addRow([
    "Cliente Teste A",
    "Y/01",
    "Representante Teste",
    9999,
    50.2,
    new Date("2026-10-09T00:00:00Z"),
    10,
  ]);
  const received = wb.addWorksheet("Recebido");
  received.addRow([
    "Nome cliente",
    "Numero do titulo completo",
    "Nome representante",
    "Vr.duplicata",
    "Vr.recebido",
    "Dt.recebimento",
    "Dt.vencimento",
  ]);
  received.addRow([
    "Cliente Teste B",
    "Z/01",
    "Representante Teste",
    9999,
    30.3,
    new Date("2026-01-10T00:00:00Z"),
    new Date("2026-01-09T00:00:00Z"),
  ]);
  received.addRow([
    "Cliente Teste A",
    "X/01",
    "Representante Teste",
    9999,
    20.4,
    new Date("2026-10-10T00:00:00Z"),
    new Date("2026-10-29T00:00:00Z"),
  ]);
  received.addRow([
    "Cliente Teste B",
    "PAST/01",
    "Representante Teste",
    9999,
    700,
    new Date("2025-12-31T00:00:00Z"),
    new Date("2025-12-31T00:00:00Z"),
  ]);
  received.addRow([
    "Cliente Teste B",
    "FUTURE/01",
    "Representante Teste",
    9999,
    800,
    new Date("2026-10-20T00:00:00Z"),
    new Date("2026-10-20T00:00:00Z"),
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
