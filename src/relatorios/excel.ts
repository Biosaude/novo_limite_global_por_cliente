import ExcelJS from "exceljs";
import type { CollectionView } from "../cobranca/query";
import { reportFilters } from "../cobranca/query";
import { displayDate } from "../domain/dates";
export const reportName =
  "Relatório de Pendências Financeiras — Aging de Duplicatas";
const currency = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
function styleTable(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  widths: number[],
) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.addRow(headers);
  sheet.getRow(1).height = 34;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1D2C47" },
    };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
}
function addRows(
  sheet: ExcelJS.Worksheet,
  rows: unknown[][],
  dateColumns: number[],
  moneyColumns: number[],
) {
  for (const values of rows) {
    const row = sheet.addRow(values);
    row.alignment = { wrapText: true, vertical: "top" };
    row.height = Math.max(
      22,
      ...values.map(
        (value, index) =>
          Math.ceil(
            String(value ?? "").length /
              (sheet.getColumn(index + 1).width ?? 24),
          ) * 14,
      ),
    );
    dateColumns.forEach((index) => (row.getCell(index).numFmt = "dd/mm/yyyy"));
    moneyColumns.forEach((index) => (row.getCell(index).numFmt = currency));
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: sheet.columnCount },
  };
}
export async function createCollectionExcel(
  view: CollectionView,
  issuedAt = new Date().toISOString(),
): Promise<Uint8Array> {
  if (!view.rows.length || view.summary.invalidAmounts)
    throw new Error("Não há uma seleção financeira válida para exportar.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Biosaúde Produtos Hospitalares";
  workbook.title = reportName;
  workbook.created = new Date(issuedAt);
  workbook.calcProperties.fullCalcOnLoad = true;
  const summary = workbook.addWorksheet("Resumo Financeiro");
  styleTable(summary, ["Informação", "Valor"], [54, 105]);
  const meta: unknown[][] = [
    ["Relatório", reportName],
    ["Empresa", "Biosaúde Produtos Hospitalares"],
    [
      "Emissão",
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(issuedAt)),
    ],
    ["Data-base financeira", displayDate(view.reference)],
    ["Arquivo de origem", view.filename],
    ...reportFilters(view).map((value) => ["Filtro", value]),
    ["Registros selecionados", view.summary.recordCount],
    ["Títulos identificados", view.summary.titleCount],
    ["Clientes", view.summary.clientCount],
    ["Saldo em aberto selecionado", view.summary.totalOpen / 100],
    ["Saldo vencido selecionado", view.summary.totalOverdue / 100],
    ["Aging ponderado (dias)", view.summary.agingDays ?? "Não aplicável"],
    ["Maior atraso — Vencidos (dias)", view.summary.maxDelay],
    [
      "Metodologia",
      "KPIs gerais seguem os filtros principais. Este relatório reflete somente a consulta de títulos abertos, incluindo faixas e pesquisas. Datas da posição, sem reconstrução histórica.",
    ],
    [
      "Identificação",
      "Títulos identificados por cliente + duplicata + parcela (ou título completo). Lançamentos repetidos não são eliminados; recebimentos não compõem o saldo.",
    ],
    [
      "Limitações do aging",
      view.summary.excludedAgingCount
        ? `${view.summary.excludedAgingCount} registros impedem uma média completa; consulte a auditoria.`
        : "Ponderação por saldo da categoria Vencidos, sem cache.",
    ],
    ["Privacidade", "Sem dados de pacientes. Uso interno da seleção local."],
    ...view.bands.map((band) => [`Faixa: ${band.name}`, band.value / 100]),
  ];
  addRows(summary, meta, [], []);
  summary.eachRow((row, index) => {
    if (
      (index > 1 &&
        ["Saldo em aberto selecionado", "Saldo vencido selecionado"].includes(
          String(row.getCell(1).value),
        )) ||
      String(row.getCell(1).value).startsWith("Faixa:")
    )
      row.getCell(2).numFmt = currency;
  });
  const details = workbook.addWorksheet("Duplicatas Detalhadas");
  styleTable(
    details,
    [
      "Cliente",
      "Representante",
      "Duplicata",
      "Parcela",
      "Título completo",
      "Emissão",
      "Vencimento",
      "Dias vencidos",
      "Faixa de Aging",
      "Valor nominal",
      "Desconto",
      "Saldo em aberto",
      "Situação original",
      "Hospital",
      "Plano de saúde",
      "Aba de origem",
      "Linha de origem",
      "Observações",
    ],
    [44, 32, 18, 12, 25, 16, 16, 16, 27, 20, 18, 22, 27, 40, 40, 38, 16, 65],
  );
  addRows(
    details,
    view.rows.map((row) => [
      row.client,
      row.representative,
      row.document,
      row.installment,
      row.title,
      row.issued ? new Date(row.issued + "T00:00:00Z") : null,
      row.due ? new Date(row.due + "T00:00:00Z") : null,
      row.days,
      row.band,
      row.nominalCents === null ? null : row.nominalCents / 100,
      row.discountCents === null ? null : row.discountCents / 100,
      row.openCents === null ? null : row.openCents / 100,
      row.record.category === "overdue"
        ? "Vencidos (inadimplência)"
        : "A Vencer",
      row.hospital,
      row.healthPlan,
      row.record.sheet,
      row.record.row,
      row.observations,
    ]),
    [6, 7],
    [10, 11, 12],
  );
  const total = details.addRow(["Total selecionado"]);
  total.getCell(12).value = {
    formula: `SUM(L2:L${view.rows.length + 1})`,
    result: view.summary.totalOpen / 100,
  };
  total.getCell(12).numFmt = currency;
  total.font = { bold: true, color: { argb: "FFC71925" } };
  const clients = workbook.addWorksheet("Resumo por Cliente");
  styleTable(
    clients,
    [
      "Cliente",
      "Registros",
      "Títulos",
      "Saldo em aberto",
      "Saldo vencido",
      "Aging médio (dias)",
      "Maior atraso (dias)",
      "Participação no saldo selecionado",
    ],
    [48, 16, 16, 24, 24, 23, 23, 26],
  );
  addRows(
    clients,
    view.clients.map((group) => [
      group.name,
      group.recordCount,
      group.titleCount,
      group.totalOpen / 100,
      group.totalOverdue / 100,
      group.agingDays,
      group.maxDelay,
      view.summary.totalOpen ? group.totalOpen / view.summary.totalOpen : null,
    ]),
    [],
    [4, 5],
  );
  clients.getColumn(6).numFmt = "0.00";
  clients.getColumn(8).numFmt = "0.00%";
  const reps = workbook.addWorksheet("Resumo por Representante");
  styleTable(
    reps,
    [
      "Representante",
      "Clientes",
      "Registros",
      "Títulos",
      "Saldo em aberto",
      "Saldo vencido",
      "Participação no saldo selecionado",
    ],
    [48, 16, 16, 16, 24, 24, 26],
  );
  addRows(
    reps,
    view.representatives.map((group) => [
      group.name,
      group.clientCount,
      group.recordCount,
      group.titleCount,
      group.totalOpen / 100,
      group.totalOverdue / 100,
      view.summary.totalOpen ? group.totalOpen / view.summary.totalOpen : null,
    ]),
    [],
    [5, 6],
  );
  reps.getColumn(7).numFmt = "0.00%";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
