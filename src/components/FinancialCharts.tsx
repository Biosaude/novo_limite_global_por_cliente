import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import type { FinancialRecord, Totals } from "../domain/types";
import { groupBy, aging, monthly } from "../domain/finance";
import { compactMoney, money } from "../domain/money";
import { categoryLabel } from "../domain/types";
import { EmptyState } from "./EmptyState";
const colors = ["#2b8468", "#d59b4e", "#698bc2"];
const short = (name: string) =>
  name.length > 22 ? name.slice(0, 21) + "…" : name;
const tooltip = (value: unknown) => money(Number(value));
function Bars({
  data,
  horizontal = false,
}: {
  data: { name: string; value: number }[];
  horizontal?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 12, right: 20, bottom: 15, left: horizontal ? 50 : 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tickFormatter={compactMoney}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              dataKey="name"
              type="category"
              tickFormatter={short}
              width={105}
              tick={{ fontSize: 10 }}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis
              tickFormatter={compactMoney}
              tick={{ fontSize: 10 }}
              width={65}
            />
          </>
        )}
        <Tooltip formatter={tooltip} />
        <Bar
          dataKey="value"
          name="Valor"
          fill={colors[0]}
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
export function FinancialCharts({
  records,
  summary,
  reference,
  loaded,
}: {
  records: FinancialRecord[];
  summary: Totals;
  reference: string;
  loaded: boolean;
}) {
  const categories = (["upcoming", "overdue", "received"] as const).map(
    (key) => ({
      name: key === "received" ? "Recebido YTD" : categoryLabel[key],
      value: summary[key],
    }),
  );
  const clients = groupBy(records, "client")
    .slice(0, 8)
    .map((group) => ({ name: group.name, value: group.global }));
  const reps = groupBy(records, "representative")
    .slice(0, 8)
    .map((group) => ({ name: group.name, value: group.global }));
  const months = monthly(records);
  const specs = [
    {
      title: "Composição do Limite Global",
      subtitle: "Participação de cada categoria financeira",
      content: categories.some((item) => item.value < 0) ? (
        <p className="chart-explanation">
          A base contém valores negativos. Consulte o comparativo: um gráfico de
          composição não representa corretamente valores com sinais distintos.
        </p>
      ) : categories.every((item) => item.value === 0) ? (
        <EmptyState message="Os valores desta seleção são zero; não há composição percentual." />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={225}>
            <PieChart>
              <Pie
                data={categories}
                dataKey="value"
                nameKey="name"
                innerRadius={57}
                outerRadius={85}
                paddingAngle={3}
                isAnimationActive={false}
              >
                {categories.map((item, index) => (
                  <Cell key={item.name} fill={colors[index]} />
                ))}
              </Pie>
              <Tooltip formatter={tooltip} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            {categories.map((item, index) => (
              <span key={item.name}>
                <i style={{ background: colors[index] }} />
                {item.name}: {money(item.value)}
              </span>
            ))}
          </div>
        </>
      ),
    },
    {
      title: "Comparativo financeiro",
      subtitle: "A Vencer, Vencido e Recebido YTD",
      content: <Bars data={categories} />,
    },
    {
      title: "Principais clientes",
      subtitle: "Top 8 por Limite Global · ranking completo abaixo",
      content: <Bars data={clients} horizontal />,
    },
    {
      title: "Distribuição por representante",
      subtitle: "Top 8 por Limite Global · tabela completa em Representantes",
      content: reps.some((item) => item.name !== "Sem representante") ? (
        <Bars data={reps} horizontal />
      ) : (
        <EmptyState message="A planilha não identifica representantes nesta seleção." />
      ),
    },
    {
      title: "Faixas de atraso",
      subtitle: "Saldos vencidos · referência da posição original",
      content: <Bars data={aging(records, reference)} horizontal />,
    },
    {
      title: "Recebimentos por mês",
      subtitle: "Somente meses presentes nos recebimentos selecionados",
      content: months.length ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={months}
            margin={{ top: 12, right: 20, bottom: 15, left: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis
              tickFormatter={compactMoney}
              tick={{ fontSize: 10 }}
              width={65}
            />
            <Tooltip formatter={tooltip} />
            <Line
              type="linear"
              dataKey="value"
              name="Recebido"
              stroke={colors[2]}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState message="Não há datas de recebimento na seleção. Nenhuma série histórica foi inventada." />
      ),
    },
  ];
  return (
    <section className="chart-grid" aria-label="Visualizações financeiras">
      {specs.map((spec, index) => (
        <article className="panel chart-panel" key={spec.title}>
          <div className="panel-title">
            <div>
              <h2>{spec.title}</h2>
              <p>{spec.subtitle}</p>
            </div>
            <span className="chart-number">0{index + 1}</span>
          </div>
          <div className="chart-content">
            {!loaded ? (
              <EmptyState />
            ) : !records.length ? (
              <EmptyState message="Nenhum registro corresponde aos filtros selecionados." />
            ) : (
              spec.content
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
