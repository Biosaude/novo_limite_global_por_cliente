import ExcelJS from "exceljs";
import { createTemplate } from "../src/importacao/template";
export async function receiptsFixture(repeats = 1) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await createTemplate());
  const sheet = wb.worksheets[2];
  const headers = sheet.getRow(1).values as string[];
  const legalCol = sheet.columnCount + 1;
  sheet.getCell(1, legalCol).value = "Título ajuizado";
  const records = [
    [
      "2026-01-10",
      "2026-01-20",
      100,
      "sim",
      "Cliente Sintético A",
      "Rep X",
      "P1",
    ],
    [
      "2026-02-20",
      "2026-02-20",
      200,
      "não",
      "Cliente Sintético B",
      "Rep Y",
      "P2",
    ],
    ["2026-04-25", "2026-04-20", 300, "", "Cliente Sintético A", "Rep X", "P3"],
    [
      "2026-07-01",
      "2026-06-01",
      400,
      "ajuizado",
      "Cliente Sintético B",
      "Rep Y",
      "P4",
    ],
    [
      "2026-10-20",
      "2026-10-21",
      50,
      "sim",
      "Cliente Sintético A",
      "Rep X",
      "P1",
    ],
    [
      "2026-10-20",
      "2026-10-21",
      50,
      "sim",
      "Cliente Sintético A",
      "Rep X",
      "P1",
    ],
  ] as const;
  Array.from({ length: repeats }, () => records)
    .flat()
    .forEach(([rec, due, amount, legal, client, rep, document], i) => {
      const values: Record<string, ExcelJS.CellValue> = {
        "Nome cliente": client,
        "Nome representante": rep,
        Duplicata: document,
        Parcela: 1,
        "Numero do titulo completo": document + "/01",
        "Dt.emissao": new Date("2025-12-01Z"),
        "Dt.vencimento": new Date(due + "T00:00:00Z"),
        "Dt.recebimento": new Date(rec + "T00:00:00Z"),
        "Vr.duplicata": 9999,
        "Vr.desconto": 0,
        "Vr.recebido": amount,
        Paciente: "PACIENTE-NAO-EXPORTAR",
      };
      Object.entries(values).forEach(
        ([name, value]) =>
          (sheet.getRow(i + 2).getCell(headers.indexOf(name)).value = value),
      );
      sheet.getCell(i + 2, legalCol).value = legal;
    });
  for (const [i, open] of wb.worksheets.slice(0, 2).entries()) {
    const names = open.getRow(1).values as string[];
    const values: Record<string, ExcelJS.CellValue> = {
      "Nome cliente": "Cliente Sintético A",
      "Nome representante": "Rep X",
      Duplicata: "ABERTO-" + i,
      Parcela: 1,
      "Numero do titulo completo": "ABERTO-" + i + "/01",
      "Dt.emissao": new Date("2026-10-01Z"),
      "Dt.vencimento": new Date(i ? "2026-10-01Z" : "2026-10-30Z"),
      "Vr.duplicata": 9999,
      "Vr.aberto": 100,
    };
    Object.entries(values).forEach(
      ([name, value]) =>
        (open.getRow(2).getCell(names.indexOf(name)).value = value),
    );
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
