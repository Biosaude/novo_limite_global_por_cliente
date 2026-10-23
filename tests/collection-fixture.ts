import ExcelJS from "exceljs";
import { createTemplate } from "../src/importacao/template";
export async function collectionFixture(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await createTemplate());
  const reference = "2026-10-23";
  const fill = (
    sheet: ExcelJS.Worksheet,
    row: number,
    values: Record<string, unknown>,
  ) => {
    const headers = sheet.getRow(1).values as string[];
    for (const [name, value] of Object.entries(values)) {
      const index = headers.indexOf(name);
      if (index > 0)
        sheet.getRow(row).getCell(index).value = value as ExcelJS.CellValue;
    }
  };
  for (let i = 0; i < 2; i++)
    fill(wb.worksheets[0], i + 2, {
      "Nome cliente": i ? "Cliente Sintético B" : "Cliente Sintético A",
      "Nome representante": i ? "Representante Y" : "Representante X",
      Duplicata: `UP-${i}`,
      Parcela: 1,
      "Numero do titulo completo": `UP-${i}/01`,
      "Dt.emissao": new Date("2026-09-01Z"),
      "Dt.vencimento": new Date(i ? "2026-10-23Z" : "2026-10-25Z"),
      "Dias para vencer": { formula: `E${i + 2}-TODAY()` },
      "Vr.duplicata": 9999,
      "Vr.desconto": 0,
      "Vr.aberto": i ? 200 : 100,
    });
  for (let i = 0; i < 90; i++) {
    const row = i + 2,
      delay = [1, 30, 31, 60, 61, 90, 91, 180, 181, 500][i % 10];
    fill(wb.worksheets[1], row, {
      "Nome cliente":
        i % 4 === 3 ? "Cliente Sintético B" : "Cliente Sintético A",
      "Nome representante": i % 2 ? "Representante Y" : "Representante X",
      Duplicata: `DOC-${String(i).padStart(3, "0")}`,
      Parcela: 1,
      "Numero do titulo completo": `DOC-${String(i).padStart(3, "0")}/01`,
      "Dt.emissao": new Date("2024-01-01Z"),
      "Dt.vencimento": new Date(Date.parse(reference) - delay * 86400000),
      "Qtd. De dias vencidos": { formula: `TODAY()-E${row}`, result: 999 },
      "Vr.duplicata": (i + 1) * 10 + 0.99,
      "Vr.desconto": 1,
      "Vr.aberto": ((i + 1) * 100 + 1) / 100,
      "Nome hospital": "Hospital Sintético",
      "Descricao do plano de saude": "Plano Sintético",
      Paciente: "DONOTEXPORT-PACIENTE-PRIVADO",
    });
  }
  fill(wb.worksheets[2], 2, {
    "Nome cliente": "Cliente Sintético A",
    "Nome representante": "Representante X",
    Duplicata: "REC-01",
    Parcela: 1,
    "Numero do titulo completo": "REC-01/01",
    "Dt.emissao": new Date("2026-01-01Z"),
    "Dt.vencimento": new Date("2026-01-30Z"),
    "Dt.recebimento": new Date("2026-02-01Z"),
    "Vr.duplicata": 999999,
    "Vr.desconto": 0,
    "Vr.recebido": 50000,
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
