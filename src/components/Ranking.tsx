import { useState } from "react";
import type { Group, Totals } from "../domain/types";
import { money, percentage } from "../domain/money";
import { EmptyState } from "./EmptyState";
const columns = [
  ["name", "Nome"],
  ["upcoming", "A Vencer"],
  ["overdue", "Vencido"],
  ["received", "Recebido YTD"],
  ["global", "Limite Global"],
  ["participation", "Participação"],
  ["count", "Registros"],
] as const;
export function Ranking({
  groups,
  total,
  representative = false,
  loaded,
  onDetail,
}: {
  groups: Group[];
  total: number;
  representative?: boolean;
  loaded: boolean;
  onDetail: (name: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("global"),
    [ascending, setAscending] = useState(false),
    [page, setPage] = useState(0);
  const sorted = groups
    .filter((group) =>
      group.name
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => {
      const key = sort === "participation" ? "global" : sort;
      const comparison =
        key === "name"
          ? a.name.localeCompare(b.name, "pt-BR")
          : a[key as keyof Totals] - b[key as keyof Totals];
      const ordered =
        sort === "participation" && total < 0 ? -comparison : comparison;
      return ascending ? ordered : -ordered;
    });
  const effectivePage = Math.min(
    page,
    Math.max(0, Math.ceil(sorted.length / 20) - 1),
  );
  return (
    <section className="panel ranking">
      <div className="panel-title">
        <div>
          <h2>
            {representative
              ? "Indicadores por representante"
              : "Ranking de clientes"}
          </h2>
          <p>
            {groups.length.toLocaleString("pt-BR")}{" "}
            {representative ? "representantes" : "clientes"} · totais e
            participação respeitam os filtros globais
          </p>
        </div>
        <label className="search">
          <input
            type="search"
            aria-label="Pesquisar ranking"
            placeholder={
              representative ? "Pesquisar representante" : "Pesquisar cliente"
            }
            value={query}
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
              {columns.map(([key, title]) => (
                <th
                  key={key}
                  aria-sort={
                    sort === key
                      ? ascending
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      setAscending(sort === key ? !ascending : key === "name");
                      setSort(key);
                    }}
                  >
                    {key === "name"
                      ? representative
                        ? "Representante"
                        : "Cliente"
                      : title}
                    {sort === key ? (ascending ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length ? (
              sorted
                .slice(effectivePage * 20, (effectivePage + 1) * 20)
                .map((group) => (
                  <tr key={group.name}>
                    <td>
                      <button
                        className="text-button client-link"
                        onClick={() => onDetail(group.name)}
                      >
                        {group.name}
                      </button>
                    </td>
                    <td>{money(group.upcoming)}</td>
                    <td>{money(group.overdue)}</td>
                    <td>{money(group.received)}</td>
                    <td>
                      <strong>{money(group.global)}</strong>
                    </td>
                    <td>{percentage(group.global, total)}</td>
                    <td>{group.count}</td>
                  </tr>
                ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    message={
                      !loaded
                        ? query
                          ? `Nenhuma base carregada para pesquisar “${query}”.`
                          : "Importe a planilha para consultar o ranking e o detalhamento financeiro."
                        : "Nenhum registro encontrado para a seleção."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!!sorted.length && (
        <div className="pagination">
          <button
            className="secondary"
            disabled={!effectivePage}
            onClick={() => setPage(effectivePage - 1)}
          >
            Anterior
          </button>
          <span>
            Página {effectivePage + 1} de {Math.ceil(sorted.length / 20)} ·{" "}
            {sorted.length} grupos
          </span>
          <button
            className="secondary"
            disabled={(effectivePage + 1) * 20 >= sorted.length}
            onClick={() => setPage(effectivePage + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
