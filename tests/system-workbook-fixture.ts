import ExcelJS from "exceljs";
import { createTemplate } from "../src/importacao/template";

/** Somente dados sintéticos; esquema real com cabeçalho 2 e boleto em AN. */
export async function systemWorkbookFixture() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await createTemplate());
  for (const sheet of workbook.worksheets) {
    sheet.getCell("AP2").value = "Cod.empresa";
    const headers = sheet.getRow(2).values as string[];
    const entries = [
      ["001", "Nome Original", "E1", " '00012345678901234567890  "],
      ["001", "Nome Alterado", "E1", "'     "],
      ["002", "Nome Original", "E1", "00000000000000000000002"],
      ["001", "Outra Empresa", "E2", "   "],
    ];
    entries.forEach(([code, name, company, boleto], i) => {
      const row = sheet.getRow(i + 3);
      const put = (header: string, value: ExcelJS.CellValue) => { row.getCell(headers.indexOf(header)).value = value; };
      put("Codigo", code); put("Nome cliente", name); put("Cod.empresa", company); put("Nr.boleto", boleto);
      put("Nome representante", "Representante primário");
      sheet.getCell(i + 3, 34).value = "Representante secundário";
      put("Duplicata", "T" + i); put("Parcela", "01"); put("Numero do titulo completo", "T" + i + "/01");
      put("Dt.emissao", new Date("2026-10-01Z"));
      put("Dt.vencimento", new Date(sheet.name === "A VENCER" ? "2026-11-20Z" : "2026-11-01Z"));
      if (sheet.name === "RECEBIDO") put("Dt.recebimento", new Date("2026-11-04Z"));
      put("Vr.duplicata", 99999); put("Vr.aberto", 10 + i); put("Vr.recebido", 20 + i);
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
