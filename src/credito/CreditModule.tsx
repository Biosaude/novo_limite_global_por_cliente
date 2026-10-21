import { useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { daysBetween } from "../domain/dates";
import { Wallet, ShieldCheck, Clock, ChartNoAxesCombined } from "lucide-react";
import type { Dataset, Filters, FinancialRecord } from "../domain/types";
import type { CreditConfig, CreditClient, PolicyProposal } from "./types";
import { analyzeCredit } from "./analysis";
import { proposedConfig, validateConfig } from "./policy";
import { proposalRepository } from "../persistencia/repository";
import { money, sum, percentage } from "../domain/money";
import { CreditCharts } from "./CreditCharts";
import { CreditDetail, days } from "./CreditDetail";
import { PolicyEditor } from "./PolicyEditor";
import { EmptyState } from "../components/EmptyState";
export function CreditModule({
  dataset,
  filters,
  onTrace,
}: {
  dataset: Dataset | null;
  filters: Filters;
  onTrace: (title: string, records: FinancialRecord[]) => void;
}) {
  const [config, setConfig] = useState<CreditConfig>(proposedConfig),
    [proposals, setProposals] = useState<PolicyProposal[]>([]),
    [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState(""),
    [risk, setRisk] = useState(""),
    [clientKey, setClientKey] = useState(""),
    [sort, setSort] = useState("exposure"),
    [ascending, setAscending] = useState(false),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<CreditClient | null>(null);
  useEffect(() => {
    let alive = true;
    proposalRepository
      .list()
      .then((versions) => {
        if (!alive) return;
        if (versions[0]) {
          validateConfig(versions[0].config);
          setConfig(versions[0].config);
        }
        setProposals(versions);
      })
      .catch((error) => {
        if (alive) setLoadError(error.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    setDetail(null);
    setClientKey("");
    setPage(0);
  }, [dataset?.id, filters.client, filters.representative, filters.category]);
  const all = useMemo(
    () => (dataset ? analyzeCredit(dataset, filters, config) : []),
    [dataset, filters, config],
  );
  const clients = all.filter(
    (client) =>
      (!risk || client.risk === risk) &&
      (!clientKey || client.key === clientKey),
  );
  const matched = clients
    .filter((client) =>
      client.name
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => {
      const compare =
        sort === "name"
          ? a.name.localeCompare(b.name, "pt-BR")
          : sort === "risk"
            ? a.risk.localeCompare(b.risk, "pt-BR")
            : (a[sort as "exposure" | "overdue" | "received" | "delinquency"] ??
                -1) -
              (b[sort as "exposure" | "overdue" | "received" | "delinquency"] ??
                -1);
      return ascending ? compare : -compare;
    });
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(matched.length / 20) - 1),
  );
  const exposure = sum(clients.map((client) => client.exposure)),
    overdue = sum(clients.map((client) => client.overdue)),
    received = sum(clients.map((client) => client.received));
  const late = clients
    .flatMap((client) => client.records)
    .filter(
      (row) =>
        row.category === "received" &&
        row.cents !== null &&
        row.cents > 0 &&
        row.received &&
        row.due &&
        row.received > row.due,
    );
  const lateValue = sum(late.map((row) => row.cents!));
  const weightedLate = lateValue
    ? late
        .reduce(
          (total, row) =>
            total.plus(
              new Decimal(row.cents!).times(
                daysBetween(row.received!, row.due!),
              ),
            ),
          new Decimal(0),
        )
        .div(lateValue)
        .toNumber()
    : null;
  const approved =
    clients.length > 0 &&
    clients.every((client) => client.availableOperational !== null);
  const cards = [
    {
      title: "Limite recomendado",
      value: "Pendente",
      description: "Pendente de política de crédito",
      icon: ShieldCheck,
    },
    {
      title: "Exposição atual",
      value: dataset ? money(exposure) : "—",
      description: "A Vencer + Vencidos (inadimplência)",
      icon: Wallet,
    },
    {
      title: "Inadimplência",
      value:
        dataset && exposure > 0
          ? percentage(overdue, exposure)
          : "Não aplicável",
      description: dataset
        ? `${money(overdue)} vencidos`
        : "Sem base financeira",
      icon: ChartNoAxesCombined,
    },
    {
      title: "Recebido YTD",
      value: dataset ? money(received) : "—",
      description: "Fluxo recebido; não compõe dívida atual",
      icon: Wallet,
    },
    {
      title: "Atraso médio tardio",
      value: days(weightedLate),
      description: "Ponderado pelo valor dos pagamentos tardios",
      icon: Clock,
    },
    {
      title: "Crédito disponível",
      value: approved
        ? money(sum(clients.map((client) => client.availableOperational!)))
        : "Sem limite aprovado",
      description: "Sem autorização automática para novas vendas",
      icon: ShieldCheck,
    },
  ];
  return (
    <section
      className="credit-module"
      aria-label="Análise de Crédito por Cliente"
    >
      <div className="info-banner">
        <ShieldCheck size={22} />
        <div>
          <strong>Análise de Crédito por Cliente · estimativa gerencial</strong>
          <p>
            Política pendente de aprovação. O risco exibido é uma prévia dos
            critérios propostos e não substitui análise externa. Sem aprovação
            autenticada, não há recomendação numérica final nem crédito
            disponível autorizado.
          </p>
        </div>
      </div>
      <p className="helper">
        Os filtros globais selecionam clientes; a exposição de cada cliente
        sempre usa sua posição integral, incluindo todos os representantes e
        categorias. Ano e mês delimitam o histórico YTD. Nenhuma referência
        financeira é misturada com outra.
      </p>
      {loadError && (
        <p role="alert" className="error-text">
          {loadError} Usando a proposta inicial não aprovada.
        </p>
      )}
      <div className="credit-controls">
        <label>
          Selecionar cliente para análise
          <select
            aria-label="Selecionar cliente para análise"
            value={clientKey}
            onChange={(event) => {
              setClientKey(event.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos os clientes da seleção</option>
            {all.map((client) => (
              <option key={client.key} value={client.key}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Risco observado
          <select
            aria-label="Filtrar risco observado"
            value={risk}
            onChange={(event) => {
              setRisk(event.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos</option>
            {[
              "Baixo",
              "Moderado",
              "Alto",
              "Crítico",
              "Dados insuficientes",
            ].map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
        <span>
          {clients.length} clientes ·{" "}
          {proposals[0]
            ? `proposta v${proposals[0].version}`
            : "proposta inicial"}{" "}
          · não aprovada
        </span>
      </div>
      <div className="credit-kpis">
        {cards.map(({ title, value, description, icon: Icon }) => (
          <article className="kpi" key={title}>
            <div className="kpi-label">
              {title}
              <span>
                <Icon size={18} />
              </span>
            </div>
            <strong className="credit-kpi-value">{value}</strong>
            <p>{description}</p>
          </article>
        ))}
      </div>
      <CreditCharts clients={clients} />
      <section className="panel credit-ranking">
        <div className="panel-title">
          <div>
            <h2>Crédito por cliente</h2>
            <p>
              Correspondência por nome normalizado, sem aproximação; dados
              originais preservados
            </p>
          </div>
          <label className="search">
            <input
              type="search"
              aria-label="Pesquisar análise de crédito"
              value={query}
              placeholder="Pesquisar cliente"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  ["name", "Cliente"],
                  ["exposure", "Exposição"],
                  ["overdue", "Vencidos (inadimplência)"],
                  ["delinquency", "Inadimplência"],
                  ["received", "Recebido YTD"],
                  ["risk", "Risco observado"],
                ].map(([key, label]) => (
                  <th key={key}>
                    <button
                      className="text-button"
                      onClick={() => {
                        setAscending(
                          sort === key ? !ascending : key === "name",
                        );
                        setSort(key);
                      }}
                    >
                      {label}
                      {sort === key ? (ascending ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
                <th>Limite-base provisório</th>
                <th>Limite recomendado</th>
              </tr>
            </thead>
            <tbody>
              {matched
                .slice(currentPage * 20, (currentPage + 1) * 20)
                .map((client) => (
                  <tr key={client.key}>
                    <td>
                      <button
                        className="text-button client-link"
                        onClick={() => setDetail(client)}
                      >
                        {client.name}
                      </button>
                    </td>
                    <td>{money(client.exposure)}</td>
                    <td>{money(client.overdue)}</td>
                    <td>
                      {client.delinquency === null
                        ? "Não aplicável"
                        : percentage(client.overdue, client.exposure)}
                    </td>
                    <td>{money(client.received)}</td>
                    <td>
                      <span
                        className={`risk-badge risk-${client.risk === "Dados insuficientes" ? "insufficient" : client.risk === "Crítico" ? "critical" : client.risk === "Alto" ? "high" : client.risk === "Moderado" ? "moderate" : "low"}`}
                      >
                        {client.risk}
                      </span>
                      <small className="risk-provisional">
                        {client.sufficient
                          ? "Prévia da proposta"
                          : "Sem classificação"}
                      </small>
                    </td>
                    <td>
                      {client.baseLimit === null
                        ? "Dados insuficientes"
                        : money(client.baseLimit)}
                    </td>
                    <td className="credit-pending">
                      {client.recommendationStatus}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!matched.length ? (
          <EmptyState message="Importe uma base ou ajuste os filtros para analisar os clientes." />
        ) : (
          <div className="pagination">
            <button
              className="secondary"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              Anterior
            </button>
            <span>
              Página {currentPage + 1} de {Math.ceil(matched.length / 20)}
            </span>
            <button
              className="secondary"
              disabled={(currentPage + 1) * 20 >= matched.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </section>
      <PolicyEditor
        key={proposals[0]?.id ?? "initial"}
        config={config}
        versions={proposals}
        onSave={(proposal) => {
          setConfig(proposal.config);
          setProposals((current) => [proposal, ...current]);
        }}
      />
      {detail && (
        <CreditDetail
          client={detail}
          config={config}
          onClose={() => setDetail(null)}
          onTrace={onTrace}
        />
      )}
    </section>
  );
}
