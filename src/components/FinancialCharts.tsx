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
import { compactMoney, money, percentage } from "../domain/money";
import { categoryLabel } from "../domain/types";
import { EmptyState } from "./EmptyState";
const colors = ["#96a6bf", "#c71925", "#334a6e"];
const short = (name: string) =>
  name.length > 22 ? name.slice(0, 21) + "…" : name;
const tooltip = (denominator: number) => (value: unknown) =>
  `${money(Number(value))} · ${percentage(Number(value), denominator)}`;
function Bars({
  data,
  horizontal = false,
  denominator,
  label = "Limite Global",
  color = colors[2],
  categoryColors = false,
}: {
  data: { name: string; value: number }[];
  horizontal?: boolean;
  denominator: number;
  label?: string;
  color?: string;
  categoryColors?: boolean;
}) {
  return (
    <>
      <ResponsiveContainer width="100%" height={270}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 12, right: 18, bottom: 15, left: 0 }}
        >
          <CartesianGrid
            stroke="#e3e8f0"
            strokeDasharray="3 3"
            vertical={false}
          />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                tickFormatter={compactMoney}
                tick={{ fontSize: 10, fill: "#62748f" }}
              />
              <YAxis
                dataKey="name"
                type="category"
                tickFormatter={short}
                width={113}
                tick={{ fontSize: 10, fill: "#334a6e" }}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#334a6e" }} />
              <YAxis
                tickFormatter={compactMoney}
                tick={{ fontSize: 10, fill: "#62748f" }}
                width={67}
              />
            </>
          )}
          <Tooltip
            formatter={tooltip(denominator)}
            contentStyle={{
              borderRadius: 8,
              borderColor: "#dde3ed",
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="value"
            name={label}
            fill={color}
            radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            isAnimationActive={false}
          >
            {categoryColors &&
              data.map((item, index) => (
                <Cell key={item.name} fill={colors[index % colors.length]} />
              ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        {categoryColors ? (
          data.map((item, index) => (
            <span key={item.name}>
              <i style={{ background: colors[index % colors.length] }} />
              {item.name} · {percentage(item.value, denominator)}
            </span>
          ))
        ) : (
          <span>
            <i style={{ background: color }} />
            {label} (R$) · participação dos itens exibidos:{" "}
            <strong>
              {percentage(
                data.reduce((total, item) => total + item.value, 0),
                denominator,
              )}
            </strong>
          </span>
        )}
      </div>
    </>
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
              <Tooltip formatter={tooltip(summary.global)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            {categories.map((item, index) => (
              <span key={item.name}>
                <i style={{ background: colors[index] }} />
                {item.name}: {money(item.value)} ·{" "}
                {percentage(item.value, summary.global)}
              </span>
            ))}
          </div>
        </>
      ),
    },
    {
      title: "Comparativo financeiro",
      subtitle: `A Vencer, ${categoryLabel.overdue} e Recebido YTD`,
      content: (
        <Bars
          data={categories}
          denominator={summary.global}
          label="Valor financeiro"
          categoryColors
        />
      ),
    },
    {
      title: "Principais clientes",
      subtitle: "Top 8 por Limite Global · ranking completo abaixo",
      content: <Bars data={clients} horizontal denominator={summary.global} />,
    },
    {
      title: "Distribuição por representante",
      subtitle: "Top 8 por Limite Global · tabela completa em Representantes",
      content: reps.some((item) => item.name !== "Sem representante") ? (
        <Bars
          data={reps}
          horizontal
          denominator={summary.global}
          color="#667994"
        />
      ) : (
        <EmptyState message="A planilha não identifica representantes nesta seleção." />
      ),
    },
    {
      title: `Faixas de atraso · ${categoryLabel.overdue}`,
      subtitle: `${categoryLabel.overdue} · referência da posição original`,
      content: (
        <Bars
          data={aging(records, reference)}
          horizontal
          denominator={summary.overdue}
          label={categoryLabel.overdue}
          color={colors[1]}
        />
      ),
    },
    {
      title: "Recebimentos por mês",
      subtitle: "Somente meses presentes nos recebimentos selecionados",
      content: months.length ? (
        <>
          <ResponsiveContainer width="100%" height={270}>
            <LineChart
              data={months}
              margin={{ top: 12, right: 20, bottom: 15, left: 5 }}
            >
              <CartesianGrid stroke="#e3e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis
                tickFormatter={compactMoney}
                tick={{ fontSize: 10 }}
                width={65}
              />
              <Tooltip formatter={tooltip(summary.received)} />
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
          <div className="chart-legend">
            <span>
              <i style={{ background: colors[2] }} />
              Recebido YTD (R$) · percentuais sobre os recebimentos da seleção
              no tooltip
            </span>
          </div>
        </>
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
