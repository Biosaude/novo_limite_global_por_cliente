import ExcelJS from "exceljs";
/** Estrutura conferida na planilha oficial; modelo vazio, sem registros financeiros. */
export const templateSheets = [
  {
    name: "CONSOLIDADO - A VENCER (VA529)",
    headers: [
      "Nome cliente",
      "Duplicata",
      "Parcela",
      "Dt.emissao",
      "Dt.vencimento",
      "Dias para vencer",
      "Dt.cirurgia",
      "Paciente",
      "Nome hospital",
      "Descricao do plano de saude",
      "Nome do medico",
      "Vr.duplicata",
      "Vr.desconto",
      "Vr.aberto",
      "Descricao",
      "Descricao",
      "Nome representante",
      "Numero do titulo completo",
    ],
  },
  {
    name: "CONSOLIDADO - VENCIDO (VA529)",
    headers: [
      "Nome cliente",
      "Duplicata",
      "Parcela",
      "Dt.emissao",
      "Dt.vencimento",
      "Qtd. De dias vencidos",
      "Dt.cirurgia",
      "Paciente",
      "Nome hospital",
      "Descricao do plano de saude",
      "Nome do medico",
      "Vr.duplicata",
      "Vr.desconto",
      "Vr.aberto",
      "Descricao",
      "Nome representante",
      "Numero do titulo completo",
    ],
  },
  {
    name: "CONSOLIDADO - RECEBIDO (VA527)",
    headers: [
      "Nome cliente",
      "Duplicata",
      "Parcela",
      "Dt.emissao",
      "Dt.vencimento",
      "Dt.recebimento",
      "Dt.cirurgia",
      "Paciente",
      "Nome hospital",
      "Descricao do plano de saude",
      "Nome do medico",
      "Dt.credito",
      "Vr.duplicata",
      "Vr.desconto",
      "Vr.recebido",
      "Descricao",
      "Nome representante",
      "Numero do titulo completo",
    ],
  },
];
export async function createTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BIOSAÚDE";
  workbook.title = "Modelo da Base — Limite Global por Cliente";
  for (const definition of templateSheets) {
    const sheet = workbook.addWorksheet(definition.name, {
      properties: { tabColor: { argb: "FFC52D3A" } },
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.addRow(definition.headers);
    sheet.getRow(1).height = 36;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1D2C47" },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: definition.headers.length },
    };
    definition.headers.forEach((header, index) => {
      const column = sheet.getColumn(index + 1);
      column.width =
        header.includes("Nome") ||
        header.includes("Descricao") ||
        header.includes("titulo")
          ? 32
          : 20;
      if (header.startsWith("Dt.")) column.numFmt = "dd/mm/yyyy";
      if (header.startsWith("Vr.")) column.numFmt = '"R$" #,##0.00';
    });
  }
  return Uint8Array.from(new Uint8Array(await workbook.xlsx.writeBuffer()))
    .buffer;
}
