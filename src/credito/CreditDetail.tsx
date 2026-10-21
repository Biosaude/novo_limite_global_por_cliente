import { useEffect, useRef, useState } from "react";
import type { FinancialRecord } from "../domain/types";
import { categoryLabel } from "../domain/types";
import type { CreditClient, CreditConfig } from "./types";
import { displayDate } from "../domain/dates";
import { money, percentage } from "../domain/money";
export const days = (value: number | null) =>
  value === null
    ? "Não disponível"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} dias`;
export function CreditDetail({
  client,
  config,
  onClose,
  onTrace,
}: {
  client: CreditClient;
  config: CreditConfig;
  onClose: () => void;
  onTrace: (title: string, records: FinancialRecord[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const entries = client.records.filter(
    (row) => !category || row.category === category,
  );
  const metrics = [
    ["Exposição atual", money(client.exposure)],
    ["A Vencer", money(client.upcoming)],
    [categoryLabel.overdue, money(client.overdue)],
    [
      "Índice de inadimplência",
      client.delinquency === null
        ? "Não aplicável"
        : percentage(client.overdue, client.exposure),
    ],
    ["Recebido YTD", money(client.received)],
    ["Lançamentos de recebimento", String(client.payments.records)],
    ["Títulos com recebimentos observados", String(client.payments.titleCount)],
    [
      "Títulos com múltiplos lançamentos",
      String(client.payments.repeatedTitleCount),
    ],
    [
      "Títulos com algum recebimento tardio observado",
      `${client.payments.titleAnyLateCount} de ${client.payments.datedTitleCount} títulos com lançamentos datados (sem atestar quitação)`,
    ],
    [
      "Lançamentos até o vencimento",
      client.payments.onTimeRatio === null
        ? "Não disponível"
        : percentage(
            client.payments.onTimeCount,
            client.payments.validDateRecords,
          ),
    ],
    [
      "Lançamentos tardios",
      client.payments.lateRatio === null
        ? "Não disponível"
        : percentage(
            client.payments.lateCount,
            client.payments.validDateRecords,
          ),
    ],
    ["Atraso médio tardio (simples)", days(client.payments.meanLateDays)],
    [
      "Atraso médio tardio (ponderado por valor)",
      days(client.payments.weightedLateDays),
    ],
    [
      "Prazo emissão → recebimento (ponderado)",
      days(client.payments.weightedPaymentDays),
    ],
    [
      "Recebimento médio mensal (janela observada)",
      client.payments.meanMonthly === null
        ? "Não disponível"
        : money(client.payments.meanMonthly),
    ],
    [
      "Média por lançamento recebido",
      client.payments.meanPerEntry === null
        ? "Não disponível"
        : money(client.payments.meanPerEntry),
    ],
    [
      "Média recebida por título observado",
      client.payments.meanPerTitle === null
        ? "Não disponível"
        : money(client.payments.meanPerTitle),
    ],
    [
      "Prazo de crédito (mediana emissão → vencimento)",
      days(client.creditTermDays),
    ],
    ["Recebimentos a prazo usados no proxy", money(client.creditReceipts)],
    [
      "Limite-base provisório",
      client.baseLimit === null
        ? "Dados insuficientes"
        : money(client.baseLimit),
    ],
    ["Risco observado — prévia da proposta", client.risk],
    [
      "Fator da proposta (inativo)",
      client.risk === "Dados insuficientes"
        ? "Não aplicável"
        : `${config.factorsBps[client.risk] / 100}%`,
    ],
    [
      "Limite recomendado",
      client.recommendation === null
        ? client.recommendationStatus
        : money(client.recommendation),
    ],
    [
      "Limite aprovado",
      client.approvedLimit === null
        ? "Sem limite aprovado"
        : money(client.approvedLimit),
    ],
    [
      "Disponibilidade bruta",
      client.availableRaw === null
        ? "Não aplicável"
        : money(client.availableRaw),
    ],
    [
      "Disponibilidade operacional",
      client.availableOperational === null
        ? "Não aplicável"
        : money(client.availableOperational),
    ],
    [
      "Valor excedido",
      client.exceeded === null ? "Não aplicável" : money(client.exceeded),
    ],
    [
      "Diferença estimada recomendação − exposição",
      client.estimatedHeadroom === null
        ? "Pendente de política de crédito"
        : money(client.estimatedHeadroom),
    ],
  ];
  return (
    <dialog
      ref={ref}
      className="detail-dialog credit-dialog"
      aria-label="Análise de crédito individual"
      onCancel={onClose}
    >
      <div className="dialog-header">
        <div>
          <h2>{client.name}</h2>
          <p>
            Estimativa gerencial · nenhum valor é autorização para novas vendas
          </p>
        </div>
        <button className="secondary" autoFocus onClick={onClose}>
          Fechar análise
        </button>
      </div>
      <div className="info-banner">
        <p>
          Histórico YTD observado: {displayDate(client.windowStart)} a{" "}
          {displayDate(client.windowEnd)} ·{" "}
          {client.windowMonths.toLocaleString("pt-BR", {
            maximumFractionDigits: 2,
          })}{" "}
          meses equivalentes da extração · {client.payments.activeMonths} meses
          com recebimentos deste cliente. Sem comprovação de cobertura integral.
        </p>
      </div>
      <dl className="credit-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>Justificativa e metodologia da estimativa</h3>
      <ul className="credit-reasons">
        {client.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="helper">
        Pontualidade por lançamento: {client.payments.validDateRecords}{" "}
        registros elegíveis. Métricas por título agrupam duplicata e parcela;
        múltiplos pagamentos não comprovam quitação. O volume mensal é proxy de
        recebimentos, com meses sem atividade mantidos na janela comum da
        extração. Atraso médio ponderado usa somente os pagamentos tardios
        positivos. Faixas atuais usam vencimento e a referência da posição, sem
        usar a coluna de dias como autoridade.
      </p>
      <h3>Faixas atuais de inadimplência</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Faixa</th>
              <th>Saldo</th>
              <th>Registros</th>
            </tr>
          </thead>
          <tbody>
            {client.bands.map((band) => (
              <tr key={band.name}>
                <td>{band.name}</td>
                <td>{money(band.cents)}</td>
                <td>{band.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Advertências e identificação</h3>
      <ul className="credit-reasons">
        {client.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <details>
        <summary>Grafias originais e representantes</summary>
        <p>{client.variants.join(" · ")}</p>
        <p>{client.representatives.join(" · ")}</p>
      </details>
      <h3>Duplicatas e lançamentos rastreáveis</h3>
      <label>
        Categoria no detalhamento
        <select
          aria-label="Categoria no detalhamento de crédito"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas</option>
          {Object.entries(categoryLabel).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Duplicata",
                "Parcela",
                "Título",
                "Categoria",
                "Emissão",
                "Vencimento",
                "Recebimento",
                "Valor financeiro",
                "Origem",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.slice(page * 25, (page + 1) * 25).map((row) => (
              <tr key={row.id}>
                <td>{row.document || "Não identificada"}</td>
                <td>{row.installment || "Não identificada"}</td>
                <td>{row.title || "Sem título"}</td>
                <td>{categoryLabel[row.category]}</td>
                <td>{displayDate(row.issued ?? null)}</td>
                <td>{displayDate(row.due)}</td>
                <td>{displayDate(row.received)}</td>
                <td>{row.cents === null ? "Inválido" : money(row.cents)}</td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      onClose();
                      onTrace(`Origem — ${client.name}`, [row]);
                    }}
                  >
                    {row.sheet} · linha {row.row}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button
          className="secondary"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <span>
          {entries.length ? page + 1 : 0} de {Math.ceil(entries.length / 25)}
        </span>
        <button
          className="secondary"
          disabled={(page + 1) * 25 >= entries.length}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </dialog>
  );
}
