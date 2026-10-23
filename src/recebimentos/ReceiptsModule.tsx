import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet, ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import type { Dataset, FinancialRecord } from "../domain/types";
import { displayDate } from "../domain/dates";
import { money, percentage } from "../domain/money";
import { EmptyState } from "../components/EmptyState";
import { ReceiptCharts } from "./ReceiptCharts";
import {
  conditions,
  legalLabels,
  initialReceiptFilters,
  receiptRows,
  receiptView,
  quarterVariation,
  type ReceiptFilters,
  type Condition,
} from "./analysis";
export function ReceiptsModule({
  dataset,
  onTrace,
}: {
  dataset: Dataset | null;
  onTrace: (record: FinancialRecord) => void;
}) {
  const [filters, setFilters] = useState(() => initialReceiptFilters(dataset));
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const all = useMemo(() => (dataset ? receiptRows(dataset) : []), [dataset]);
  const view = useMemo(
    () => (dataset ? receiptView(dataset, all, filters) : null),
    [dataset, all, filters],
  );
  const latest = useRef(view);
  latest.current = view;
  useEffect(
    () => () => {
      latest.current = null;
    },
    [],
  );
  const update = (name: keyof ReceiptFilters, value: string | boolean) => {
    setFilters((f) => ({ ...f, [name]: value }));
    setPage(0);
    setError("");
  };
  const effectivePage = Math.min(
    page,
    Math.max(0, Math.ceil((view?.rows.length ?? 0) / 20) - 1),
  );
  async function download(kind: "xlsx" | "pdf") {
    if (!view) return;
    const snapshot = view;
    setBusy(kind);
    setError("");
    try {
      const reports = await import("./reports");
      const bytes =
        kind === "xlsx"
          ? await reports.createReceiptsExcel(snapshot)
          : await reports.createReceiptsPdf(
              snapshot,
              await (await import("../relatorios/pdf")).loadPdfFont(),
            );
      if (latest.current !== snapshot) return;
      const { downloadReport } = await import("../relatorios/download");
      downloadReport(
        bytes,
        `Recebimentos_Biosaude_${snapshot.reference}.${kind}`,
        kind === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
    } catch (e) {
      if (latest.current === snapshot)
        setError(e instanceof Error ? e.message : "Falha ao gerar relatório.");
    } finally {
      setBusy("");
    }
  }
  const available = all.filter(
    (r) => r.received && r.received <= dataset!.reference,
  );
  const options = (field: "client" | "representative") =>
    [...new Set(available.map((r) => r[field]))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  const select = (
    label: string,
    name: keyof ReceiptFilters,
    values: [string, string][],
    disabled = false,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={String(filters[name])}
        disabled={!dataset || disabled}
        onChange={(e) =>
          update(
            name,
            name === "ascending" ? e.target.value === "true" : e.target.value,
          )
        }
      >
        {values.map(([value, text]) => (
          <option value={value} key={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const keys = Object.keys(conditions) as Condition[];
  return (
    <div className="receipts-module">
      <section
        className="filters receipt-filters"
        aria-label="Filtros de recebimentos"
      >
        <div className="filter-heading">
          <div>
            <h2>Filtros de recebimentos</h2>
            <p>
              Período efetivo de recebimento · mês e trimestre são filtros por
              interseção, sem acumulação YTD
            </p>
          </div>
          <button
            className="text-button"
            disabled={!dataset}
            onClick={() => {
              setFilters(initialReceiptFilters(dataset));
              setPage(0);
              setError("");
            }}
          >
            Limpar filtros de recebimentos
          </button>
        </div>
        <div className="receipt-filter-fields">
          {select("Ano dos recebimentos", "year", [
            ["", "Todos"],
            ...[
              ...new Set([
                ...(dataset ? [dataset.reference.slice(0, 4)] : []),
                ...available.map((r) => r.received!.slice(0, 4)),
              ]),
            ]
              .sort()
              .map((y) => [y, y] as [string, string]),
          ])}
          {select("Mês dos recebimentos", "month", [
            ["", "Todos"],
            ...Array.from(
              { length: 12 },
              (_, i) =>
                [
                  String(i + 1).padStart(2, "0"),
                  new Intl.DateTimeFormat("pt-BR", {
                    month: "long",
                    timeZone: "UTC",
                  }).format(new Date(Date.UTC(2026, i, 1))),
                ] as [string, string],
            ),
          ])}
          {select("Trimestre dos recebimentos", "quarter", [
            ["", "Todos"],
            ...["1", "2", "3", "4"].map(
              (q) => [q, "Q" + q] as [string, string],
            ),
          ])}
          {select("Cliente dos recebimentos", "client", [
            ["", "Todos"],
            ...options("client").map((v) => [v, v] as [string, string]),
          ])}
          {select("Representante dos recebimentos", "representative", [
            ["", "Todos"],
            ...options("representative").map((v) => [v, v] as [string, string]),
          ])}
          {select("Condição do recebimento", "condition", [
            ["", "Todas"],
            ...keys.map((k) => [k, conditions[k]] as [string, string]),
          ])}
          {select(
            "Situação de ajuizamento",
            "legal",
            [
              ["", "Todas"],
              ["yes", "Ajuizado"],
              ["no", "Não ajuizado"],
              ["unknown", "Dados indisponíveis"],
            ],
            !all.some((r) => r.legal !== "unknown"),
          )}
        </div>
        <div className="filter-footer">
          <span>
            Posição limite:{" "}
            {dataset ? displayDate(dataset.reference) : "Sem base"} ·{" "}
            {view?.summary.count.toLocaleString("pt-BR") ?? 0} lançamentos
            selecionados
          </span>
          <span>
            Filtros exclusivos deste painel; saldos e aging da Visão Geral
            preservados.
          </span>
        </div>
      </section>
      {!view ? (
        <EmptyState message="Importe e ative uma planilha para analisar os recebimentos." />
      ) : (
        <>
          {(view.excludedDates > 0 ||
            view.summary.invalidAmounts > 0 ||
            view.summary.unknownCount > 0 ||
            view.summary.negativeCount > 0) && (
            <p role="status" className="receipt-warning">
              {view.excludedDates} registros sem data de recebimento válida ou
              posteriores à posição, fora da análise temporal.{" "}
              {view.summary.invalidAmounts} valores inválidos (total parcial;
              exportação bloqueada). {view.summary.unknownCount} registros com
              prazo indeterminado. {view.summary.negativeCount} valores
              negativos preservados.
            </p>
          )}
          <section
            className="kpi-grid receipt-kpis"
            aria-label="Indicadores de recebimentos"
          >
            {[
              [
                "Recebido Total",
                view.summary.total,
                Wallet,
                "Valores efetivamente recebidos na seleção",
                view.summary.count,
              ],
              [
                "Recebido Pós-Inadimplência",
                view.categories.find((c) => c.key === "late")!.value,
                ArrowUpRight,
                "Recebimento posterior ao vencimento",
                view.categories.find((c) => c.key === "late")!.count,
              ],
              [
                "Recebido Antecipadamente",
                view.categories.find((c) => c.key === "early")!.value,
                ArrowDownLeft,
                "Recebimento anterior ao vencimento",
                view.categories.find((c) => c.key === "early")!.count,
              ],
              [
                "Recebido de Títulos Ajuizados",
                view.summary.legalTotal,
                Scale,
                "Subconjunto complementar; depende de identificação confiável",
                view.summary.legalKnown,
              ],
            ].map(([title, value, Icon, description, count]) => {
              const Symbol = Icon as typeof Wallet;
              return (
                <article className="kpi" key={String(title)}>
                  <div className="kpi-label">
                    {String(title)}
                    <span>
                      <Symbol size={19} />
                    </span>
                  </div>
                  <div className="kpi-value">
                    {value === null
                      ? "Dados indisponíveis"
                      : money(value as number)}
                  </div>
                  <p>{String(description)}</p>
                  <div className="kpi-footer">
                    {String(count)}{" "}
                    {title === "Recebido de Títulos Ajuizados"
                      ? "lançamentos com situação conhecida"
                      : "lançamentos"}
                  </div>
                </article>
              );
            })}
          </section>
          <ReceiptCharts view={view} />
          <section className="panel receipt-comparison">
            <h3>Comparativo financeiro por categoria</h3>
            <p className="helper">
              Variação em relação ao trimestre disponível anterior, dentro dos
              filtros; base anterior zero ou negativa: não aplicável. Períodos
              parciais não são projeções.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    {view.quarterly.map((q) => (
                      <th key={q.name}>
                        {q.name}
                        <br />
                        Valor / variação
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys
                    .filter((k) => k !== "unknown" || view.summary.unknownCount)
                    .map((k) => (
                      <tr key={k}>
                        <td>{conditions[k]}</td>
                        {view.quarterly.map((q, i) => {
                          const delta = quarterVariation(
                            q[k],
                            i ? view.quarterly[i - 1][k] : null,
                          );
                          return (
                            <td key={q.name}>
                              {money(q[k])}
                              <br />
                              <small>
                                {delta === null
                                  ? "Não aplicável"
                                  : `${delta.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}
                              </small>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  <tr>
                    <td>
                      <strong>Total recebido</strong>
                    </td>
                    {view.quarterly.map((q) => (
                      <td key={q.name}>
                        <strong>{money(q.total)}</strong>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {!view.quarterly.length && (
              <EmptyState message="Nenhum trimestre disponível para a seleção." />
            )}
          </section>
          <section
            className="panel receipt-detail"
            aria-label="Consulta de recebimentos"
          >
            <div className="panel-title">
              <div>
                <h3>Consulta de recebimentos</h3>
                <p className="helper">
                  {view.summary.count} lançamentos · {view.summary.titles}{" "}
                  títulos identificados · {view.summary.clients} clientes ·
                  total {money(view.summary.total)}
                </p>
              </div>
              <div className="receipt-actions">
                <button
                  className="secondary"
                  disabled={
                    !view.rows.length || !!view.summary.invalidAmounts || !!busy
                  }
                  onClick={() => download("xlsx")}
                >
                  Exportar Excel
                </button>
                <button
                  className="secondary"
                  disabled={
                    !view.rows.length || !!view.summary.invalidAmounts || !!busy
                  }
                  onClick={() => download("pdf")}
                >
                  Exportar PDF
                </button>
              </div>
            </div>
            <p className="helper">
              Uma linha representa um recebimento, inclusive parcial, e não
              comprova quitação integral. Nenhum lançamento é removido por
              coincidência de valor. Os relatórios incluem todos os resultados
              filtrados, sem dados de pacientes.
            </p>
            <div className="receipt-query">
              {" "}
              <label>
                Pesquisar recebimentos
                <input
                  type="search"
                  value={filters.search}
                  onChange={(e) => update("search", e.target.value)}
                  placeholder="Cliente, representante, duplicata ou título"
                />
              </label>
              {select("Ordenar recebimentos", "sort", [
                ["received", "Recebimento"],
                ["client", "Cliente"],
                ["cents", "Valor recebido"],
                ["days", "Dias"],
                ["document", "Duplicata"],
              ])}
              {select("Direção dos recebimentos", "ascending", [
                ["false", "Decrescente"],
                ["true", "Crescente"],
              ])}
            </div>
            {busy && (
              <p role="status">Gerando relatório {busy.toUpperCase()}…</p>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <div className="table-scroll">
              <table className="receipt-table">
                <thead>
                  <tr>
                    {[
                      "Cliente",
                      "Representante",
                      "Duplicata",
                      "Parcela",
                      "Título completo",
                      "Emissão",
                      "Vencimento",
                      "Recebimento",
                      "Dias (− antecipação / + atraso)",
                      "Valor recebido",
                      "Condição",
                      "Ajuizamento",
                      "Origem",
                    ].map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows
                    .slice(effectivePage * 20, (effectivePage + 1) * 20)
                    .map((r) => (
                      <tr key={r.record.id}>
                        <td>{r.client}</td>
                        <td>{r.representative}</td>
                        <td>{r.document || "Não informada"}</td>
                        <td>{r.installment || "Não informada"}</td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => onTrace(r.record)}
                          >
                            {r.title || "Ver original"}
                          </button>
                        </td>
                        <td>{displayDate(r.issued)}</td>
                        <td>{displayDate(r.due)}</td>
                        <td>{displayDate(r.received)}</td>
                        <td>{r.days ?? "Indeterminado"}</td>
                        <td>
                          {r.cents === null ? "Inválido" : money(r.cents)}
                        </td>
                        <td>{conditions[r.condition]}</td>
                        <td title={r.legalSource ?? "Sem campo confiável"}>
                          {legalLabels[r.legal]}
                        </td>
                        <td>
                          {r.record.sheet} · linha {r.record.row}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!view.rows.length && (
              <EmptyState message="Nenhum recebimento encontrado para os filtros." />
            )}
            <div className="pagination">
              <button
                className="secondary"
                aria-label="Página anterior dos recebimentos"
                disabled={!effectivePage}
                onClick={() => setPage(effectivePage - 1)}
              >
                Anterior
              </button>
              <span>
                Página {effectivePage + 1} de{" "}
                {Math.max(1, Math.ceil(view.rows.length / 20))}
              </span>
              <button
                className="secondary"
                aria-label="Próxima página dos recebimentos"
                disabled={(effectivePage + 1) * 20 >= view.rows.length}
                onClick={() => setPage(effectivePage + 1)}
              >
                Próxima
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
