import ExcelJS from "exceljs";
export async function creditFixture(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const common = [
    "Nome cliente",
    "Duplicata",
    "Parcela",
    "Numero do titulo completo",
    "Nome representante",
    "Vr.duplicata",
    "Vr.aberto",
    "Dt.emissao",
    "Dt.vencimento",
  ];
  const up = wb.addWorksheet("A Vencer");
  up.addRow(common);
  up.addRow([
    " Cliente Teste A ",
    101,
    1,
    "101/01",
    "Representante A",
    99999,
    100,
    new Date("2026-03-31Z"),
    new Date("2026-04-30Z"),
  ]);
  up.addRow([
    "Cliente Teste B",
    102,
    1,
    "102/01",
    "Representante B",
    99999,
    0,
    new Date("2026-03-01Z"),
    new Date("2026-04-01Z"),
  ]);
  const overdue = wb.addWorksheet("Vencido");
  overdue.addRow(common);
  overdue.addRow([
    "cliente teste a",
    201,
    1,
    "201/01",
    "Representante B",
    99999,
    50,
    new Date("2026-01-30Z"),
    new Date("2026-03-01Z"),
  ]);
  const receipt = wb.addWorksheet("Recebido");
  receipt.addRow([
    "Nome cliente",
    "Duplicata",
    "Parcela",
    "Numero do titulo completo",
    "Nome representante",
    "Vr.duplicata",
    "Vr.recebido",
    "Dt.emissao",
    "Dt.vencimento",
    "Dt.recebimento",
  ]);
  const add = (
    doc: number,
    amount: number,
    issued: string,
    due: string,
    received: string,
  ) =>
    receipt.addRow([
      "CLIENTE   TESTE A",
      doc,
      1,
      `${doc}/01`,
      "Representante A",
      99999,
      amount,
      new Date(issued + "T00:00:00Z"),
      new Date(due + "T00:00:00Z"),
      new Date(received + "T00:00:00Z"),
    ]);
  add(301, 20, "2025-12-01", "2025-12-31", "2026-01-05");
  add(301, 30, "2025-12-01", "2025-12-31", "2026-02-05");
  add(302, 40, "2026-01-01", "2026-01-31", "2026-01-31");
  add(303, 10, "2026-01-30", "2026-03-01", "2026-03-01");
  return Buffer.from(await wb.xlsx.writeBuffer());
}
