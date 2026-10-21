import { useState } from "react";
import type { Dataset } from "../domain/types";
import { displayDate } from "../domain/dates";
export function BaseHistory({
  versions,
  activeId,
  onRestore,
}: {
  versions: Dataset[];
  activeId?: string;
  onRestore: (dataset: Dataset) => Promise<void>;
}) {
  const [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const available = versions.filter((version) => version.id !== activeId);
  return (
    <section className="panel base-history">
      <div className="panel-title">
        <div>
          <h2>Histórico de posições financeiras</h2>
          <p>
            Uma posição por vez. Reativar uma versão não soma ou mistura
            registros de referências diferentes.
          </p>
        </div>
        <span className="tag">{available.length} versões anteriores</span>
      </div>
      {available.length ? (
        <>
          <label>
            Versão anterior
            <select
              aria-label="Versão anterior"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Selecione uma posição</option>
              {available.map((version) => (
                <option key={version.id} value={version.id}>
                  {displayDate(version.reference)} · {version.filename} ·{" "}
                  {version.records.length} registros ·{" "}
                  {new Date(version.importedAt).toLocaleString("pt-BR")}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            disabled={!selected || busy}
            onClick={async () => {
              const dataset = available.find(
                (version) => version.id === selected,
              );
              if (!dataset) return;
              setBusy(true);
              setError("");
              try {
                await onRestore(dataset);
                setSelected("");
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Não foi possível reativar a posição.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Reativar versão selecionada
          </button>
        </>
      ) : (
        <p className="helper">
          Versões anteriores aparecerão após a substituição de uma base. Versões
          em memória duram esta sessão; versões salvas no navegador permanecem
          no histórico local.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}
