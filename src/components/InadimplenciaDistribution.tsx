import type { FinancialRecord } from "../domain/types";
import { categoryLabel } from "../domain/types";
import { agingBandNames, type AgingBandIndex } from "../domain/agingBands";
import { aging } from "../domain/finance";
import { displayDate } from "../domain/dates";
import { money, percentage } from "../domain/money";
export function InadimplenciaDistribution({
  records,
  reference,
  loaded,
  overdue,
  selectedBands,
  onToggleBand,
  onClearBands,
}: {
  records: FinancialRecord[];
  reference: string;
  loaded: boolean;
  overdue: number;
  selectedBands: AgingBandIndex[];
  onToggleBand: (band: AgingBandIndex) => void;
  onClearBands: () => void;
}) {
  const bands = aging(records, reference);
  // As mesmas faixas do gráfico, sem reclassificar títulos nem criar posições históricas.
  const displayed = bands
    .map((band, index) => ({ ...band, bandIndex: index }))
    .filter(
      (band) => (band.bandIndex > 0 && band.bandIndex < 6) || band.value !== 0,
    );
  const critical = bands[5].value;
  return (
    <section
      className="aging-distribution"
      aria-label={`Distribuição de ${categoryLabel.overdue}`}
    >
      <div className="distribution-heading">
        <h2>Distribuição de {categoryLabel.overdue}</h2>
        <p>
          Faixas exclusivas ·{" "}
          {loaded ? `posição de ${displayDate(reference)}` : "aguardando base"}{" "}
          · sem somar posições históricas
        </p>
      </div>
      <div className="aging-selection" aria-label="Faixas de cobrança selecionadas">
        <p className="helper">Selecione uma ou várias faixas para a consulta de cobrança. Os KPIs e as participações abaixo mantêm os filtros principais.</p>
        {selectedBands.map(index => <button className="aging-filter-chip" key={index} onClick={() => onToggleBand(index)} aria-label={`Remover faixa ${agingBandNames[index]}`}>{agingBandNames[index]} ×</button>)}
        {!!selectedBands.length && <button className="text-button" onClick={onClearBands}>Limpar faixas</button>}
      </div>
      <div className="aging-cards">
        {displayed.map((band) => (
          <button type="button"
            className={`aging-card aging-band-${band.bandIndex}${selectedBands.includes(band.bandIndex as AgingBandIndex) ? " selected" : ""}`}
            key={band.name}
            aria-label={`Filtrar faixa ${band.name}`}
            aria-pressed={selectedBands.includes(band.bandIndex as AgingBandIndex)}
            disabled={!loaded || band.bandIndex < 1 || band.bandIndex > 5}
            onClick={() => onToggleBand(band.bandIndex as AgingBandIndex)}
          >
            <div>
              <h3>{band.name}</h3>
              <span>{loaded ? percentage(band.value, overdue) : "—"}</span>
            </div>
            <strong>{loaded ? money(band.value) : "—"}</strong>
            <p>Participação em {categoryLabel.overdue}</p>
            <div className="kpi-formula">Cálculo: Σ Saldos vencidos na faixa / Total Vencido × 100</div>
          </button>
        ))}
      </div>
      <div className="aging-share-panel panel" aria-label="Participação por faixa de atraso">
        <h3>Participação das faixas no total vencido</h3>
        <p className="helper">Cada barra usa o total vencido da seleção como denominador.</p>
        {displayed.map(band => <button type="button" className={`aging-share-row${selectedBands.includes(band.bandIndex as AgingBandIndex) ? " selected" : ""}`} key={band.name}
          aria-label={`Filtrar barra ${band.name}`} aria-pressed={selectedBands.includes(band.bandIndex as AgingBandIndex)}
          disabled={!loaded || band.bandIndex < 1 || band.bandIndex > 5} onClick={() => onToggleBand(band.bandIndex as AgingBandIndex)}>
          <span>{band.name}</span>
          <div className="aging-share-track" aria-hidden="true">
            <div className={`aging-share-fill aging-fill-${band.bandIndex}`} style={{width: `${loaded && overdue > 0 ? Math.max(0, Math.min(100, band.value / overdue * 100)) : 0}%`}} />
          </div>
          <strong>{loaded ? percentage(band.value, overdue) : "—"}</strong>
          <span>{loaded ? money(band.value) : "—"}</span>
        </button>)}
        {loaded && (overdue < 0 || displayed.some(band => band.value < 0)) && <p className="helper">Valores negativos preservados nos números; as barras mostram apenas participações positivas. Confira a Auditoria.</p>}
      </div>
      <aside className="critical-concentration" aria-label="Concentração de inadimplência acima de 180 dias">
        <div><h3>Concentração de inadimplência acima de 180 dias</h3>
          <p>Participação do saldo acima de 180 dias no total vencido. Este indicador não determina bloqueio de clientes.</p>
          <div className="kpi-formula">Cálculo: Saldo Vencido Acima de 180 Dias ÷ Total Vencido × 100</div>
        </div>
        <strong>{loaded ? overdue === 0 ? "Não aplicável" : percentage(critical, overdue) : "—"}</strong>
      </aside>
    </section>
  );
}
