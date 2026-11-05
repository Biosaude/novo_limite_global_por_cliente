import ExcelJS from "exceljs";
/** Esquema de exportação original: cabeçalho na linha 2, Codigo em A e Nr.boleto em AN. */
export const templateSheets = [
  {
    "name": "VENCIDO",
    "headers": [
      "Codigo",
      "Nome cliente",
      "Duplicata",
      "Parcela",
      "Tipo",
      "Dt.emissao",
      "Dt.inclusao",
      "Dt.vencimento",
      "Qtd. De dias vencidos",
      "Dt.cirurgia",
      "Paciente",
      "Nome hospital",
      "Grupo da cirurgia",
      "Tipo da cirurgia",
      "Plano de saude",
      "Descricao do plano de saude",
      "Nome do medico",
      "Dt.credito",
      "Vr.duplicata",
      "Vr.desconto",
      "Vr.juros",
      "Vr.aberto",
      "Vr.recebido",
      "Local cobranca",
      "Descricao",
      "Nat.operacao",
      "Descricao",
      "Banco",
      "Protestado?",
      "Observacao",
      "Cod.representante 1",
      "Nome representante",
      "Cod.representante 2",
      "Nome representante",
      "CNPJ do hospital",
      "Observacao",
      "Caixa",
      "Descricao",
      "Vr.desc.original",
      "Nr.boleto",
      "Numero do titulo completo"
    ]
  },
  {
    "name": "A VENCER",
    "headers": [
      "Codigo",
      "Nome cliente",
      "Duplicata",
      "Parcela",
      "Tipo",
      "Dt.emissao",
      "Dt.inclusao",
      "Dt.vencimento",
      "Dias para vencer",
      "Dt.cirurgia",
      "Paciente",
      "Nome hospital",
      "Grupo da cirurgia",
      "Tipo da cirurgia",
      "Plano de saude",
      "Descricao do plano de saude",
      "Nome do medico",
      "Dt.credito",
      "Vr.duplicata",
      "Vr.desconto",
      "Vr.juros",
      "Vr.aberto",
      "Vr.recebido",
      "Local cobranca",
      "Descricao",
      "Nat.operacao",
      "Descricao",
      "Banco",
      "Protestado?",
      "Observacao",
      "Cod.representante 1",
      "Nome representante",
      "Cod.representante 2",
      "Nome representante",
      "CNPJ do hospital",
      "Observacao",
      "Caixa",
      "Descricao",
      "Vr.desc.original",
      "Nr.boleto",
      "Numero do titulo completo"
    ]
  },
  {
    "name": "RECEBIDO",
    "headers": [
      "Codigo",
      "Nome cliente",
      "Duplicata",
      "Parcela",
      "Tipo",
      "Dt.emissao",
      "Dt.inclusao",
      "Dt.vencimento",
      "Dt.recebimento",
      "Dt.cirurgia",
      "Paciente",
      "Nome hospital",
      "Grupo da cirurgia",
      "Tipo da cirurgia",
      "Plano de saude",
      "Descricao do plano de saude",
      "Nome do medico",
      "Dt.credito",
      "Vr.duplicata",
      "Vr.desconto",
      "Vr.juros",
      "Vr.aberto",
      "Vr.recebido",
      "Local cobranca",
      "Descricao",
      "Nat.operacao",
      "Descricao",
      "Banco",
      "Protestado?",
      "Observacao",
      "Cod.representante 1",
      "Nome representante",
      "Cod.representante 2",
      "Nome representante",
      "CNPJ do hospital",
      "Observacao",
      "Caixa",
      "Descricao",
      "Vr.desc.original",
      "Nr.boleto",
      "Numero do titulo completo"
    ]
  }
];
export async function createTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BIOSAÚDE";
  workbook.title = "Modelo da Base — Limite Global por Cliente";
  for (const definition of templateSheets) {
    const sheet = workbook.addWorksheet(definition.name, { views: [{ state: "frozen", ySplit: 2 }] });
    sheet.getCell("A1").value = definition.name === "RECEBIDO" ? "VA0527" : "VA0529";
    sheet.getRow(2).values = definition.headers;
    sheet.getRow(2).height = 36;
    sheet.getRow(2).eachCell(cell => {
      cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D2C47" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: definition.headers.length } };
    definition.headers.forEach((header, index) => {
      const column = sheet.getColumn(index + 1);
      column.width = /Nome|Descricao|titulo/.test(header) ? 32 : 20;
      if (header.startsWith("Dt.")) column.numFmt = "dd/mm/yyyy";
      if (header.startsWith("Vr.")) column.numFmt = '\"R$\" #,##0.00';
      if (header === "Codigo" || header === "Nr.boleto") { column.numFmt = "@"; column.width = 26; }
    });
  }
  return Uint8Array.from(new Uint8Array(await workbook.xlsx.writeBuffer())).buffer;
}
