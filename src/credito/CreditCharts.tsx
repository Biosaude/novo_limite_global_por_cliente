import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";
import type { CreditClient } from "./types";
import { money, compactMoney, sum } from "../domain/money";
import { EmptyState } from "../components/EmptyState";
export function CreditCharts({ clients }: { clients: CreditClient[] }) {
  const risk = [
    "Baixo",
    "Moderado",
    "Alto",
    "Crítico",
    "Dados insuficientes",
  ].map((name) => ({
    name,
    value: clients.filter((client) => client.risk === name).length,
  }));
  const bands = [
    "1–30 dias",
    "31–60 dias",
    "61–90 dias",
    "Acima de 90 dias",
    "Sem atraso / divergente",
    "Sem vencimento",
  ].map((name, index) => ({
    name,
    value: sum(clients.map((client) => client.bands[index].cents)),
  }));
  const months = new Map<string, number[]>();
  for (const client of clients)
    for (const month of client.payments.months)
      months.set(month.name, [...(months.get(month.name) ?? []), month.value]);
  const monthly = [...months]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => ({ name, value: sum(values) }));
  const comparison = clients
    .slice()
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 8)
    .map((client) => ({
      name: client.name,
      exposure: client.exposure,
      base: client.baseLimit,
    }));
  const overdue = clients
    .slice()
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 8)
    .map((client) => ({ name: client.name, value: client.overdue }));
  const short = (name: string) =>
    name.length > 20 ? name.slice(0, 19) + "…" : name;
  function bars(
    data: Record<string, unknown>[],
    financial = true,
    compare = false,
  ) {
    return (
      <ResponsiveContainer width="100%" height={290}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 12, right: 20, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e3e8f0" />
          <XAxis
            type="number"
            allowDecimals={financial}
            tickFormatter={financial ? compactMoney : undefined}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tickFormatter={short}
            width={125}
            tick={{ fontSize: 10 }}
          />
          <Tooltip
            formatter={(value) =>
              financial ? money(Number(value)) : String(value)
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {compare ? (
            <>
              <Bar
                dataKey="base"
                name="Limite-base provisório (R$)"
                fill="#9aaac1"
                isAnimationActive={false}
              />
              <Bar
                dataKey="exposure"
                name="Exposição atual (R$)"
                fill="#c71925"
                isAnimationActive={false}
              />
            </>
          ) : (
            <Bar
              dataKey="value"
              name={
                financial
                  ? "Exposição vencida (R$)"
                  : "Clientes · risco observado proposto"
              }
              fill={financial ? "#c71925" : "#667994"}
              isAnimationActive={false}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  const specs = [
    {
      title: "Distribuição do risco observado",
      subtitle:
        "Prévia da proposta de critérios; não é risco de crédito completo",
      chart: bars(risk, false),
    },
    {
      title: "Exposição por faixa de atraso",
      subtitle: "Saldos de posição · Vencidos (inadimplência)",
      chart: bars(bands),
    },
    {
      title: "Histórico mensal de recebimentos",
      subtitle: "Somente meses presentes no período YTD selecionado",
      chart: monthly.length ? (
        <ResponsiveContainer width="100%" height={290}>
          <LineChart
            data={monthly}
            margin={{ top: 12, right: 20, left: 10, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e8f0" />
            <XAxis
              dataKey="name"
              tickFormatter={(value) =>
                String(value).slice(5) + "/" + String(value).slice(0, 4)
              }
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickFormatter={compactMoney}
              width={70}
              tick={{ fontSize: 10 }}
            />
            <Tooltip formatter={(value) => money(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              dataKey="value"
              name="Recebido (R$)"
              stroke="#334a6e"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState message="Não há recebimentos datados no período. Nenhuma série foi inventada." />
      ),
    },
    {
      title: "Limite-base estimado e exposição",
      subtitle: `Top 8 por exposição · ${clients.filter((client) => client.baseLimit !== null).length} clientes com base provisória disponível; ausências não são zero`,
      chart: bars(comparison, true, true),
    },
    {
      title: "Maior inadimplência em valor",
      subtitle: "Top 8 · saldos vencidos, sem adicionar recebimentos à dívida",
      chart: bars(overdue),
    },
  ];
  return (
    <section
      className="credit-charts"
      aria-label="Gráficos de análise de crédito"
    >
      {specs.map((spec) => (
        <article className="panel credit-chart" key={spec.title}>
          <div className="panel-title">
            <div>
              <h2>{spec.title}</h2>
              <p>{spec.subtitle}</p>
            </div>
          </div>
          {clients.length ? (
            <div className="credit-chart-content">{spec.chart}</div>
          ) : (
            <EmptyState message="Importe uma base ou ajuste os filtros para visualizar a análise." />
          )}
        </article>
      ))}
    </section>
  );
}
