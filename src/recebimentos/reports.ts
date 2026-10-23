import {
  conditions,
  legalLabels,
  receiptFilterLabels,
  quarterVariation,
  type ReceiptView,
} from "./analysis";
import { displayDate } from "../domain/dates";
import { money } from "../domain/money";
export function receiptReportTables(view: ReceiptView, issuedAt: string) {
  if (!view.rows.length || view.summary.invalidAmounts)
    throw new Error("Não há uma seleção financeira válida para exportar.");
  const stamp = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(issuedAt));
  return [
    {
      name: "Resumo Financeiro",
      headers: ["Indicador", "Resultado"],
      rows: [
        ["Origem", view.filename],
        ["Posição limite", displayDate(view.reference)],
        ["Emissão", stamp],
        ...receiptFilterLabels(view),
        ["Recebido total", money(view.summary.total)],
        [
          "Lançamentos / títulos",
          `${view.summary.count} / ${view.summary.titles}`,
        ],
        ["Clientes", String(view.summary.clients)],
        [
          "Recebido ajuizado — subconjunto",
          view.summary.legalTotal === null
            ? "Dados indisponíveis"
            : money(view.summary.legalTotal),
        ],
        [
          "Cobertura do ajuizamento",
          `${view.summary.legalKnown} conhecidos; ${view.summary.legalUnknown} sem informação`,
        ],
        [
          "Registros fora da posição ou sem recebimento válido",
          String(view.excludedDates),
        ],
        [
          "Metodologia",
          "Valores efetivamente recebidos por lançamento, sem deduplicar pagamentos parciais. Datas de recebimento efetivas; ajuizamento não é somado novamente.",
        ],
        [
          "Privacidade",
          "Sem dados de pacientes. Datas, valores e origem rastreáveis no detalhamento.",
        ],
      ],
    },
    {
      name: "Classificação",
      headers: ["Condição", "Valor recebido", "Lançamentos"],
      rows: view.categories.map((c) => [c.name, c.value / 100, c.count]),
    },
    {
      name: "Evolução Mensal",
      headers: [
        "Mês",
        "Antecipado",
        "Em dia",
        "Pós-inadimplência",
        "Prazo indeterminado",
        "Total",
      ],
      rows: view.monthly.map((p) => [
        p.name,
        p.early / 100,
        p.ontime / 100,
        p.late / 100,
        p.unknown / 100,
        p.total / 100,
      ]),
    },
    {
      name: "Evolução Trimestral",
      headers: [
        "Trimestre",
        "Antecipado",
        "Em dia",
        "Pós-inadimplência",
        "Prazo indeterminado",
        "Total",
      ],
      rows: view.quarterly.map((p) => [
        p.name,
        p.early / 100,
        p.ontime / 100,
        p.late / 100,
        p.unknown / 100,
        p.total / 100,
      ]),
    },
    {
      name: "Comparativo por Categoria",
      headers: [
        "Categoria",
        "Trimestre",
        "Valor recebido",
        "Variação vs anterior disponível",
      ],
      rows: view.categories.flatMap((c) =>
        view.quarterly.map((q, i) => {
          const variation = quarterVariation(
            q[c.key],
            i ? view.quarterly[i - 1][c.key] : null,
          );
          return [
            c.name,
            q.name,
            q[c.key] / 100,
            variation === null
              ? "Não aplicável"
              : variation.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                }) + "%",
          ];
        }),
      ),
    },
    {
      name: "Resumo por Cliente",
      headers: ["Cliente", "Valor recebido", "Lançamentos", "Títulos"],
      rows: view.clients.map((g) => [g.name, g.total / 100, g.count, g.titles]),
    },
    {
      name: "Resumo por Representante",
      headers: ["Representante", "Valor recebido", "Lançamentos", "Títulos"],
      rows: view.representatives.map((g) => [
        g.name,
        g.total / 100,
        g.count,
        g.titles,
      ]),
    },
    {
      name: "Duplicatas Recebidas",
      headers: [
        "Cliente",
        "Representante",
        "Duplicata",
        "Parcela",
        "Título completo",
        "Emissão",
        "Vencimento",
        "Recebimento",
        "Dias (negativo = antecipação)",
        "Valor recebido",
        "Condição",
        "Ajuizamento",
        "Evidência de ajuizamento",
        "Aba / linha",
      ],
      rows: view.rows.map((r) => [
        r.client,
        r.representative,
        r.document,
        r.installment,
        r.title,
        displayDate(r.issued),
        displayDate(r.due),
        displayDate(r.received),
        r.days ?? "Indeterminado",
        r.cents! / 100,
        conditions[r.condition],
        legalLabels[r.legal],
        r.legalSource ?? "Sem campo confiável",
        `${r.record.sheet} / ${r.record.row}`,
      ]),
    },
  ] satisfies {
    name: string;
    headers: string[];
    rows: (string | number)[][];
  }[];
}
export async function createReceiptsExcel(
  view: ReceiptView,
  issuedAt = new Date().toISOString(),
): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Biosaúde";
  wb.created = new Date(issuedAt);
  for (const table of receiptReportTables(view, issuedAt)) {
    const sheet = wb.addWorksheet(table.name);
    sheet.addRow(table.headers);
    table.rows.forEach((row) => sheet.addRow(row));
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: table.headers.length },
    };
    sheet.columns.forEach((col, i) => {
      col.width =
        table.name === "Resumo Financeiro"
          ? i === 0
            ? 42
            : 100
          : i < 2
            ? 40
            : 24;
    });
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1D2C47" },
      };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    });
    sheet.eachRow((row, n) => {
      if (n > 1)
        row.eachCell((cell, i) => {
          cell.alignment = { vertical: "top", wrapText: true };
          if (
            typeof cell.value === "number" &&
            /valor|total|antecipado|em dia|inadimplência|indeterminado/i.test(
              table.headers[i - 1],
            ) &&
            !table.headers[i - 1].startsWith("Dias")
          )
            cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        });
    });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
export async function createReceiptsPdf(
  view: ReceiptView,
  font: string,
  issuedAt = new Date().toISOString(),
): Promise<Uint8Array> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({
    orientation: "landscape",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  doc.addFileToVFS("DejaVuSans.ttf", font);
  doc.addFont("DejaVuSans.ttf", "Biosaude", "normal");
  doc.setFont("Biosaude");
  doc.setCreationDate(new Date(issuedAt));
  doc.setProperties({
    title: "Análise de Recebimentos — Biosaúde",
    author: "Biosaúde",
  });
  let y = 34;
  for (const table of receiptReportTables(view, issuedAt)) {
    if (y > 162) {
      doc.addPage();
      y = 34;
    }
    doc.setFontSize(11);
    doc.setTextColor(29, 44, 71);
    doc.text(table.name, 12, y);
    autoTable(doc, {
      startY: y + 4,
      head: [table.headers],
      body: table.rows.map((row) =>
        row.map((value, i) =>
          typeof value === "number" &&
          /valor|total|antecipado|em dia|inadimplência|indeterminado/i.test(
            table.headers[i],
          ) &&
          !table.headers[i].startsWith("Dias")
            ? money(Math.round(value * 100))
            : String(value),
        ),
      ),
      styles: {
        font: "Biosaude",
        fontStyle: "normal",
        fontSize: table.name === "Duplicatas Recebidas" ? 6 : 8,
        overflow: "linebreak",
        cellPadding: 2,
        textColor: [29, 44, 71],
      },
      headStyles: {
        fillColor: [29, 44, 71],
        textColor: [255, 255, 255],
        fontStyle: "normal",
      },
      margin: { left: 12, right: 12, top: 34, bottom: 18 },
      rowPageBreak: "avoid",
    });
    y =
      (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 10;
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("Biosaude");
    doc.setFontSize(14);
    doc.setTextColor(29, 44, 71);
    doc.text("BIOSAÚDE • Análise de Recebimentos", 12, 15);
    doc.setDrawColor(199, 25, 37);
    doc.line(12, 22, 285, 22);
    doc.setFontSize(7);
    doc.text(
      `Posição ${displayDate(view.reference)} • Uso interno • Sem dados de pacientes`,
      12,
      202,
    );
    doc.text(`Página ${p} de ${pages}`, 285, 202, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
