import { useEffect, useRef, useState } from "react";
import type { Dataset, FinancialRecord } from "../domain/types";
import { categoryLabel } from "../domain/types";
import { displayDate } from "../domain/dates";
import { money } from "../domain/money";
import { totals } from "../domain/finance";
import { cellText } from "../importacao/mapping";
export function DetailDialog({
  title,
  records,
  dataset,
  onClose,
}: {
  title: string;
  records: FinancialRecord[];
  dataset: Dataset;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0),
    [raw, setRaw] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const matched = records.filter((record) =>
    `${record.title} ${record.client} ${record.representative}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  const summary = totals(matched);
  const selected = dataset.records.find((record) => record.id === raw);
  const sheet = dataset.source.sheets.find(
    (item) => item.name === selected?.sheet,
  );
  const row = sheet?.rows.find((item) => item.number === selected?.row);
  const header = sheet?.rows.find(
    (item) =>
      item.number ===
      dataset.mappings.find((map) => map.sheet === sheet.name)?.header,
  );
  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      aria-label="Detalhamento financeiro"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-header">
        <div>
          <h2>{title}</h2>
          <p>
            {matched.length} registros · Limite Global: {money(summary.global)}
          </p>
        </div>
        <button className="secondary" autoFocus onClick={onClose}>
          Fechar detalhamento
        </button>
      </div>
      <label>
        Pesquisar título, cliente ou representante
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Título",
                "Cliente",
                "Representante",
                "Categoria",
                "Valor financeiro",
                "Vencimento",
                "Recebimento",
                "Origem",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matched.slice(page * 30, (page + 1) * 30).map((record) => (
              <tr key={record.id}>
                <td>{record.title || "Sem título"}</td>
                <td>{record.client || "Sem cliente"}</td>
                <td>{record.representative || "Sem representante"}</td>
                <td>{categoryLabel[record.category]}</td>
                <td>
                  {record.cents === null ? "Inválido" : money(record.cents)}
                </td>
                <td>{displayDate(record.due)}</td>
                <td>{displayDate(record.received)}</td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => setRaw(record.id)}
                  >
                    Linha {record.row}: ver original
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
          {matched.length ? page + 1 : 0} de {Math.ceil(matched.length / 30)}
        </span>
        <button
          className="secondary"
          disabled={(page + 1) * 30 >= matched.length}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
      </div>
      {row && (
        <section className="original-record">
          <h3>
            Registro original · {selected?.sheet} · linha {selected?.row}
          </h3>
          <p className="helper">
            Conteúdo preservado; a normalização financeira não modifica estes
            valores. Datas do Excel são representadas em ISO. Fórmulas e seus
            resultados salvos são exibidos integralmente.
          </p>
          <dl>
            {row.cells.map((value, index) => (
              <div key={index}>
                <dt>
                  Coluna {index + 1}: {cellText(header?.cells[index])}
                </dt>
                <dd>
                  {value && typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </dialog>
  );
}
