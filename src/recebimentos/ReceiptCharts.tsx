import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { conditions, type ReceiptView, type Condition } from "./analysis";
import { money, compactMoney, percentage } from "../domain/money";
import { EmptyState } from "../components/EmptyState";
export const receiptColors = {
  early: "#94a6bf",
  ontime: "#334a6e",
  late: "#c71925",
  unknown: "#d3a85c",
};
export function ReceiptCharts({ view }: { view: ReceiptView }) {
  const keys = (Object.keys(conditions) as Condition[]).filter(
    (k) => k !== "unknown" || view.summary.unknownCount > 0,
  );
  const tooltip = (value: unknown) => money(Number(value));
  const bars = (data: ReceiptView["monthly"]) => (
    <ResponsiveContainer width="100%" height={290}>
      <BarChart
        data={data}
        margin={{ left: 12, right: 12, top: 10, bottom: 10 }}
      >
        <CartesianGrid
          vertical={false}
          stroke="#e6ebf3"
          strokeDasharray="3 3"
        />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={compactMoney}
          width={78}
          tick={{ fontSize: 10 }}
        />
        <Tooltip formatter={tooltip} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k) => (
          <Bar
            key={k}
            dataKey={k}
            name={conditions[k]}
            stackId="payments"
            fill={receiptColors[k]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
  return (
    <div className="receipt-charts">
      <section className="panel receipt-chart">
        <h3>Evolução mensal de recebimentos</h3>
        <p className="helper">
          Valores efetivamente recebidos por mês · categorias exclusivas de
          prazo
        </p>
        {view.rows.length ? (
          bars(view.monthly)
        ) : (
          <EmptyState message="Nenhum recebimento no período selecionado." />
        )}
      </section>
      <section className="panel receipt-chart">
        <h3>Participação no consolidado</h3>
        <p className="helper">
          Ajuizamento é um atributo complementar; não é somado novamente.
        </p>
        {view.rows.length &&
        !view.summary.negativeCount &&
        view.summary.total > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={235}>
              <PieChart>
                <Pie
                  data={view.categories.filter((c) => c.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={95}
                  isAnimationActive={false}
                >
                  {view.categories
                    .filter((c) => c.value > 0)
                    .map((c) => (
                      <Cell key={c.key} fill={receiptColors[c.key]} />
                    ))}
                </Pie>
                <Tooltip formatter={tooltip} />
              </PieChart>
            </ResponsiveContainer>
            <div className="receipt-legend">
              {view.categories
                .filter((c) => c.count)
                .map((c) => (
                  <span key={c.key}>
                    <i style={{ background: receiptColors[c.key] }} />
                    {c.name}: {money(c.value)} ·{" "}
                    {percentage(c.value, view.summary.total)}
                  </span>
                ))}
            </div>
          </>
        ) : (
          <EmptyState
            message={
              view.summary.negativeCount
                ? "Composição percentual indisponível: existem recebimentos negativos na seleção."
                : "Sem total positivo para calcular participações."
            }
          />
        )}
      </section>
      <section className="panel receipt-chart">
        <h3>Evolução trimestral</h3>
        <p className="helper">
          Trimestres com registros na seleção · períodos parciais até a posição
          da base
        </p>
        {view.rows.length ? (
          bars(view.quarterly)
        ) : (
          <EmptyState message="Sem dados trimestrais disponíveis." />
        )}
      </section>
      <section className="panel receipt-chart receipt-legal">
        <h3>Recebimentos de títulos ajuizados</h3>
        <strong>
          {view.summary.legalTotal === null
            ? "Dados indisponíveis"
            : money(view.summary.legalTotal)}
        </strong>
        <p>
          Subconjunto complementar dos recebimentos, sem acréscimo ao total.
        </p>
        <p>
          {view.summary.legalKnown} lançamentos com situação conhecida;{" "}
          {view.summary.legalUnknown} sem informação.
        </p>
        <p>
          Exige coluna explícita de ajuizamento e situação confiável vinculada à
          duplicata e parcela. Atraso elevado não comprova ajuizamento.
        </p>
        {view.summary.legalKnown > 0 && view.summary.legalUnknown > 0 && (
          <p className="receipt-warning">
            Cobertura parcial: o valor considera somente os registros
            identificados.
          </p>
        )}
      </section>
    </div>
  );
}
