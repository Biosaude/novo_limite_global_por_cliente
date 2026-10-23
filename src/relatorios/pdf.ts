import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CollectionView } from "../cobranca/query";
import { reportFilters } from "../cobranca/query";
import { money } from "../domain/money";
import { displayDate } from "../domain/dates";
const navy: [number, number, number] = [29, 44, 71];
export function createCollectionPdf(
  view: CollectionView,
  fontBase64: string,
  issuedAt = new Date().toISOString(),
): Uint8Array {
  if (!view.rows.length || view.summary.invalidAmounts)
    throw new Error("Não há uma seleção financeira válida para exportar.");
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  doc.addFileToVFS("DejaVuSans.ttf", fontBase64);
  doc.addFont("DejaVuSans.ttf", "Biosaude", "normal");
  doc.setFont("Biosaude");
  doc.setProperties({
    title: "Relatório de Pendências Financeiras — Aging de Duplicatas",
    author: "Biosaúde Produtos Hospitalares",
  });
  doc.setCreationDate(new Date(issuedAt));
  doc.setFontSize(17);
  doc.setTextColor(...navy);
  doc.text("Relatório de Pendências Financeiras", 12, 39);
  doc.setFontSize(10);
  doc.text("Aging de Duplicatas • Contexto de cobrança", 12, 46);
  const stamp = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(issuedAt));
  const baseStyles = {
    font: "Biosaude",
    fontStyle: "normal" as const,
    fontSize: 8,
    cellPadding: 2,
    overflow: "linebreak" as const,
    textColor: navy,
  };
  autoTable(doc, {
    startY: 52,
    head: [["Referência e filtros", "Aplicados à consulta"]],
    body: [
      ["Emissão", stamp],
      ["Data-base financeira", displayDate(view.reference)],
      ["Origem", view.filename],
      ...reportFilters(view).map((value) => ["Filtro", value]),
    ],
    styles: baseStyles,
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255],
      fontStyle: "normal",
    },
    margin: { top: 32, bottom: 20, left: 12, right: 12 },
    columnStyles: { 0: { cellWidth: 45 } },
    pageBreak: "avoid",
  });
  let last = () =>
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  autoTable(doc, {
    startY: last() + 6,
    head: [["Resumo executivo", "Resultado"]],
    body: [
      ["Saldo em aberto selecionado", money(view.summary.totalOpen)],
      ["Saldo vencido selecionado", money(view.summary.totalOverdue)],
      [
        "Registros / títulos identificados",
        `${view.summary.recordCount} / ${view.summary.titleCount}`,
      ],
      ["Clientes", String(view.summary.clientCount)],
      [
        "Aging ponderado",
        view.summary.agingDays === null
          ? "Não aplicável"
          : `${view.summary.agingDays.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dias`,
      ],
      ["Maior atraso — Vencidos", `${view.summary.maxDelay} dias`],
      ...view.bands.map((band) => [band.name, money(band.value)]),
    ],
    styles: baseStyles,
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255],
      fontStyle: "normal",
    },
    margin: { top: 32, bottom: 20, left: 12, right: 12 },
    pageBreak: "avoid",
  });
  autoTable(doc, {
    startY: last() + 6,
    head: [
      [
        "Cliente",
        "Duplicata",
        "Parcela",
        "Vencimento",
        "Dias vencidos",
        "Saldo em aberto",
        "Representante",
      ],
    ],
    body: view.rows.map((row) => [
      row.client,
      row.document || row.title || "Não informado",
      row.installment || "Não informada",
      displayDate(row.due),
      row.days === null ? "Indeterminado" : String(row.days),
      row.openCents === null ? "Inválido" : money(row.openCents),
      row.representative,
    ]),
    foot: [
      [
        "TOTAL SELECIONADO",
        `${view.summary.recordCount} registros`,
        `${view.summary.titleCount} títulos`,
        "",
        "",
        money(view.summary.totalOpen),
        "",
      ],
    ],
    showFoot: "lastPage",
    styles: baseStyles,
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255],
      fontStyle: "normal",
    },
    footStyles: {
      fillColor: [255, 241, 242],
      textColor: [199, 25, 37],
      fontStyle: "normal",
    },
    columnStyles: {
      0: { cellWidth: 72 },
      1: { cellWidth: 28 },
      2: { cellWidth: 17 },
      3: { cellWidth: 25 },
      4: { cellWidth: 23 },
      5: { cellWidth: 36 },
      6: { cellWidth: 72 },
    },
    margin: { top: 32, bottom: 22, left: 12, right: 12 },
    rowPageBreak: "avoid",
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("Biosaude");
    doc.setTextColor(...navy);
    doc.setFontSize(12);
    doc.text("Biosaúde Produtos Hospitalares", 12, 12);
    doc.setFontSize(8);
    doc.text(
      "Relatório de Pendências Financeiras — Aging de Duplicatas",
      12,
      19,
    );
    doc.text(
      `Emissão: ${stamp} • Data-base: ${displayDate(view.reference)}`,
      12,
      25,
    );
    doc.setDrawColor(199, 25, 37);
    doc.line(12, 28, 285, 28);
    doc.setFontSize(7);
    doc.text(
      `Base ${displayDate(view.reference)} • Uso interno • Sem dados de pacientes`,
      12,
      198,
    );
    doc.text(`Página ${page} de ${pages}`, 285, 198, { align: "right" });
    doc.setFontSize(6.5);
    doc.text(
      "Saldos da posição original. Filtros e faixas da consulta; recebimentos não compõem o saldo. Não autoriza crédito.",
      12,
      204,
    );
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
export async function loadPdfFont(): Promise<string> {
  const response = await fetch(
    new URL("./assets/DejaVuSans.ttf", import.meta.url),
  );
  if (!response.ok)
    throw new Error("Não foi possível carregar a fonte local do PDF.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
