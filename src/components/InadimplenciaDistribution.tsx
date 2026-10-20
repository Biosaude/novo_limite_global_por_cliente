import type { FinancialRecord } from "../domain/types";
import { categoryLabel } from "../domain/types";
import { aging } from "../domain/finance";
import { displayDate } from "../domain/dates";
import { money, percentage } from "../domain/money";
export function InadimplenciaDistribution({
  records,
  reference,
  loaded,
  overdue,
}: {
  records: FinancialRecord[];
  reference: string;
  loaded: boolean;
  overdue: number;
}) {
  const bands = aging(records, reference);
  // As mesmas faixas do gráfico, sem reclassificar títulos nem criar posições históricas.
  const displayed = bands
    .map((band, index) => ({ ...band, bandIndex: index }))
    .filter(
      (band) => (band.bandIndex > 0 && band.bandIndex < 6) || band.value !== 0,
    );
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
      <div className="aging-cards">
        {displayed.map((band) => (
          <article
            className={`aging-card aging-band-${band.bandIndex}`}
            key={band.name}
          >
            <div>
              <h3>{band.name}</h3>
              <span>{loaded ? percentage(band.value, overdue) : "—"}</span>
            </div>
            <strong>{loaded ? money(band.value) : "—"}</strong>
            <p>Participação em {categoryLabel.overdue}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
