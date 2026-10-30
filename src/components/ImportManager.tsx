import { useRef, useState } from "react";
import { usePersistence } from "../persistencia/context";
import {
  Download,
  FolderOpen,
  RefreshCw,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";
import type { Dataset, Mapping, SourceWorkbook } from "../domain/types";
import { categoryLabel, fieldLabels } from "../domain/types";
import { downloadTemplate, readFile } from "../importacao/readFile";
import {
  amountAliases,
  blank,
  cellText,
  normalized,
  suggestMappings,
} from "../importacao/mapping";
import { normalize } from "../importacao/normalize";
import { totals, selectRecords, initialFilters } from "../domain/finance";
import { displayDate, currentDate } from "../domain/dates";
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
  const { mode } = usePersistence();
  const remote = mode === "remote";
  const [source, setSource] = useState<SourceWorkbook | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [filename, setFilename] = useState("");
  const [reference, setReference] = useState(active?.reference ?? currentDate());
  const [candidate, setCandidate] = useState<Dataset | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const resetValidation = () => {
    setCandidate(null);
    setConfirmed(false);
    setError("");
    setSuccess("");
  };
  async function open(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setCandidate(null);
    setConfirmed(false);
    setSuccess("");
    setSource(null);
    try {
      const workbook = await readFile(file);
      setSource(workbook);
      const suggestions = suggestMappings(workbook);
      setMappings(suggestions);
      setFilename(file.name);
      try {
        setCandidate(normalize(workbook, suggestions, reference, file.name));
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Confira o mapeamento antes de validar.",
        );
      }
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
      !confirmed ||
      candidate.issues.some((issue) => issue.severity === "error")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onCommit(candidate, remember);
      setSuccess(
        `Dashboard atualizado com sucesso: ${candidate.records.length.toLocaleString("pt-BR")} registros. Acesse Visão geral para consultar os indicadores.`,
      );
      setCandidate(null);
      setConfirmed(false);
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
      <section
        className="base-controls panel"
        aria-label="Gerenciamento da base"
      >
        <div className="panel-title">
          <div>
            <h2>Gerenciamento da Base de Dados</h2>
            <p>
              Baixe o modelo, selecione a extração e confirme os dados antes de
              aplicar.
            </p>
          </div>
          <span className="tag">{remote ? "EXCEL · NEON" : "EXCEL · DADOS LOCAIS"}</span>
        </div>
        <div
          className="base-actions"
          id="base-actions"
          role="group"
          aria-label="Controles da base"
        >
          <button
            className="base-action"
            aria-label="Baixar Modelo da Base"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await downloadTemplate();
                setSuccess(
                  "Download do modelo iniciado. A planilha está vazia: preencha os registros reais antes de importar.",
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Não foi possível gerar o modelo.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="action-icon">
              <Download size={22} />
            </span>
            <span>
              <strong>Baixar Modelo da Base</strong>
              <small>Estrutura oficial · sem dados</small>
            </span>
          </button>
          <button
            className="base-action"
            aria-label="Selecionar Nova Base"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <span className="action-icon">
              <FolderOpen size={22} />
            </span>
            <span>
              <strong>Selecionar Nova Base</strong>
              <small>Importar arquivo .xlsx do computador</small>
            </span>
          </button>
          <button
            className="base-action apply-action"
            aria-label="Atualizar Dashboard"
            disabled={busy || !candidate || !!blockers.length || !confirmed}
            onClick={() => void confirm()}
          >
            <span className="action-icon">
              <RefreshCw size={22} />
            </span>
            <span>
              <strong>Atualizar Dashboard</strong>
              <small>
                {busy
                  ? "Processando…"
                  : confirmed && candidate
                    ? "Base conferida · pronta para aplicar"
                    : "Requer validação e confirmação"}
              </small>
            </span>
          </button>
        </div>
        <input
          ref={input}
          type="file"
          aria-label="Selecionar planilha Excel"
          accept=".xlsx"
          hidden
          disabled={busy}
          onChange={(event) => void open(event.target.files?.[0])}
        />
        <p className="helper">
          {busy
            ? "Processando o Excel… A base em utilização permanece preservada."
            : candidate
              ? blockers.length
                ? "Base com erros bloqueantes. Corrija as ocorrências para habilitar a atualização."
                : confirmed
                  ? "Base validada e confirmada. Clique em Atualizar Dashboard para aplicá-la."
                  : "Prévia calculada. Confira os totais e marque a confirmação no final da prévia."
              : "Nenhuma nova base validada. O painel permanece com a última base aplicada."}
        </p>
      </section>
      {active && (
        <div className="active-base panel">
          <div>
            <h2>Base em utilização</h2>
            <p>
              {active.filename} · Referência: {displayDate(active.reference)} ·{" "}
              {active.records.length.toLocaleString("pt-BR")} registros
            </p>
            <small>
              {remote ? "Persistida na organização selecionada no Neon." : remembered
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
                setSuccess(
                  remote ? "Base desativada. Versões anteriores permanecem no histórico da organização." : "Base ativa removida. Versões anteriores permanecem no histórico local ou desta sessão.",
                );
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Falha ao remover a base.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Desativar base atual (preservar histórico)
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
            <p className="upload-guidance">
              Use <strong>Selecionar Nova Base</strong> nos controles acima. A
              estrutura é identificada e os totais são calculados
              automaticamente quando o mapeamento é reconhecido.
            </p>
            <small>
              {remote ? "Leitura local do Excel; conteúdo validado é enviado à API (até 3 MB de JSON)." : "Até 20 MB. Processamento no próprio navegador, sem envio do arquivo."} {busy ? "Processando…" : filename}
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
            Informe a data da extração. A referência sugerida só é aplicada após
            validação e confirmação; posições históricas mantêm sua própria data.
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
              "Confirmar os dados e clicar em Atualizar Dashboard",
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
              {remote ? "Os dados e as justificativas são enviados à organização autorizada. Nenhum cadastro concede acesso financeiro automaticamente." : "Os dados e as justificativas são locais. Não há autenticação administrativa nesta etapa. Use apenas um dispositivo confiável."}
            </p>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={remote || remember}
              disabled={busy || remote}
              onChange={(event) => setRemember(event.target.checked)}
            />
            {remote ? "Persistir a base na organização autorizada" : "Lembrar a nova base neste navegador"}
          </label>
          <p className="helper">
            {remote ? "A atualização exige confirmação e autorização da API; dados remotos não são copiados para o IndexedDB." : "Opcional: usa IndexedDB, sem sincronização ou backup. Outros usuários do mesmo perfil do navegador podem acessar. Limpar os dados do site remove a base."}
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
              {(["upcoming", "overdue", "received", "exposure"] as const).map(
                (key) => (
                  <div key={key}>
                    <span>
                      {key === "exposure"
                        ? "Exposição Financeira Total"
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
            Referência {displayDate(reference)} para fórmulas e aging, sem atualização automática para hoje. Recebido YTD: 01/01/
            {reference.slice(0, 4)} até {displayDate(reference)}. Advertências
            não removem registros e não impedem a visualização dos totais
            válidos.
          </p>
          <AuditTable dataset={candidate} readonly />
          <label className="check-label confirm-base">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !!blockers.length}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {active
              ? "Confirmar substituição da base"
              : "Confirmar utilização da base"}
            : conferi a estrutura, os totais e as advertências.
          </label>
          <a className="text-button back-to-actions" href="#base-actions">
            Voltar aos controles para Atualizar Dashboard
          </a>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setCandidate(null);
              setConfirmed(false);
            }}
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
