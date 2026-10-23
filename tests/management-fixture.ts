import ExcelJS from "exceljs";
import { receiptsFixture } from "./receipts-fixture";
export async function managementFixture() {
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(Uint8Array.from(await receiptsFixture()).buffer);
  const s = w.worksheets[1],
    headers = s.getRow(1).values as string[];
  for (const [i, [title, client, rep, value, due]] of (
    [
      ["P3", "Cliente Sintético A", "Rep X", 200, "2026-04-20"],
      ["P3", "Cliente Sintético A", "Rep X", 50, "2026-04-20"],
      ["P4", "Cliente Sintético B", "Rep Y", 300, "2026-06-01"],
    ] as const
  ).entries()) {
    const row = i + 3;
    for (const [field, v] of Object.entries({
      "Nome cliente": client,
      "Nome representante": rep,
      Duplicata: title,
      Parcela: 1,
      "Numero do titulo completo": title + "/01",
      "Dt.emissao": new Date("2026-01-01Z"),
      "Dt.vencimento": new Date(due + "T00:00:00Z"),
      "Vr.duplicata": 9999,
      "Vr.aberto": value,
      "Qtd. De dias vencidos": { formula: `TODAY()-E${row}` },
    }))
      s.getRow(row).getCell(headers.indexOf(field)).value =
        v as ExcelJS.CellValue;
  }
  return Buffer.from(await w.xlsx.writeBuffer());
}
