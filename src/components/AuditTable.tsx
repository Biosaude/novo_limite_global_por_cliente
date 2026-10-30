import { useMemo, useState } from "react";
import { usePersistence } from "../persistencia/context";
import type { Dataset, Issue } from "../domain/types";
import { categoryLabel } from "../domain/types";
import { EmptyState } from "./EmptyState";
export function AuditTable({
  dataset,
  readonly = false,
  issues = dataset.issues,
  onReview,
  onDetail,
}: {
  dataset: Dataset;
  readonly?: boolean;
  issues?: Issue[];
  onReview?: (id: string, note: string) => Promise<void>;
  onDetail?: (ids: string[]) => void;
}) {
  const { mode } = usePersistence();
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(0);
  const [editing, setEditing] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const lookup = useMemo(
    () => new Map(dataset.records.map((record) => [record.id, record])),
    [dataset.records],
  );
  const matched = issues.filter(
    (issue) =>
      (!kind || issue.severity === kind) &&
      `${issue.message} ${issue.records
        .map((id) => {
          const record = lookup.get(id);
          return `${record?.title} ${record?.client} ${record?.sheet} ${record?.row}`;
        })
        .join(" ")}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  const effectivePage = Math.min(
    page,
    Math.max(0, Math.ceil(matched.length / 25) - 1),
  );
  return (
    <div className="audit-table">
      <div className="table-controls">
        <label>
          Pesquisar ocorrências
          <input
            type="search"
            aria-label="Pesquisar auditoria"
            placeholder="Título, cliente ou ocorrência"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Severidade
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas</option>
            <option value="warning">Advertências</option>
            <option value="error">Erros bloqueantes</option>
          </select>
        </label>
        <span>{matched.length.toLocaleString("pt-BR")} ocorrências</span>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {matched.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Origem / título</th>
                  <th>Ocorrência</th>
                  {!readonly && <th>{mode === "remote" ? "Conferência" : "Conferência local"}</th>}
                </tr>
              </thead>
              <tbody>
                {matched
                  .slice(effectivePage * 25, (effectivePage + 1) * 25)
                  .map((issue) => (
                    <tr key={issue.id}>
                      <td>
                        <span
                          className={
                            issue.severity === "error"
                              ? "badge error"
                              : "badge warning"
                          }
                        >
                          {issue.severity === "error"
                            ? "Erro bloqueante"
                            : "Advertência"}
                        </span>
                      </td>
                      <td>
                        {issue.records.map((id) => {
                          const record = lookup.get(id);
                          return (
                            <div key={id} className="audit-origin">
                              <strong>{record?.title || "Sem título"}</strong>
                              <small>
                                {record && categoryLabel[record.category]} ·
                                linha {record?.row}
                              </small>
                              {onDetail && (
                                <button
                                  className="text-button"
                                  onClick={() => onDetail([id])}
                                >
                                  Ver registro
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </td>
                      <td className="audit-message">{issue.message}</td>
                      {!readonly && (
                        <td className="audit-note">
                          {dataset.reviews[issue.id] && (
                            <p>
                              <strong>Conferido localmente</strong>
                              <br />
                              {dataset.reviews[issue.id].note}
                              <small>
                                {new Date(
                                  dataset.reviews[issue.id].reviewedAt,
                                ).toLocaleString("pt-BR")}
                              </small>
                            </p>
                          )}
                          {editing === issue.id ? (
                            <form
                              onSubmit={async (event) => {
                                event.preventDefault();
                                setError("");
                                if (!note.trim()) {
                                  setError("Informe uma justificativa.");
                                  return;
                                }
                                setSaving(true);
                                try {
                                  await onReview?.(issue.id, note.trim());
                                  setEditing("");
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : "Falha ao salvar justificativa.",
                                  );
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              <label>
                                Justificativa
                                <textarea
                                  aria-label="Justificativa"
                                  disabled={saving}
                                  value={note}
                                  maxLength={2000}
                                  required
                                  onChange={(event) =>
                                    setNote(event.target.value)
                                  }
                                />
                              </label>
                              <button
                                className="secondary"
                                type="submit"
                                disabled={saving}
                              >
                                {saving
                                  ? "Salvando justificativa…"
                                  : "Salvar justificativa"}
                              </button>
                              <button
                                className="text-button"
                                type="button"
                                disabled={saving}
                                onClick={() => setEditing("")}
                              >
                                Cancelar
                              </button>
                            </form>
                          ) : (
                            <button
                              className="secondary"
                              onClick={() => {
                                setEditing(issue.id);
                                setNote(dataset.reviews[issue.id]?.note ?? "");
                              }}
                            >
                              Registrar conferência
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              className="secondary"
              disabled={!effectivePage}
              onClick={() => setPage(effectivePage - 1)}
            >
              Anterior
            </button>
            <span>
              Página {effectivePage + 1} de{" "}
              {Math.max(1, Math.ceil(matched.length / 25))}
            </span>
            <button
              className="secondary"
              disabled={(effectivePage + 1) * 25 >= matched.length}
              onClick={() => setPage(effectivePage + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      ) : (
        <EmptyState message="Nenhuma ocorrência encontrada para esta seleção." />
      )}
    </div>
  );
}
