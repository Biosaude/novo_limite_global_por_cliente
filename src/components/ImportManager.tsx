import { useRef, useState } from "react";
import { FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { Dataset, Mapping, SourceWorkbook } from "../domain/types";
import { categoryLabel, fieldLabels } from "../domain/types";
import { readFile } from "../importacao/readFile";
import {
  amountAliases,
  blank,
  cellText,
  normalized,
  suggestMappings,
} from "../importacao/mapping";
import { normalize } from "../importacao/normalize";
import { totals, selectRecords, initialFilters } from "../domain/finance";
import { displayDate } from "../domain/dates";
import { money } from "../domain/money";
import { AuditTable } from "./AuditTable";

export function ImportManager({
  active,
  remembered,
  onCommit,
  onForget,
}: {
  active: Dataset | null;
  remembered: boolean;
  onCommit: (dataset: Dataset, remember: boolean) => Promise<void>;
  onForget: () => Promise<void>;
}) {
  const [source, setSource] = useState<SourceWorkbook | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [filename, setFilename] = useState("");
  const [reference, setReference] = useState("2026-10-19");
  const [candidate, setCandidate] = useState<Dataset | null>(null);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const resetValidation = () => {
    setCandidate(null);
    setError("");
    setSuccess("");
  };
  async function open(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setCandidate(null);
    setSuccess("");
    setSource(null);
    try {
      const workbook = await readFile(file);
      setSource(workbook);
      setMappings(suggestMappings(workbook));
      setFilename(file.name);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível abrir a planilha.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function validate() {
    if (!source) return;
    resetValidation();
    try {
      setCandidate(normalize(source, mappings, reference, filename));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao conferir o mapeamento.",
      );
    }
  }
  async function confirm() {
    if (
      !candidate ||
      candidate.issues.some((issue) => issue.severity === "error")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onCommit(candidate, remember);
      setSuccess(
        `Base confirmada: ${candidate.records.length.toLocaleString("pt-BR")} registros. Acesse Visão geral para consultar os indicadores.`,
      );
      setCandidate(null);
      setSource(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível confirmar a base. A base anterior foi preservada.",
      );
    } finally {
      setBusy(false);
    }
  }
  const blockers =
    candidate?.issues.filter((issue) => issue.severity === "error") ?? [];
  const preview =
    candidate && !blockers.length
      ? totals(selectRecords(candidate, initialFilters(candidate)))
      : null;
  return (
    <div className="import-manager">
      {active && (
        <div className="active-base panel">
          <div>
            <h2>Base em utilização</h2>
            <p>
              {active.filename} · Referência: {displayDate(active.reference)} ·{" "}
              {active.records.length.toLocaleString("pt-BR")} registros
            </p>
            <small>
              {remembered
                ? "Salva neste navegador e dispositivo."
                : "Somente nesta sessão; fechar ou recarregar a página remove a base."}
            </small>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onForget();
                setSuccess("Base removida da sessão e do armazenamento local.");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Falha ao remover a base.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Remover base deste navegador
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="info-banner" role="status">
          {success}
        </div>
      )}
      <section className="base-layout">
        <article className="panel">
          <div className="panel-title">
            <h2>Importar planilha financeira</h2>
            <span className="tag">EXCEL · .XLSX</span>
          </div>
          <div className="upload-area">
            <FileSpreadsheet size={38} />
            <h3>Selecione sua posição financeira</h3>
            <p>Faturamento A Vencer, Vencido e Faturado.xlsx</p>
            <label className="file-label">
              Selecionar planilha
              <input
                ref={input}
                type="file"
                aria-label="Selecionar planilha Excel"
                accept=".xlsx"
                disabled={busy}
                onChange={(event) => void open(event.target.files?.[0])}
              />
            </label>
            <small>
              Até 20 MB. Processamento no próprio navegador, sem envio do
              arquivo. {busy ? "Processando…" : filename}
            </small>
          </div>
          <label className="date-field">
            Data de referência da posição
            <input
              type="date"
              value={reference}
              disabled={busy}
              onChange={(event) => {
                setReference(event.target.value);
                resetValidation();
              }}
            />
          </label>
          <p className="helper">
            19/10/2026 é a referência histórica. Para uma nova extração, informe
            sua data. A data atual não é aplicada automaticamente.
          </p>
        </article>
        <article className="panel">
          <h2>Conferência e preservação</h2>
          <ol className="steps">
            {[
              "Conferir todas as abas e os cabeçalhos",
              "Mapear saldo em aberto ou valor recebido",
              "Validar registros, totais e datas",
              "Consultar advertências sem excluir títulos",
              "Confirmar ou substituir a base anterior",
            ].map((text, index) => (
              <li key={text}>
                <span>{index + 1}</span>
                <div>{text}</div>
              </li>
            ))}
          </ol>
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <p>
              Os dados e as justificativas são locais. Não há autenticação
              administrativa nesta etapa. Use apenas um dispositivo confiável.
            </p>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Lembrar a nova base neste navegador
          </label>
          <p className="helper">
            Opcional: usa IndexedDB, sem sincronização ou backup. Outros
            usuários do mesmo perfil do navegador podem acessar. Limpar os dados
            do site remove a base.
          </p>
        </article>
      </section>
      {source && (
        <section className="panel mapping-panel">
          <h2>Conferir estrutura e mapeamento</h2>
          <p className="helper">
            As sugestões usam os nomes encontrados no arquivo. Confira antes de
            validar. Valores nominais e descontos não são usados como saldo ou
            recebimento. Linhas vazias e conteúdo anterior ao cabeçalho são
            preservados na origem e contabilizados separadamente.
          </p>
          {source.sheets.map((sheet, sheetIndex) => {
            const map = mappings[sheetIndex];
            const header = sheet.rows.find((row) => row.number === map.header);
            const update = (next: Mapping) => {
              setMappings((current) =>
                current.map((item, index) =>
                  index === sheetIndex ? next : item,
                ),
              );
              resetValidation();
            };
            const count = sheet.rows.filter(
              (row) => row.number > map.header && !blank(row),
            ).length;
            const blanks = sheet.rows.filter(
              (row) => row.number > map.header && blank(row),
            ).length;
            return (
              <fieldset className="sheet-mapping" key={sheet.name}>
                <legend>{sheet.name}</legend>
                <div className="mapping-fields">
                  <label>
                    Categoria da aba
                    <select
                      aria-label={`Categoria ${sheet.name}`}
                      value={map.category}
                      disabled={busy}
                      onChange={(event) => {
                        const category = event.target
                          .value as Mapping["category"];
                        const index =
                          header?.cells.findIndex((cell) =>
                            amountAliases(category).includes(
                              normalized(cellText(cell)),
                            ),
                          ) ?? -1;
                        update({
                          ...map,
                          category,
                          fields: { ...map.fields, amount: index },
                        });
                      }}
                    >
                      <option value="">Selecione a categoria</option>
                      {Object.entries(categoryLabel).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Linha do cabeçalho
                    <input
                      aria-label={`Cabeçalho ${sheet.name}`}
                      type="number"
                      min={1}
                      max={sheet.rows.length}
                      value={map.header}
                      disabled={busy}
                      onChange={(event) =>
                        update({
                          ...map,
                          header: Number(event.target.value),
                          fields: Object.fromEntries(
                            Object.keys(fieldLabels).map((key) => [key, -1]),
                          ) as Mapping["fields"],
                        })
                      }
                    />
                  </label>
                  {Object.entries(fieldLabels).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      {key === "amount"
                        ? map.category === "received"
                          ? " (recebido efetivo)"
                          : " (saldo em aberto)"
                        : ""}
                      <select
                        aria-label={`${label} ${sheet.name}`}
                        value={map.fields[key as keyof Mapping["fields"]]}
                        disabled={busy}
                        onChange={(event) =>
                          update({
                            ...map,
                            fields: {
                              ...map.fields,
                              [key]: Number(event.target.value),
                            },
                          })
                        }
                      >
                        <option value={-1}>Não mapeado</option>
                        {header?.cells.map((cell, index) => (
                          <option key={index} value={index}>
                            Coluna {index + 1}:{" "}
                            {cellText(cell) || "(sem cabeçalho)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="helper">
                  {count.toLocaleString("pt-BR")} registros · {blanks} linhas
                  vazias preservadas · {Math.max(0, map.header - 1)} linhas
                  anteriores ao cabeçalho preservadas · {sheet.columns} colunas
                </p>
                <details>
                  <summary>Ver cabeçalhos e primeiras linhas originais</summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {header?.cells.map((cell, index) => (
                            <th key={index}>
                              {index + 1}. {cellText(cell)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows
                          .filter((row) => row.number > map.header)
                          .slice(0, 3)
                          .map((row) => (
                            <tr key={row.number}>
                              {row.cells.map((cell, index) => (
                                <td key={index}>{cellText(cell)}</td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </fieldset>
            );
          })}
          <button className="primary" disabled={busy} onClick={validate}>
            Validar estrutura e calcular totais
          </button>
        </section>
      )}
      {candidate && (
        <section className="panel validation-panel">
          <h2>Conferência da nova base</h2>
          <p>
            {candidate.records.length.toLocaleString("pt-BR")} registros
            preservados ·{" "}
            {candidate.issues
              .filter((issue) => issue.severity === "warning")
              .length.toLocaleString("pt-BR")}{" "}
            advertências · {blockers.length} erros bloqueantes
          </p>
          {preview && (
            <div className="preview-totals">
              {(["upcoming", "overdue", "received", "global"] as const).map(
                (key) => (
                  <div key={key}>
                    <span>
                      {key === "global"
                        ? "Limite Global"
                        : key === "received"
                          ? "Recebido YTD"
                          : categoryLabel[key]}
                    </span>
                    <strong>{money(preview[key])}</strong>
                  </div>
                ),
              )}
            </div>
          )}
          <p className="helper">
            Referência {displayDate(reference)}. Recebido YTD: 01/01/
            {reference.slice(0, 4)} até {displayDate(reference)}. Advertências
            não removem registros e não impedem a visualização dos totais
            válidos.
          </p>
          <AuditTable dataset={candidate} readonly />
          <button
            className="primary"
            disabled={busy || !!blockers.length}
            onClick={() => void confirm()}
          >
            {active
              ? "Confirmar substituição da base"
              : "Confirmar utilização da base"}
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setCandidate(null)}
          >
            Rever mapeamento
          </button>
          {!!blockers.length && (
            <p role="alert" className="error-text">
              Corrija os erros na origem ou no mapeamento e valide novamente. A
              base anterior não será substituída.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
