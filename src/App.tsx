import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  ListFilter,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { EmptyState } from "./components/EmptyState";
import { ImportManager } from "./components/ImportManager";
import { AuditTable } from "./components/AuditTable";
import { Ranking } from "./components/Ranking";
import { DetailDialog } from "./components/DetailDialog";
import {
  type Dataset,
  type Filters,
  type FinancialRecord,
  categoryLabel,
} from "./domain/types";
import {
  initialFilters,
  selectRecords,
  groupBy,
  totals,
} from "./domain/finance";
import { displayDate, cutoff } from "./domain/dates";
import { money, percentage } from "./domain/money";
import { localRepository } from "./persistencia/repository";
const FinancialCharts = lazy(() =>
  import("./components/FinancialCharts").then((module) => ({
    default: module.FinancialCharts,
  })),
);
type View = "dashboard" | "clientes" | "representantes" | "auditoria" | "base";
const navigation: { id: View; label: string; icon: typeof Activity }[] = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "representantes", label: "Representantes", icon: Activity },
  { id: "auditoria", label: "Auditoria", icon: ShieldCheck },
  { id: "base", label: "Gerenciar Base", icon: Database },
];
const emptyFilters: Filters = {
  year: "",
  month: "",
  client: "",
  representative: "",
  category: "",
};
export default function App() {
  const [view, setView] = useState<View>("dashboard"),
    [notice, setNotice] = useState(true);
  const [active, setActive] = useState<Dataset | null>(null),
    [remembered, setRemembered] = useState(false),
    [loading, setLoading] = useState(true),
    [storageError, setStorageError] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [detail, setDetail] = useState<{
    title: string;
    records: FinancialRecord[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    localRepository
      .load()
      .then((dataset) => {
        if (alive && dataset) {
          setActive(dataset);
          setRemembered(true);
          setFilters(initialFilters(dataset));
        }
      })
      .catch((error) => {
        if (alive)
          setStorageError(
            error.message +
              " Você ainda pode importar uma base para uso nesta sessão.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function commit(dataset: Dataset, remember: boolean) {
    if (remember) await localRepository.save(dataset);
    else if (remembered) await localRepository.clear();
    setActive(dataset);
    setRemembered(remember);
    setFilters(initialFilters(dataset));
    setStorageError("");
    setDetail(null);
  }
  async function forget() {
    await localRepository.clear();
    setActive(null);
    setRemembered(false);
    setFilters(emptyFilters);
    setDetail(null);
  }
  async function review(id: string, note: string) {
    if (!active) return;
    const next: Dataset = {
      ...active,
      reviews: {
        ...active.reviews,
        [id]: { note, reviewedAt: new Date().toISOString() },
      },
    };
    if (remembered) await localRepository.save(next);
    setActive(next);
  }
  const records = useMemo(
    () => (active ? selectRecords(active, filters) : []),
    [active, filters],
  );
  const summary = useMemo(() => totals(records), [records]);
  const clients = useMemo(() => groupBy(records, "client"), [records]);
  const representatives = useMemo(
    () => groupBy(records, "representative"),
    [records],
  );
  const allClients = useMemo(
    () =>
      [
        ...new Set(
          active?.records.map((record) => record.client || "Sem cliente") ?? [],
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [active],
  );
  const allRepresentatives = useMemo(
    () =>
      [
        ...new Set(
          active?.records.map(
            (record) => record.representative || "Sem representante",
          ) ?? [],
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [active],
  );
  const years = useMemo(
    () =>
      [
        ...new Set([
          active?.reference.slice(0, 4),
          ...(active?.records
            .filter(
              (record) =>
                record.received && record.received <= active.reference,
            )
            .map((record) => record.received!.slice(0, 4)) ?? []),
        ]),
      ]
        .filter((value): value is string => !!value)
        .sort()
        .reverse(),
    [active],
  );
  const recordIds = useMemo(
    () => new Set(records.map((record) => record.id)),
    [records],
  );
  const issues = useMemo(
    () =>
      active?.issues.filter(
        (issue) =>
          !issue.records.length ||
          issue.records.some((id) => recordIds.has(id)),
      ) ?? [],
    [active, recordIds],
  );
  const heading = navigation.find((item) => item.id === view)!.label;
  function selectFilter(key: keyof Filters, value: string) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (
        key === "year" &&
        active &&
        value === active.reference.slice(0, 4) &&
        next.month > active.reference.slice(5, 7)
      )
        next.month = active.reference.slice(5, 7);
      return next;
    });
    setDetail(null);
  }
  function showGroup(name: string) {
    const representative = view === "representantes";
    setDetail({
      title: name,
      records: records.filter(
        (record) =>
          (representative
            ? record.representative || "Sem representante"
            : record.client || "Sem cliente") === name,
      ),
    });
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={() => setView("dashboard")}
          aria-label="BIOSAÚDE — início"
        >
          <span className="brand-symbol">
            B<span>+</span>
          </span>
          <div>
            BIOSAÚDE<small>PRODUTOS HOSPITALARES</small>
          </div>
        </a>
        <div className="workspace-label">INTELIGÊNCIA FINANCEIRA</div>
        <nav aria-label="Navegação principal">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              aria-current={view === id ? "page" : undefined}
              onClick={() => setView(id)}
            >
              <Icon size={19} />
              {label}
              {view === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="secure-icon">
            <ShieldCheck size={20} />
          </span>
          <strong>Seus dados, sob controle</strong>
          <p>
            Planilhas processadas no seu navegador. Sem envio dos dados
            financeiros.
          </p>
          <span className="version">POSIÇÃO FINANCEIRA · V1.0</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Financeiro <ChevronRight size={14} />
            <strong>{heading}</strong>
          </div>
          <span className={`status ${active ? "loaded" : ""}`}>
            <i />
            {loading
              ? "Verificando base local…"
              : active
                ? `Referência: ${displayDate(active.reference)}`
                : "Sem base importada"}
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PAINEL EXECUTIVO</div>
              <h1>
                {view === "dashboard" ? "Limite Global por Cliente" : heading}
              </h1>
              <p>
                {active
                  ? `${active.filename} · ${active.records.length.toLocaleString("pt-BR")} registros preservados`
                  : "Uma visão integrada da sua posição financeira."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setView(view === "base" ? "dashboard" : "base")}
            >
              <FileSpreadsheet size={17} />
              {view === "base" ? "Voltar ao dashboard" : "Gerenciar Base"}
            </button>
          </div>
          {storageError && (
            <div className="error-banner" role="alert">
              {storageError}
            </div>
          )}
          {notice && (
            <div className="info-banner">
              <ShieldCheck size={21} />
              <div>
                <strong>
                  {active
                    ? remembered
                      ? "Base salva somente neste navegador"
                      : "Base disponível somente nesta sessão"
                    : "Pronto para receber sua base financeira"}
                </strong>
                <p>
                  {active
                    ? remembered
                      ? "A base e as conferências ficam neste dispositivo. Não há sincronização com servidor ou outros dispositivos."
                      : "Ao recarregar ou fechar a página, os dados desta sessão serão perdidos. Use Gerenciar Base para importar novamente."
                    : "Importe seu Excel, confira o mapeamento e confirme a base. Nenhum indicador é simulado."}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar aviso"
                onClick={() => setNotice(false)}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {loading ? (
            <p role="status">Carregando armazenamento local…</p>
          ) : view === "base" ? (
            <ImportManager
              active={active}
              remembered={remembered}
              onCommit={commit}
              onForget={forget}
            />
          ) : (
            <>
              <section className="filters" aria-label="Filtros financeiros">
                <span className="filter-label">
                  <ListFilter size={17} />
                  Filtros
                </span>
                <label>
                  Ano
                  <select
                    aria-label="Ano"
                    value={filters.year}
                    disabled={!active}
                    onChange={(event) =>
                      selectFilter("year", event.target.value)
                    }
                  >
                    {!active && <option value="">Sem exercício</option>}
                    {years.map((year) => (
                      <option key={year}>{year}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Mês de referência
                  <select
                    aria-label="Mês de referência"
                    value={filters.month}
                    disabled={!active}
                    onChange={(event) =>
                      selectFilter("month", event.target.value)
                    }
                  >
                    {!active && <option value="">Sem referência</option>}
                    {Array.from({ length: 12 }, (_, index) =>
                      String(index + 1).padStart(2, "0"),
                    ).map((month) => (
                      <option
                        key={month}
                        value={month}
                        disabled={
                          !!active &&
                          filters.year === active.reference.slice(0, 4) &&
                          month > active.reference.slice(5, 7)
                        }
                      >
                        {new Date(
                          2026,
                          Number(month) - 1,
                          1,
                        ).toLocaleDateString("pt-BR", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cliente
                  <select
                    aria-label="Cliente"
                    value={filters.client}
                    disabled={!active}
                    onChange={(event) =>
                      selectFilter("client", event.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    {allClients.map((client) => (
                      <option key={client}>{client}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Representante
                  <select
                    aria-label="Representante"
                    value={filters.representative}
                    disabled={!active}
                    onChange={(event) =>
                      selectFilter("representative", event.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    {allRepresentatives.map((rep) => (
                      <option key={rep}>{rep}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Categoria financeira
                  <select
                    aria-label="Categoria financeira"
                    value={filters.category}
                    disabled={!active}
                    onChange={(event) =>
                      selectFilter("category", event.target.value)
                    }
                  >
                    <option value="">Todas</option>
                    {Object.entries(categoryLabel).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                {active && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setFilters(initialFilters(active));
                      setDetail(null);
                    }}
                  >
                    Limpar filtros
                  </button>
                )}
                <span className="filter-help">
                  {active
                    ? `Saldos fixos da posição de ${displayDate(active.reference)}. Recebido YTD de 01/01/${filters.year} até ${displayDate(cutoff(active.reference, filters.year, filters.month))}. Alterar o período não reconstrói saldos históricos.`
                    : "Disponíveis após importação"}
                </span>
              </section>
              {view === "dashboard" && (
                <>
                  <section
                    className="kpi-grid"
                    aria-label="Indicadores financeiros"
                  >
                    {[
                      {
                        key: "global",
                        title: "Limite Global",
                        description: "A Vencer + Vencido + Recebido YTD",
                        icon: Wallet,
                        className: "global",
                      },
                      {
                        key: "upcoming",
                        title: "A Vencer",
                        description: "Saldos em aberto a vencer",
                        icon: CalendarDays,
                        className: "upcoming",
                      },
                      {
                        key: "overdue",
                        title: "Vencido",
                        description: "Saldos em aberto em atraso",
                        icon: ArrowUpRight,
                        className: "overdue",
                      },
                      {
                        key: "received",
                        title: "Recebido YTD",
                        description: "Recebimentos acumulados no ano",
                        icon: ArrowDownLeft,
                        className: "received",
                      },
                    ].map(
                      ({ key, title, description, icon: Icon, className }) => (
                        <article className={`kpi ${className}`} key={key}>
                          <div className="kpi-label">
                            {title}
                            <span>
                              <Icon size={19} />
                            </span>
                          </div>
                          <div
                            className="kpi-value"
                            aria-label={`${title}: ${active ? money(summary[key as keyof Omit<typeof summary, "count">]) : "sem dados"}`}
                          >
                            {active ? (
                              money(
                                summary[
                                  key as keyof Omit<typeof summary, "count">
                                ],
                              )
                            ) : (
                              <>
                                —<small>BRL</small>
                              </>
                            )}
                          </div>
                          <p>{description}</p>
                          <div className="kpi-footer">
                            <span className="tiny-dot" />
                            {active
                              ? `${summary.count.toLocaleString("pt-BR")} registros na seleção`
                              : "Aguardando base"}
                            <span>
                              {active
                                ? percentage(
                                    summary[
                                      key as keyof Omit<typeof summary, "count">
                                    ],
                                    summary.global,
                                  )
                                : "—"}
                            </span>
                          </div>
                        </article>
                      ),
                    )}
                  </section>
                  <p className="definition">
                    Limite Global é um indicador financeiro e não representa
                    crédito contratual concedido ao cliente.
                  </p>
                  <Suspense
                    fallback={<p role="status">Carregando gráficos…</p>}
                  >
                    <FinancialCharts
                      records={records}
                      summary={summary}
                      reference={active?.reference ?? ""}
                      loaded={!!active}
                    />
                  </Suspense>
                </>
              )}
              {view === "auditoria" ? (
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Auditoria da base</h2>
                      <p>
                        Conferência local, sem exclusão de registros ou
                        simulação de permissões administrativas.
                      </p>
                    </div>
                    <ShieldCheck size={22} />
                  </div>
                  <div className="audit-summary">
                    {[
                      ["Registros preservados na seleção", records.length],
                      [
                        "Advertências na seleção",
                        issues.filter((issue) => issue.severity === "warning")
                          .length,
                      ],
                      [
                        "Erros bloqueantes na seleção",
                        issues.filter((issue) => issue.severity === "error")
                          .length,
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>
                          {active ? Number(value).toLocaleString("pt-BR") : "—"}
                        </strong>
                      </div>
                    ))}
                  </div>
                  {active ? (
                    <AuditTable
                      dataset={active}
                      issues={issues}
                      onReview={review}
                      onDetail={(ids) =>
                        setDetail({
                          title: "Conferência de registros",
                          records: active.records.filter((record) =>
                            ids.includes(record.id),
                          ),
                        })
                      }
                    />
                  ) : (
                    <EmptyState message="Importe uma planilha para conferir valores, datas e possíveis sobreposições." />
                  )}
                </section>
              ) : (
                <Ranking
                  key={
                    view === "representantes" ? "representatives" : "clients"
                  }
                  groups={view === "representantes" ? representatives : clients}
                  total={summary.global}
                  loaded={!!active}
                  representative={view === "representantes"}
                  onDetail={showGroup}
                />
              )}
            </>
          )}
          <footer>
            <span>
              BIOSAÚDE <span className="footer-divider">/</span> Inteligência
              para decisões financeiras
            </span>
            <span>
              <Check size={14} />
              Sem conexão ao Neon · dados locais
            </span>
          </footer>
        </main>
      </div>
      {detail && active && (
        <DetailDialog
          dataset={active}
          title={detail.title}
          records={detail.records}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
