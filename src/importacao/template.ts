import ExcelJS from "exceljs";
/** Estrutura oficial sem registros financeiros; F2 orienta o preenchimento dos dias. */
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
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.title = "Modelo da Base — Limite Global por Cliente";
  for (const definition of templateSheets) {
    const sheet = workbook.addWorksheet(definition.name, {
      properties: { tabColor: { argb: "FFC52D3A" } },
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.addRow(definition.headers);
    if (!definition.name.includes("RECEBIDO")) {
      sheet.getCell("F2").value = { formula: definition.name.includes("A VENCER") ? "E2-TODAY()" : "TODAY()-E2" };
      sheet.getCell("F2").numFmt = "0";
      sheet.getCell("F2").note = "Fórmula oficial. Preencha o vencimento em E2 e copie a fórmula para as demais linhas. No dashboard os dias usam a data de referência confirmada da posição; o cache de HOJE() não altera uma posição histórica.";
    }

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
