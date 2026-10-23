import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, Filters, FinancialRecord } from "../domain/types";
import { agingBandNames, selectableBands } from "../domain/agingBands";
import {
  buildCollectionView,
  type CollectionQuery,
  type CollectionSort,
} from "../cobranca/query";
import { displayDate } from "../domain/dates";
import { money } from "../domain/money";
import { downloadReport } from "../relatorios/download";
const days = (value: number | null) =>
  value === null
    ? "Não aplicável"
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dias`;
const amount = (value: number | null) =>
  value === null ? "Não informado" : money(value);
export function CollectionPanel({
  dataset,
  records,
  filters,
  query,
  onQueryChange,
  onTrace,
}: {
  dataset: Dataset;
  records: FinancialRecord[];
  filters: Filters;
  query: CollectionQuery;
  onQueryChange: (query: CollectionQuery) => void;
  onTrace: (record: FinancialRecord) => void;
}) {
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const view = useMemo(
    () => buildCollectionView(dataset, records, filters, query),
    [dataset, records, filters, query],
  );
  const latest = useRef<typeof view | null>(view);
  latest.current = view;
  useEffect(
    () => () => {
      latest.current = null;
    },
    [],
  );
  useEffect(() => {
    setPage(0);
  }, [view]);
  const effectivePage = Math.min(
    page,
    Math.max(0, Math.ceil(view.rows.length / 20) - 1),
  );
  const update = (patch: Partial<CollectionQuery>) => {
    onQueryChange({ ...query, ...patch });
    setPage(0);
    setError("");
    setNotice("");
  };
  async function exportReport(kind: "xlsx" | "pdf") {
    const snapshot = view,
      stamp = new Date().toISOString();
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const bytes =
        kind === "xlsx"
          ? await (
              await import("../relatorios/excel")
            ).createCollectionExcel(snapshot, stamp)
          : await (async () => {
              const module = await import("../relatorios/pdf");
              return module.createCollectionPdf(
                snapshot,
                await module.loadPdfFont(),
                stamp,
              );
            })();
      if (latest.current !== snapshot) {
        if (latest.current)
          setError(
            "A seleção mudou durante a geração. Exporte novamente para usar a consulta atual.",
          );
        return;
      }
      downloadReport(
        bytes,
        `Biosaude_Pendencias_${snapshot.reference}.${kind}`,
        kind === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
      setNotice(
        `Relatório ${kind === "xlsx" ? "Excel" : "PDF"} gerado com ${snapshot.summary.recordCount} registros e ${money(snapshot.summary.totalOpen)} em aberto.`,
      );
    } catch (e) {
      if (latest.current)
        setError(
          e instanceof Error ? e.message : "Falha ao gerar o relatório.",
        );
    } finally {
      if (latest.current) setBusy("");
    }
  }
  const summary = view.summary;
  return (
    <section
      className="panel collection-panel"
      aria-label="Consulta de Títulos e Pendências Financeiras"
    >
      <div className="panel-title">
        <div>
          <h2>Consulta de Títulos e Pendências Financeiras</h2>
          <p>
            Contexto de cobrança · posição de {displayDate(view.reference)} ·
            títulos em aberto. Os KPIs gerais seguem os filtros principais.
          </p>
        </div>
        <div className="collection-exports">
          <button
            className="secondary"
            disabled={!!busy || !view.rows.length || !!summary.invalidAmounts}
            onClick={() => exportReport("xlsx")}
          >
            {busy === "xlsx" ? "Gerando Excel…" : "Exportar Excel"}
          </button>
          <button
            className="secondary"
            disabled={!!busy || !view.rows.length || !!summary.invalidAmounts}
            onClick={() => exportReport("pdf")}
          >
            {busy === "pdf" ? "Gerando PDF…" : "Exportar PDF"}
          </button>
        </div>
      </div>
      <p className="helper">
        Ano e mês limitam os recebimentos; não reconstroem saldos históricos.
        Recebimentos não entram nesta consulta de pendências. Exportações locais
        incluem todos os resultados, sem dados de pacientes.
      </p>
      <div className="collection-controls">
        <label>
          Pesquisar cliente na consulta
          <input
            type="search"
            aria-label="Pesquisar cliente na consulta"
            value={query.clientSearch}
            onChange={(e) => update({ clientSearch: e.target.value })}
          />
        </label>
        <label>
          Pesquisar duplicata ou título
          <input
            type="search"
            aria-label="Pesquisar duplicata ou título"
            value={query.documentSearch}
            onChange={(e) => update({ documentSearch: e.target.value })}
          />
        </label>
        <label>
          Ordenar consulta
          <select
            aria-label="Ordenar consulta"
            value={query.sort}
            onChange={(e) => update({ sort: e.target.value as CollectionSort })}
          >
            <option value="due">Vencimento</option>
            <option value="openCents">Saldo em aberto</option>
            <option value="days">Dias vencidos</option>
            <option value="client">Cliente</option>
            <option value="document">Duplicata</option>
          </select>
        </label>
        <label>
          Direção
          <select
            aria-label="Direção da consulta"
            value={query.ascending ? "asc" : "desc"}
            onChange={(e) => update({ ascending: e.target.value === "asc" })}
          >
            <option value="asc">Crescente</option>
            <option value="desc">Decrescente</option>
          </select>
        </label>
      </div>
      <fieldset className="collection-bands">
        <legend>Faixas de Aging — consulta de cobrança</legend>
        {selectableBands.map((index) => (
          <label key={index}>
            <input
              type="checkbox"
              checked={query.bands.includes(index)}
              onChange={() =>
                update({
                  bands: query.bands.includes(index)
                    ? query.bands.filter((value) => value !== index)
                    : [...query.bands, index].sort((a, b) => a - b),
                })
              }
            />
            {agingBandNames[index]}
          </label>
        ))}
      </fieldset>
      <div
        className="collection-summary"
        aria-label="Resumo da seleção de cobrança"
        aria-live="polite"
      >
        {[
          [
            "Registros selecionados",
            summary.recordCount.toLocaleString("pt-BR"),
          ],
          ["Títulos identificados", summary.titleCount.toLocaleString("pt-BR")],
          [
            "Clientes selecionados",
            summary.clientCount.toLocaleString("pt-BR"),
          ],
          ["Saldo em aberto selecionado", money(summary.totalOpen)],
          ["Aging ponderado da seleção", days(summary.agingDays)],
          ["Maior atraso — Vencidos", days(summary.maxDelay)],
          ["Data-base da consulta", displayDate(view.reference)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="helper">
        Contagens de lançamentos e de títulos são distintas; títulos usam
        cliente + duplicata + parcela, ou título completo. Lançamentos
        coincidentes não são eliminados. A média pondera saldos de Vencidos.
      </p>
      {summary.excludedAgingCount > 0 && (
        <p className="helper">
          Aging indisponível: há {summary.excludedAgingCount} registros
          divergentes, sem vencimento válido ou com saldo negativo/inválido.
          Confira a Auditoria.
        </p>
      )}
      {!!summary.invalidAmounts && (
        <p className="error-text">
          Há saldos inválidos; o total é parcial e a exportação está
          desabilitada. Confira a base.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="table-scroll">
        <table className="collection-table">
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
                "Dias vencidos",
                "Faixa de Aging",
                "Valor nominal",
                "Desconto",
                "Saldo em aberto",
                "Situação",
                "Hospital",
                "Plano de saúde",
                "Origem / observações",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.length ? (
              view.rows
                .slice(effectivePage * 20, (effectivePage + 1) * 20)
                .map((row) => (
                  <tr key={row.record.id}>
                    <td>{row.client}</td>
                    <td>{row.representative}</td>
                    <td>{row.document || "Não informada"}</td>
                    <td>{row.installment || "Não informada"}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onTrace(row.record)}
                        aria-label={`Ver origem ${row.title || row.record.id}`}
                      >
                        {row.title || "Sem título"}
                      </button>
                    </td>
                    <td>{displayDate(row.issued)}</td>
                    <td>{displayDate(row.due)}</td>
                    <td>{row.days === null ? "Indeterminado" : row.days}</td>
                    <td>{row.band}</td>
                    <td>{amount(row.nominalCents)}</td>
                    <td>{amount(row.discountCents)}</td>
                    <td>{amount(row.openCents)}</td>
                    <td>
                      {row.record.category === "overdue"
                        ? "Vencidos (inadimplência)"
                        : "A Vencer"}
                    </td>
                    <td>{row.hospital || "Não informado"}</td>
                    <td>{row.healthPlan || "Não informado"}</td>
                    <td>
                      {row.record.sheet} · linha {row.record.row}
                      {row.observations && <small>{row.observations}</small>}
                    </td>
                  </tr>
                ))
            ) : (
              <tr>
                <td colSpan={16}>
                  Nenhum título em aberto corresponde à consulta. Revise
                  cliente, representante, categoria, pesquisas e faixas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button
          className="secondary"
          disabled={!effectivePage}
          onClick={() => setPage(effectivePage - 1)}
        >
          Página anterior da consulta
        </button>
        <span>
          Página {view.rows.length ? effectivePage + 1 : 0} de{" "}
          {Math.ceil(view.rows.length / 20)} · {view.rows.length} registros
        </span>
        <button
          className="secondary"
          disabled={(effectivePage + 1) * 20 >= view.rows.length}
          onClick={() => setPage(effectivePage + 1)}
        >
          Próxima página da consulta
        </button>
      </div>
    </section>
  );
}
