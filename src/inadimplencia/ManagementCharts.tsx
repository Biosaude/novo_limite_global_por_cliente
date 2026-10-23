import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { ManagementView } from "./model";
import { money, compactMoney, percentage } from "../domain/money";
import { EmptyState } from "../components/EmptyState";
import { DonutTotal } from "../components/DonutTotal";
export function ManagementCharts({ view: v }: { view: ManagementView }) {
  const chart = (
    data: { name: string; value: number }[],
    horizontal = false,
  ) => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ left: 8, right: 16, top: 12, bottom: 8 }}
      >
        <CartesianGrid
          stroke="#e5eaf2"
          strokeDasharray="3 3"
          vertical={false}
        />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={compactMoney} />
            <YAxis
              type="category"
              dataKey="name"
              width={145}
              tick={{ fontSize: 11 }}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={compactMoney} width={78} />
          </>
        )}
        <Tooltip formatter={(value) => money(Number(value))} />
        <Bar
          dataKey="value"
          name="Valor financeiro"
          fill="#c71925"
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
  const legal = v.summary.judicial;
  const canPie =
    legal !== null &&
    v.summary.total > 0 &&
    legal >= 0 &&
    legal <= v.summary.total &&
    v.rows.every((r) => (r.openCents ?? 0) >= 0);
  return (
    <div className="management-charts">
      <section className="panel">
        <h3>Distribuição por faixa de Aging</h3>
        {v.rows.length ? (
          chart(v.bands.slice(1, 6))
        ) : (
          <EmptyState message="Sem carteira vencida na seleção." />
        )}
      </section>
      <section className="panel">
        <h3>Carteira por etapa de tratamento</h3>
        <p className="helper">
          Uma etapa principal por título; inclui pendentes de classificação.
        </p>
        {v.rows.length ? (
          chart(
            v.stages.filter((s) => s.count),
            true,
          )
        ) : (
          <EmptyState />
        )}
      </section>
      <section className="panel">
        <h3>Evolução da recuperação financeira</h3>
        <p className="helper">
          Recebimentos líquidos pós-vencimento no período. Não são abatidos do
          saldo da posição.
        </p>
        {v.monthly.length ? (
          chart(v.monthly)
        ) : (
          <EmptyState message="Nenhum recebimento pós-vencimento na seleção." />
        )}
      </section>
      <section className="panel">
        <h3>Participação dos processos judicializados</h3>
        <p className="helper">
          Somente saldos vinculados com confirmação; o restante não tem vínculo
          confirmado. Cobertura parcial, sem presumir ausência de ação judicial.
        </p>
        {canPie ? (
          <><div className="donut-shell">
            <DonutTotal value={v.summary.total} label="Carteira" />
            <ResponsiveContainer width="100%" height={270}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Vínculo judicial confirmado", value: legal },
                    {
                      name: "Sem vínculo confirmado",
                      value: v.summary.total - legal,
                    },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={95}
                  isAnimationActive={false}
                >
                  <Cell fill="#c71925" />
                  <Cell fill="#94a6bf" />
                </Pie>
                <Tooltip formatter={(value) => `${money(Number(value))} · ${percentage(Number(value),v.summary.total)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div><div className="chart-legend" aria-label="Participação judicial selecionada"><span>Vínculo judicial confirmado: {money(legal)} · {percentage(legal,v.summary.total)}</span><span>Sem vínculo confirmado: {money(v.summary.total-legal)} · {percentage(v.summary.total-legal,v.summary.total)}</span></div></>
        ) : (
          <EmptyState message="Não disponível: sem conciliação judicial suficiente ou proporção válida." />
        )}
      </section>
    </div>
  );
}
