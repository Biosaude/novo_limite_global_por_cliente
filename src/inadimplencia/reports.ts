import type { ManagementView, Operations } from "./model";
import { money } from "../domain/money";
import { displayDate } from "../domain/dates";
import { reportNames, type ReportKind } from "./reportConfig";
export { reportNames, type ReportKind } from "./reportConfig";
export function managementReportTables(
  v: ManagementView,
  store: Operations,
  kind: ReportKind,
) {
  if (v.summary.invalid)
    throw new Error("Valores inválidos na seleção; confira a Auditoria.");
  const f = v.filters;
  const summary = {
    name: "Resumo",
    headers: ["Informação", "Resultado"],
    rows: [
      ["Relatório", reportNames[kind]],
      ["Posição financeira", displayDate(v.dataset.reference)],
      ["Origem", v.dataset.filename],
      [
        "Emissão",
        new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date()),
      ],
      [
        "Ano/mês dos recebimentos",
        `${f.year || "Todos"}/${f.month || "Todos"}`,
      ],
      [
        "Cliente / representante",
        `${f.client || "Todos"} / ${f.representative || "Todos"}`,
      ],
      [
        "Status / responsável",
        `${f.status || "Todos"} / ${f.responsible || "Todos"}`,
      ],
      [
        "Faixas de Aging",
        f.bands.length
          ? f.bands.map((b) => v.bands[b].name).join(", ")
          : "Todas",
      ],
      [
        "Ajuizamento",
        f.legal === "yes"
          ? "Com vínculo confirmado"
          : f.legal === "pending"
            ? "Sem vínculo confirmado"
            : "Todos",
      ],
      ["Pesquisa", f.search || "Sem pesquisa"],
      ["Saldo vencido da consulta", money(v.summary.total)],
      ["Registros / títulos", `${v.rows.length} / ${v.titles.length}`],
      [
        "Recebimentos pós-vencimento no período",
        v.summary.recovered === null
          ? "Não disponível"
          : money(v.summary.recovered),
      ],
      [
        "Recebimentos sem dados suficientes de pontualidade",
        String(v.summary.recoveryUnknown),
      ],
      [
        "Taxa de recuperação",
        "Não disponível: sem carteira elegível de abertura conciliada",
      ],
      [
        "Critérios",
        "Saldos fixos da posição. Recebimentos não reduzem o estoque. Etapa principal exclusiva; ajuizamento complementar. Valores da causa não são dívida. Não somar processos com vínculos compartilhados.",
      ],
      [
        "Armazenamento",
        "Tratamentos em memória; exportação sob guarda do responsável. Sem autenticação nova; responsável é declarado. Sem dados de pacientes.",
      ],
    ],
  } as { name: string; headers: string[]; rows: (string | number)[][] };
  const detailRows =
    kind === "process" ? v.rows.filter((r) => r.judicial) : v.rows;
  summary.rows.push([
    "Saldo detalhado neste relatório",
    money(detailRows.reduce((s, r) => s + (r.openCents ?? 0), 0)),
  ]);
  const rows = {
    name: "Pendências e Tratamentos",
    headers: [
      "Cliente",
      "Duplicata",
      "Parcela",
      "Vencimento",
      "Dias",
      "Saldo em aberto",
      "Etapa",
      "Responsável",
      "Última ação",
      "Próxima providência",
      "Data prevista",
      "Processos",
      "Origem",
    ],
    rows: detailRows.map((r) => [
      r.client,
      r.document || r.title,
      r.installment,
      displayDate(r.due),
      r.days ?? "Indeterminado",
      (r.openCents ?? 0) / 100,
      r.treatment?.status ?? "Pendente de classificação",
      r.treatment?.responsible ?? "Não informado",
      r.treatment
        ? `${r.treatment.contactDate} · ${r.treatment.action} · ${r.treatment.result}`
        : "Sem ação registrada",
      r.treatment?.nextStep ?? "",
      r.treatment?.nextDate ? displayDate(r.treatment.nextDate) : "",
      r.processes
        .map(
          (p) =>
            `${p.number} (${p.kind === "judicial" ? "judicial" : "administrativo"})`,
        )
        .join("; "),
      `${r.record.sheet} · linha ${r.record.row}`,
    ]),
  };
  const judicial = {
    name: "Processos Judiciais",
    headers: [
      "Número",
      "Parte interessada",
      "Parte adversa",
      "Tipo de ação",
      "Órgão",
      "Valor da causa",
      "Clientes vinculados",
      "Duplicatas vinculadas",
      "Saldo conciliado",
      "Recebido pós-vencimento vinculado",
      "Status declarado",
      "Responsável",
      "Última atualização",
      "Próxima providência",
      "Fonte",
    ],
    rows: v.processes
      .filter((p) => p.kind === "judicial")
      .map((p) => [
        p.number,
        p.interested,
        p.opponent,
        p.actionType,
        p.court,
        p.claimCents === null ? "Não informado" : p.claimCents / 100,
        [
          ...new Set(
            p.linkedTitles.flatMap((t) => t.rows.map((r) => r.client)),
          ),
        ].join("; "),
        p.linkedTitles
          .flatMap((t) => t.rows.map((r) => r.title || r.document))
          .join("; "),
        p.linksConfirmed ? p.balance / 100 : "Não conciliado",
        p.linksConfirmed ? p.recovered / 100 : "Não conciliado",
        p.status || "Não informado",
        p.responsible,
        new Date(p.createdAt).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }),
        p.nextStep,
        p.source,
      ]),
  };
  const keys = new Set(v.titles.map((t) => t.key));
  const history = {
    name: "Histórico de Ações",
    headers: [
      "Cliente / título",
      "Sequência",
      "Registrado em",
      "Contato",
      "Etapa",
      "Responsável",
      "Ação",
      "Resultado",
      "Próxima providência",
      "Data prevista",
      "Observações",
      "Referência do acordo",
      "Valor do acordo",
    ],
    rows: store.actions
      .filter((a) => keys.has(a.titleKey))
      .map((a) => [
        v.titles
          .find((t) => t.key === a.titleKey)!
          .rows.map((r) => `${r.client} / ${r.title || r.document}`)
          .join("; "),
        a.sequence,
        new Date(a.createdAt).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }),
        displayDate(a.contactDate),
        a.status,
        a.responsible,
        a.action,
        a.result,
        a.nextStep,
        a.nextDate ? displayDate(a.nextDate) : "",
        a.notes,
        a.agreementReference,
        a.agreementCents === null ? "Não informado" : a.agreementCents / 100,
      ]),
  };
  return kind === "pending"
    ? [summary, rows]
    : kind === "treatment"
      ? [summary, rows, history]
      : [summary, rows, judicial];
}
export async function managementExcel(
  v: ManagementView,
  store: Operations,
  kind: ReportKind,
) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Biosaúde";
  for (const t of managementReportTables(v, store, kind)) {
    const s = wb.addWorksheet(t.name);
    s.addRow(t.headers);
    t.rows.forEach((r) => s.addRow(r));
    s.views = [{ state: "frozen", ySplit: 1 }];
    s.autoFilter = {
      from: "A1",
      to: { row: Math.max(1, s.rowCount), column: t.headers.length },
    };
    s.columns.forEach((c, i) => {
      c.width = i === 0 ? 35 : 27;
    });
    s.getRow(1).eachCell((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1D2C47" },
      };
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
    s.eachRow((r, n) => {
      if (n > 1)
        r.eachCell((c, i) => {
          c.alignment = { wrapText: true, vertical: "top" };
          if (
            typeof c.value === "number" &&
            /saldo|valor|recebido/i.test(t.headers[i - 1])
          )
            c.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        });
    });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
export async function managementPdf(
  v: ManagementView,
  store: Operations,
  kind: ReportKind,
  font: string,
) {
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
  doc.setProperties({ title: reportNames[kind], author: "Biosaúde" });
  let y = 32;
  for (const t of managementReportTables(v, store, kind)) {
    if (y > 160) {
      doc.addPage();
      y = 32;
    }
    doc.setFontSize(11);
    doc.setTextColor(29, 44, 71);
    doc.text(t.name, 12, y);
    autoTable(doc, {
      startY: y + 4,
      head: [t.headers],
      body: t.rows.map((r) =>
        r.map((value, i) =>
          typeof value === "number" &&
          /saldo|valor|recebido/i.test(t.headers[i])
            ? money(Math.round(value * 100))
            : String(value),
        ),
      ),
      styles: {
        font: "Biosaude",
        fontStyle: "normal",
        fontSize: t.headers.length > 6 ? 6 : 8,
        overflow: "linebreak",
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [29, 44, 71],
        textColor: [255, 255, 255],
        fontStyle: "normal",
      },
      margin: { left: 12, right: 12, top: 32, bottom: 18 },
      rowPageBreak: "avoid",
    });
    y =
      (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 10;
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(13);
    doc.setTextColor(29, 44, 71);
    doc.text("BIOSAÚDE • Gestão da Inadimplência", 12, 15);
    doc.setDrawColor(199, 25, 37);
    doc.line(12, 22, 285, 22);
    doc.setFontSize(7);
    doc.text(
      `Posição ${displayDate(v.dataset.reference)} • Sem dados de pacientes`,
      12,
      202,
    );
    doc.text(`Página ${i} de ${n}`, 285, 202, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
