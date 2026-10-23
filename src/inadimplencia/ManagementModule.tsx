import { useMemo, useRef, useState, useEffect } from "react";
import {
  Wallet,
  Phone,
  Handshake,
  Scale,
  ArrowDownLeft,
  Percent,
} from "lucide-react";
import type { Dataset, FinancialRecord } from "../domain/types";
import { currentDate, displayDate } from "../domain/dates";
import { money, cents } from "../domain/money";
import { ManagementCharts } from "./ManagementCharts";
import {
  stages,
  managementView,
  managementTitles,
  latestProcesses,
  appendTreatment,
  appendProcess,
  exportOperations,
  importOperations,
  processTemplate,
  parseProcessList,
  initialManagementFilters,
  type Operations,
  type Treatment,
  type LegalProcess,
  type ManagementFilters,
} from "./model";
import { reportNames, type ReportKind } from "./reportConfig";
const actionBlank = () => ({
  titleKey: "",
  status: "Não iniciado" as Treatment["status"],
  responsible: "",
  contactDate: currentDate(),
  action: "",
  result: "",
  nextStep: "",
  nextDate: "",
  notes: "",
  agreementReference: "",
  agreementValue: "",
});
const processBlank = () => ({
  processId: "",
  number: "",
  interested: "",
  opponent: "",
  kind: "",
  actionType: "",
  court: "",
  claimValue: "",
  status: "",
  responsible: "",
  nextStep: "",
  titleKeys: [] as string[],
  linksConfirmed: false,
  source: "",
});
export function ManagementModule({
  dataset,
  store,
  onChange,
  onTrace,
}: {
  dataset: Dataset | null;
  store: Operations;
  onChange: (s: Operations) => void;
  onTrace: (r: FinancialRecord) => void;
}) {
  const [filters, setFilters] = useState(() =>
      initialManagementFilters(dataset),
    ),
    [action, setAction] = useState(actionBlank),
    [process, setProcess] = useState(processBlank),
    [titleSearch, setTitleSearch] = useState(""),
    [page, setPage] = useState(0),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [kind, setKind] = useState<ReportKind>("pending"),
    [pending, setPending] = useState<Operations | null>(null),
    [processDrafts, setProcessDrafts] = useState<
      ReturnType<typeof parseProcessList>
    >([]),
    [confirm, setConfirm] = useState(false);
  const all = useMemo(
    () => (dataset ? managementTitles(dataset) : []),
    [dataset],
  );
  const v = useMemo(
    () => (dataset ? managementView(dataset, store, filters) : null),
    [dataset, store, filters],
  );
  const latest = useRef(v);
  latest.current = v;
  useEffect(
    () => () => {
      latest.current = null;
    },
    [],
  );
  useEffect(() => {
    setPending(null);
    setProcessDrafts([]);
    setConfirm(false);
  }, [store]);
  const formRef = useRef<HTMLFormElement>(null);
  const update = (key: keyof ManagementFilters, value: string | number[]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  const downloadBytes = async (
    bytes: Uint8Array,
    name: string,
    mime: string,
  ) => {
    (await import("../relatorios/download")).downloadReport(bytes, name, mime);
  };
  async function exportReport(type: "xlsx" | "pdf") {
    if (!v) return;
    const snapshot = v;
    setBusy(type);
    setError("");
    try {
      const r = await import("./reports");
      const bytes =
        type === "xlsx"
          ? await r.managementExcel(snapshot, store, kind)
          : await r.managementPdf(
              snapshot,
              store,
              kind,
              await (await import("../relatorios/pdf")).loadPdfFont(),
            );
      if (latest.current !== snapshot) return;
      await downloadBytes(
        bytes,
        `${kind}_Biosaude_${dataset!.reference}.${type}`,
        type === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy("");
    }
  }
  async function backup() {
    if (!dataset) return;
    setError("");
    try {
      await downloadBytes(
        new TextEncoder().encode(await exportOperations(dataset, store)),
        `Historico_Inadimplencia_${dataset.reference}.json`,
        "application/json",
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  async function readFile(file: File | undefined, type: "backup" | "process") {
    if (!file || !dataset) return;
    setError("");
    setPending(null);
    setProcessDrafts([]);
    setConfirm(false);
    const snapshot = v;
    try {
      if (file.size > (type === "backup" ? 4_000_000 : 2_000_000))
        throw new Error("Arquivo acima do limite permitido.");
      const text = await file.text();
      if (type === "backup") {
        const next = await importOperations(dataset, store, text);
        if (latest.current === snapshot) setPending(next);
      } else if (latest.current === snapshot)
        setProcessDrafts(parseProcessList(text));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  function saveAction(e: React.FormEvent) {
    e.preventDefault();
    if (!dataset) return;
    setError("");
    try {
      const { agreementValue, ...data } = action;
      onChange(
        appendTreatment(dataset, store, {
          ...data,
          agreementCents: agreementValue.trim() ? cents(agreementValue) : null,
        }),
      );
      setNotice("Tratamento registrado; histórico anterior preservado.");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  function saveProcess(e: React.FormEvent) {
    e.preventDefault();
    if (!dataset) return;
    setError("");
    try {
      const { claimValue, ...data } = process;
      onChange(
        appendProcess(dataset, store, {
          ...data,
          kind: data.kind as LegalProcess["kind"],
          processId: data.processId || crypto.randomUUID(),
          claimCents: claimValue.trim() ? cents(claimValue) : null,
        }),
      );
      setProcess(processBlank());
      setNotice(
        "Processo registrado; revisão e vínculos preservados no histórico.",
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  const field = (
    label: string,
    name: keyof ReturnType<typeof actionBlank>,
    type = "text",
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        value={String(action[name])}
        maxLength={name === "responsible" ? 200 : 3000}
        required={["responsible", "action", "contactDate"].includes(name)}
        onChange={(e) => setAction((a) => ({ ...a, [name]: e.target.value }))}
      />
    </label>
  );
  const pField = (
    label: string,
    name: Exclude<
      keyof ReturnType<typeof processBlank>,
      "titleKeys" | "linksConfirmed"
    >,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={process[name]}
        maxLength={name === "nextStep" ? 3000 : 300}
        required={name === "number"}
        onChange={(e) => setProcess((p) => ({ ...p, [name]: e.target.value }))}
      />
    </label>
  );
  const select = (
    label: string,
    key: keyof ManagementFilters,
    values: [string, string][],
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={String(filters[key])}
        onChange={(e) => update(key, e.target.value)}
        disabled={!dataset}
      >
        {values.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const clients = [
      ...new Set(all.flatMap((t) => t.rows.map((r) => r.client))),
    ].sort(),
    representatives = [
      ...new Set(all.flatMap((t) => t.rows.map((r) => r.representative))),
    ].sort();
  const processes = latestProcesses(store);
  const effectivePage = Math.min(
    page,
    Math.max(0, Math.ceil((v?.rows.length ?? 0) / 20) - 1),
  );
  return (
    <div className="management-module">
      <section className="info-banner operational-warning">
        <div>
          <strong>Acompanhamento temporário em memória</strong>
          <p>
            Ao recarregar ou fechar a página, tratamentos e processos desta
            sessão serão perdidos. Exporte o histórico JSON e guarde-o em local
            autorizado para reimportação na mesma base. Não há salvamento
            automático nem autenticação adicional. Responsáveis são declarados.
          </p>
        </div>
      </section>
      {busy && <p role="status">Gerando relatório…</p>}
      {notice && (
        <p role="status" className="info-banner">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}{" "}
      <section className="filters">
        <div className="filter-heading">
          <div>
            <h2>Filtros da carteira e recuperação</h2>
            <p>
              Saldo fixo da posição. Ano e mês limitam apenas recebimentos; não
              reconstroem carteiras históricas.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setFilters(initialManagementFilters(dataset));
              setPage(0);
            }}
          >
            Limpar filtros da gestão
          </button>
        </div>
        <div className="management-fields">
          {select("Ano da recuperação", "year", [
            ["", "Todos"],
            ...[
              ...new Set(
                [
                  dataset?.reference.slice(0, 4),
                  ...(dataset?.records
                    .filter((r) => r.category === "received")
                    .map((r) => r.received?.slice(0, 4)) ?? []),
                ].filter(Boolean),
              ),
            ]
              .sort()
              .map((y) => [y!, y!] as [string, string]),
          ])}
          {select("Mês da recuperação", "month", [
            ["", "Todos"],
            ...Array.from(
              { length: 12 },
              (_, i) =>
                [
                  String(i + 1).padStart(2, "0"),
                  String(i + 1).padStart(2, "0"),
                ] as [string, string],
            ),
          ])}
          {select("Cliente da gestão", "client", [
            ["", "Todos"],
            ...clients.map((c) => [c, c] as [string, string]),
          ])}
          {select("Representante da gestão", "representative", [
            ["", "Todos"],
            ...representatives.map((c) => [c, c] as [string, string]),
          ])}
          {select("Status de tratamento", "status", [
            ["", "Todos"],
            ["pending", "Pendente de classificação"],
            ...stages.map((s) => [s, s] as [string, string]),
          ])}
          {select("Responsável pelo tratamento", "responsible", [
            ["", "Todos"],
            ...[...new Set(store.actions.map((a) => a.responsible))]
              .sort()
              .map((s) => [s, s] as [string, string]),
          ])}
          {select("Vínculo de ajuizamento", "legal", [
            ["", "Todos"],
            ["yes", "Judicial confirmado"],
            ["pending", "Sem vínculo confirmado"],
          ])}
          <label>
            Pesquisar carteira
            <input
              aria-label="Pesquisar carteira"
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
            />
          </label>
        </div>
        <fieldset className="collection-bands">
          <legend>Faixas de Aging da gestão</legend>
          {[
            "1–30 dias",
            "31–60 dias",
            "61–90 dias",
            "91–180 dias",
            "Acima de 180 dias",
          ].map((name, i) => (
            <label key={name}>
              <input
                type="checkbox"
                aria-label={`Gestão faixa ${name}`}
                checked={filters.bands.includes(i + 1)}
                onChange={() =>
                  update(
                    "bands",
                    filters.bands.includes(i + 1)
                      ? filters.bands.filter((b) => b !== i + 1)
                      : [...filters.bands, i + 1],
                  )
                }
              />
              {name}
            </label>
          ))}
        </fieldset>
      </section>
      {!v ? (
        <div className="panel">
          Importe e ative uma base para acompanhar a inadimplência.
        </div>
      ) : (
        <>
          <section
            className="kpi-grid management-kpis"
            aria-label="Indicadores de gestão"
          >
            {[
              [
                "Total Vencido",
                v.summary.total,
                Wallet,
                "Saldo aberto da aba Vencidos; posição " +
                  displayDate(dataset!.reference),
              ],
              [
                "Em Cobrança Administrativa",
                v.summary.administrative,
                Phone,
                "Etapa principal declarada; cobertura parcial",
              ],
              [
                "Em Negociação",
                v.summary.negotiation,
                Handshake,
                "Negociação ativa declarada; sem somar etapas",
              ],
              [
                "Judicializado",
                v.summary.judicial,
                Scale,
                "Somente vínculos judiciais confirmados; cobertura parcial",
              ],
              [
                "Valor Recuperado",
                v.summary.recovered,
                ArrowDownLeft,
                "Recebimentos pós-vencimento no período; fluxo separado do estoque",
              ],
              [
                "Taxa de Recuperação",
                null,
                Percent,
                "Não disponível: falta carteira elegível de abertura conciliada",
              ],
            ].map(([name, value, Icon, description]) => {
              const Symbol = Icon as typeof Wallet;
              return (
                <article className="kpi" key={String(name)}>
                  <div className="kpi-label">
                    {String(name)}
                    <span>
                      <Symbol size={18} />
                    </span>
                  </div>
                  <div className="kpi-value">
                    {value === null ? "Não disponível" : money(value as number)}
                  </div>
                  <p>{String(description)}</p>
                </article>
              );
            })}
          </section>
          <p className="helper">
            Fluxo recebido: ano {filters.year || "todos"}, mês{" "}
            {filters.month || "todos"}, limitado a{" "}
            {displayDate(dataset!.reference)}. Taxa: denominador de abertura não
            informado.
          </p>
          <p className="helper">
            {v.summary.classified} títulos classificados · {v.summary.pending}{" "}
            pendentes. Etapas são exclusivas; judicialização é complementar. Não
            some os cards entre si. Valor da causa e recebimentos não alteram o
            saldo aberto.
          </p>
          {v.summary.invalid > 0 && (
            <p role="alert">
              Existem valores inválidos; totais parciais e relatórios
              bloqueados. Confira a Auditoria.
            </p>
          )}
          {v.summary.recoveryUnknown > 0 && (
            <p role="status" className="receipt-warning">
              {v.summary.recoveryUnknown} recebimentos sem datas ou valores
              suficientes. O fluxo considera apenas os lançamentos
              classificáveis; se não houver cobertura, fica indisponível.
            </p>
          )}
          {v.summary.operationalCash && (
            <p className="helper">
              Filtros operacionais restringem os recebimentos aos títulos
              identificáveis da carteira selecionada; recebimentos sem vínculo
              exato ficam fora desse recorte.
            </p>
          )}
          <ManagementCharts view={v} />
          <section className="panel">
            <h3>Pendências por responsável</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Responsável declarado</th>
                    <th>Títulos</th>
                    <th>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {v.responsible.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{r.count}</td>
                      <td>{money(r.value)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Sem tratamento classificado</td>
                    <td>{v.summary.pending}</td>
                    <td>{money(v.stages[0].value)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h3>Controle de cobranças e histórico</h3>
            <p className="helper">
              Cada atualização acrescenta uma ação. Etapas não mudam saldos ou
              quitam títulos. Não inclua dados de pacientes nas observações.
            </p>
            <form
              ref={formRef}
              className="management-form"
              onSubmit={saveAction}
            >
              <label>
                Duplicata para tratamento
                <select
                  aria-label="Duplicata para tratamento"
                  required
                  value={action.titleKey}
                  onChange={(e) =>
                    setAction((a) => ({ ...a, titleKey: e.target.value }))
                  }
                >
                  <option value="">Selecionar título</option>
                  {all.map((t) => (
                    <option value={t.key} key={t.key}>
                      {t.rows[0].client} ·{" "}
                      {t.rows[0].title || t.rows[0].document} ·{" "}
                      {money(
                        t.rows.reduce((s, r) => s + (r.openCents ?? 0), 0),
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nova etapa
                <select
                  aria-label="Nova etapa"
                  value={action.status}
                  onChange={(e) =>
                    setAction((a) => ({
                      ...a,
                      status: e.target.value as Treatment["status"],
                    }))
                  }
                >
                  {stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {field("Responsável da ação", "responsible")}
              {field("Data do contato", "contactDate", "date")}
              {field("Ação realizada", "action")}
              {field("Resultado do contato", "result")}
              {field("Próxima providência da ação", "nextStep")}
              {field("Data prevista da ação", "nextDate", "date")}
              {field("Observações da ação", "notes")}
              {field("Referência do acordo", "agreementReference")}
              {field("Valor do acordo (não altera saldo)", "agreementValue")}
              <button className="primary" type="submit">
                Registrar tratamento
              </button>
            </form>
            {action.titleKey && (
              <div className="table-scroll">
                <table aria-label="Histórico do título">
                  <thead>
                    <tr>
                      <th>Revisão</th>
                      <th>Contato</th>
                      <th>Status</th>
                      <th>Responsável</th>
                      <th>Ação e resultado</th>
                      <th>Próxima providência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.actions
                      .filter((a) => a.titleKey === action.titleKey)
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((a) => (
                        <tr key={a.id}>
                          <td>{a.sequence}</td>
                          <td>{displayDate(a.contactDate)}</td>
                          <td>{a.status}</td>
                          <td>{a.responsible}</td>
                          <td>
                            {a.action} · {a.result}
                          </td>
                          <td>
                            {a.nextStep} ·{" "}
                            {a.nextDate ? displayDate(a.nextDate) : ""}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel process-panel">
            <h3>Processos de Cobrança e Ajuizamentos</h3>
            <p className="helper">
              Não há relação judicial pré-cadastrada. Valor da causa não
              equivale a saldo vencido. Um cliente pode ter múltiplos processos
              e um título pode ter múltiplos vínculos; saldos da carteira são
              contados uma única vez.
            </p>
            <form className="management-form" onSubmit={saveProcess}>
              {pField("Número do processo", "number")}
              {pField("Parte interessada", "interested")}
              {pField("Parte adversa", "opponent")}
              <label>
                Natureza do procedimento
                <select
                  aria-label="Natureza do procedimento"
                  required
                  value={process.kind}
                  onChange={(e) =>
                    setProcess((p) => ({ ...p, kind: e.target.value }))
                  }
                >
                  <option value="">Selecionar natureza</option>
                  <option value="judicial">Judicial</option>
                  <option value="administrative">Administrativo</option>
                </select>
              </label>
              {pField("Tipo de ação", "actionType")}
              {pField("Órgão judicial ou administrativo", "court")}
              {pField("Valor da causa (não é dívida)", "claimValue")}
              {pField("Status processual informado", "status")}
              {pField("Responsável pelo processo", "responsible")}
              {pField("Próxima providência do processo", "nextStep")}
              {pField("Fonte documental do vínculo", "source")}
              <div className="process-links">
                <label>
                  Pesquisar títulos para vincular
                  <input
                    aria-label="Pesquisar títulos para vincular"
                    value={titleSearch}
                    onChange={(e) => setTitleSearch(e.target.value)}
                  />
                </label>
                <p className="helper">
                  Selecione explicitamente cliente e duplicata/parcela após
                  conferir a documentação. {process.titleKeys.length} títulos
                  marcados. Mostrando até 50 resultados.
                </p>
                <div className="process-title-list">
                  {all
                    .filter((t) =>
                      JSON.stringify(
                        t.rows.map((r) => [
                          r.client,
                          r.document,
                          r.installment,
                          r.title,
                        ]),
                      )
                        .toLocaleLowerCase("pt-BR")
                        .includes(titleSearch.toLocaleLowerCase("pt-BR")),
                    )
                    .slice(0, 50)
                    .map((t) => (
                      <label key={t.key}>
                        <input
                          type="checkbox"
                          aria-label={`Vincular ${t.rows[0].title || t.rows[0].document}`}
                          checked={process.titleKeys.includes(t.key)}
                          onChange={() =>
                            setProcess((p) => ({
                              ...p,
                              titleKeys: p.titleKeys.includes(t.key)
                                ? p.titleKeys.filter((k) => k !== t.key)
                                : [...p.titleKeys, t.key],
                              linksConfirmed: false,
                            }))
                          }
                        />
                        {t.rows[0].client} ·{" "}
                        {t.rows[0].title || t.rows[0].document} · parcela{" "}
                        {t.rows[0].installment || "não informada"}
                      </label>
                    ))}
                </div>
                <label className="process-confirm">
                  <input
                    type="checkbox"
                    aria-label="Confirmar vínculos documentais"
                    checked={process.linksConfirmed}
                    onChange={(e) =>
                      setProcess((p) => ({
                        ...p,
                        linksConfirmed: e.target.checked,
                      }))
                    }
                  />
                  Conferi o tipo de procedimento, a fonte documental e os
                  vínculos financeiros selecionados.
                </label>
              </div>
              <button className="primary" type="submit">
                Salvar processo e vínculos
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setProcess(processBlank())}
              >
                Limpar formulário do processo
              </button>
            </form>
            <div className="table-scroll">
              <table aria-label="Processos registrados">
                <thead>
                  <tr>
                    {[
                      "Processo",
                      "Natureza",
                      "Partes",
                      "Valor da causa",
                      "Clientes / duplicatas",
                      "Saldo conciliado",
                      "Recebido vinculado",
                      "Status",
                      "Responsável",
                      "Última atualização",
                      "Próxima providência",
                      "Revisões",
                      "Ação",
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.processes.map((p) => (
                    <tr key={p.processId}>
                      <td>{p.number}</td>
                      <td>
                        {p.kind === "judicial" ? "Judicial" : "Administrativo"}
                      </td>
                      <td>
                        {p.interested} / {p.opponent}
                      </td>
                      <td>
                        {p.claimCents === null
                          ? "Não informado"
                          : money(p.claimCents)}
                      </td>
                      <td>
                        {p.linkedTitles
                          .map(
                            (t) =>
                              `${t.rows[0].client} / ${t.rows[0].title || t.rows[0].document}`,
                          )
                          .join("; ") || "Pendente de vinculação"}
                      </td>
                      <td>
                        {p.linksConfirmed ? money(p.balance) : "Não conciliado"}
                      </td>
                      <td>
                        {p.linksConfirmed
                          ? money(p.recovered)
                          : "Não conciliado"}
                      </td>
                      <td>{p.status || "Não informado"}</td>
                      <td>{p.responsible}</td>
                      <td>
                        {new Date(p.createdAt).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </td>
                      <td>{p.nextStep}</td>
                      <td>{p.sequence}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            setProcess({
                              processId: p.processId,
                              number: p.number,
                              interested: p.interested,
                              opponent: p.opponent,
                              kind: p.kind,
                              actionType: p.actionType,
                              court: p.court,
                              claimValue:
                                p.claimCents === null
                                  ? ""
                                  : money(p.claimCents),
                              status: p.status,
                              responsible: p.responsible,
                              nextStep: p.nextStep,
                              titleKeys: [...p.titleKeys],
                              linksConfirmed: p.linksConfirmed,
                              source: p.source,
                            })
                          }
                        >
                          Editar processo {p.number}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!processes.length && (
              <p className="helper">
                Processos não informados. Nenhum vínculo judicial foi presumido.
              </p>
            )}
            <p className="helper">
              Valores por processo podem compartilhar títulos: não some as
              linhas. A participação judicial usa a união dos títulos
              conciliados, não o valor das causas.
            </p>
          </section>
          <section className="panel">
            <h3>Histórico e importação controlada</h3>
            <p className="helper">
              JSON pode conter informações financeiras sensíveis: guarde em
              local autorizado. Reimportação exige mesma posição e mesma
              assinatura da base; conflitos são rejeitados sem apagar o
              histórico.
            </p>
            <div className="management-toolbar">
              <button className="secondary" onClick={backup}>
                Exportar histórico JSON
              </button>
              <label className="secondary">
                Reimportar histórico
                <input
                  aria-label="Reimportar histórico JSON"
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    readFile(e.target.files?.[0], "backup");
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="secondary"
                onClick={() =>
                  downloadBytes(
                    new TextEncoder().encode(processTemplate()),
                    "Modelo_Relacao_Processos.json",
                    "application/json",
                  )
                }
              >
                Baixar modelo de processos
              </button>
              <label className="secondary">
                Importar relação de processos
                <input
                  aria-label="Importar relação de processos"
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    readFile(e.target.files?.[0], "process");
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {(pending || processDrafts.length > 0) && (
              <div className="import-operations">
                <p>
                  Prévia:{" "}
                  {pending
                    ? `${pending.actions.length} ações e ${pending.processes.length} revisões de processos após mesclagem`
                    : `${processDrafts.length} processos sem vínculos financeiros`}
                  . A base financeira não será modificada.
                </p>
                <details>
                  <summary>Conferir registros da importação</summary>
                  <ul>
                    {pending
                      ? pending.actions.slice(-20).map((a) => (
                          <li key={a.id}>
                            {
                              all.find((t) => t.key === a.titleKey)?.rows[0]
                                .title
                            }{" "}
                            · {a.status} · {a.responsible} · {a.action}
                          </li>
                        ))
                      : processDrafts.slice(0, 20).map((p) => (
                          <li key={p.processId}>
                            {p.number} ·{" "}
                            {p.kind === "judicial"
                              ? "Judicial"
                              : "Administrativo"}{" "}
                            · {p.status || "Status não informado"} · valor da
                            causa{" "}
                            {p.claimCents === null
                              ? "não informado"
                              : money(p.claimCents)}{" "}
                            · sem vínculo financeiro
                          </li>
                        ))}
                  </ul>
                  {pending && (
                    <p>
                      {pending.processes.length} revisões de processos também
                      serão incorporadas com seus vínculos validados nesta base.
                    </p>
                  )}
                </details>
                <label>
                  <input
                    type="checkbox"
                    aria-label="Confirmar importação operacional"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />
                  Conferi a origem e autorizo incorporar estes registros nesta
                  sessão.
                </label>
                <button
                  className="primary"
                  disabled={!confirm}
                  onClick={() => {
                    try {
                      if (pending) onChange(pending);
                      else {
                        let next = store;
                        for (const p of processDrafts)
                          next = appendProcess(dataset!, next, p);
                        onChange(next);
                      }
                      setPending(null);
                      setProcessDrafts([]);
                      setNotice(
                        "Importação operacional aplicada sem apagar o histórico.",
                      );
                    } catch (e) {
                      setError(String(e instanceof Error ? e.message : e));
                    }
                  }}
                >
                  Aplicar importação operacional
                </button>
              </div>
            )}
          </section>
          <section className="panel management-query">
            <div className="panel-title">
              <div>
                <h3>Consulta da carteira vencida e relatórios</h3>
                <p>
                  {v.rows.length} registros · {v.titles.length} títulos · saldo{" "}
                  {money(v.summary.total)} · posição{" "}
                  {displayDate(dataset!.reference)}
                </p>
              </div>
              <div className="management-toolbar">
                <label>
                  Tipo de relatório
                  <select
                    aria-label="Tipo de relatório da gestão"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as ReportKind)}
                  >
                    {(Object.keys(reportNames) as ReportKind[]).map((k) => (
                      <option key={k} value={k}>
                        {reportNames[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary"
                  disabled={!!busy || !!v.summary.invalid || !v.rows.length}
                  onClick={() => exportReport("xlsx")}
                >
                  Exportar Excel da gestão
                </button>
                <button
                  className="secondary"
                  disabled={!!busy || !!v.summary.invalid || !v.rows.length}
                  onClick={() => exportReport("pdf")}
                >
                  Exportar PDF da gestão
                </button>
              </div>
            </div>
            <p className="helper">
              Os relatórios incluem todos os resultados filtrados, sem limite da
              página. A carteira permanece a da posição importada,
              independentemente da data do contato ou da recuperação.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Cliente",
                      "Representante",
                      "Duplicata",
                      "Parcela",
                      "Vencimento",
                      "Dias",
                      "Saldo",
                      "Etapa",
                      "Responsável",
                      "Próxima providência",
                      "Vínculo judicial",
                      "Original",
                      "Tratamento",
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.rows
                    .slice(effectivePage * 20, (effectivePage + 1) * 20)
                    .map((r) => (
                      <tr key={r.record.id}>
                        <td>{r.client}</td>
                        <td>{r.representative}</td>
                        <td>{r.document || r.title}</td>
                        <td>{r.installment}</td>
                        <td>{displayDate(r.due)}</td>
                        <td>{r.days ?? "Indeterminado"}</td>
                        <td>
                          {r.openCents === null
                            ? "Inválido"
                            : money(r.openCents)}
                        </td>
                        <td>
                          {r.treatment?.status ?? "Pendente de classificação"}
                        </td>
                        <td>{r.treatment?.responsible ?? "Não informado"}</td>
                        <td>{r.treatment?.nextStep ?? "Não informada"}</td>
                        <td>
                          {r.judicial ? "Confirmado" : "Sem vínculo confirmado"}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => onTrace(r.record)}
                          >
                            Ver {r.title || r.document}
                          </button>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => {
                              setAction((a) => ({ ...a, titleKey: r.key }));
                              formRef.current?.scrollIntoView();
                            }}
                          >
                            Tratar {r.title || r.document}
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
                aria-label="Página anterior da gestão"
                disabled={!effectivePage}
                onClick={() => setPage(effectivePage - 1)}
              >
                Anterior
              </button>
              <span>
                Página {effectivePage + 1} de{" "}
                {Math.max(1, Math.ceil(v.rows.length / 20))}
              </span>
              <button
                className="secondary"
                aria-label="Próxima página da gestão"
                disabled={(effectivePage + 1) * 20 >= v.rows.length}
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
