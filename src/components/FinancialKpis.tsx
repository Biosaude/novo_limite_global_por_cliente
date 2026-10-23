import { ArrowDownLeft, ArrowUpRight, CalendarDays, Clock3, Wallet } from "lucide-react";
import type { FinancialRecord, Totals } from "../domain/types";
import { categoryLabel } from "../domain/types";
import { weightedOverdueAging } from "../domain/finance";
import { displayDate } from "../domain/dates";
import { money, percentage } from "../domain/money";

export function FinancialKpis({ records, summary, reference, loaded }: {
  records: FinancialRecord[]; summary: Totals; reference: string; loaded: boolean;
}) {
  const aging = weightedOverdueAging(records, reference);
  const cards = [
    { key: "exposure", title: "Exposição Financeira Total", icon: Wallet,
      description: "Saldos em aberto da posição; sem recebimentos" },
    { key: "upcoming", title: "A Vencer", icon: CalendarDays,
      description: "Saldo em aberto da aba A Vencer" },
    { key: "overdue", title: categoryLabel.overdue, icon: ArrowUpRight,
      description: "Saldo em aberto da aba de vencidos" },
    { key: "received", title: "Recebido YTD", icon: ArrowDownLeft,
      description: "Recebimentos efetivos no exercício até o corte selecionado" },
  ] as const;
  return <>
    <section className="kpi-grid financial-kpis" aria-label="Indicadores financeiros">
      {cards.map(({ key, title, icon: Icon, description }) =>
        <article className={`kpi ${key}${key === "exposure" ? " global" : ""}`} key={key}>
          <div className="kpi-label">{title}<span><Icon size={19} /></span></div>
          <div className="kpi-value" aria-label={`${title}: ${loaded ? money(summary[key]) : "sem dados"}`}>
            {loaded ? money(summary[key]) : <>—<small>BRL</small></>}
          </div>
          <p>{description}</p>
          <div className="kpi-footer">
            <span>{loaded ? `${records.filter(r => key === "exposure" ? r.category !== "received" : r.category === key).length.toLocaleString("pt-BR")} registros` : "Aguardando base"}</span>
            {(key === "upcoming" || key === "overdue") && <span>
              {key === "overdue" ? "Inadimplência: " : "Participação: "}
              {loaded ? summary.exposure === 0 ? "Não aplicável" : percentage(summary[key], summary.exposure) : "—"}
            </span>}
          </div>
        </article>)}
      <article className="kpi aging-average">
        <div className="kpi-label">Aging Médio dos Vencidos<span><Clock3 size={19} /></span></div>
        <div className="kpi-value" aria-label="Aging Médio dos Vencidos">
          {!loaded ? "—" : aging.days === null ? "Não aplicável" : <>{new Intl.NumberFormat("pt-BR", {maximumFractionDigits: 2}).format(aging.days)} <small>dias</small></>}
        </div>
        <p>Idade média ponderada pelo saldo de cada lançamento vencido.</p>
        <div className="kpi-footer"><span>{loaded ? `${aging.eligibleCount.toLocaleString("pt-BR")} registros elegíveis` : "Aguardando base"}</span><span>{loaded ? `Posição: ${displayDate(reference)}` : "—"}</span></div>
        {aging.excludedCount > 0 && <p role="status" className="aging-data-warning">Média indisponível: {aging.excludedCount} registros com saldo inválido/negativo, sem vencimento ou sem atraso positivo. Confira a Auditoria; uma média parcial não foi publicada.</p>}
      </article>
    </section>
    <p className="definition">
      Exposição Financeira Total representa a dívida atual, não um limite de crédito aprovado.
      Os saldos seguem as abas da posição importada; vencimento na data-base não é atraso.
      Divergências de classificação são preservadas e sinalizadas na Auditoria.
    </p>
  </>;
}
