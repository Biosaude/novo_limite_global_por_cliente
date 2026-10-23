import type { Dataset, FinancialRecord } from "../domain/types";
import { collectionRows, type CollectionRow } from "../cobranca/query";
import { enrichCreditRecords } from "../credito/analysis";
import { receiptRows } from "../recebimentos/analysis";
import { sum } from "../domain/money";
import { agingBandIndex, agingBandNames } from "../domain/agingBands";
import { validDate } from "../domain/dates";
export const stages = [
  "Não iniciado",
  "Cobrança administrativa",
  "Aguardando retorno",
  "Em negociação",
  "Acordo formalizado",
  "Acordo descumprido",
  "Encaminhado ao jurídico",
  "Judicializado",
  "Recuperado",
  "Encerrado por outro motivo",
] as const;
export type Stage = (typeof stages)[number];
export const keyName = (s: string) =>
  s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
export const financialKey = (r: FinancialRecord) =>
  JSON.stringify([
    keyName(r.client),
    r.document && r.installment
      ? [r.document.trim(), r.installment.trim()]
      : r.title
        ? ["titulo", keyName(r.title)]
        : ["linha", r.id],
  ]);
export interface Treatment {
  id: string;
  sequence: number;
  titleKey: string;
  createdAt: string;
  status: Stage;
  responsible: string;
  contactDate: string;
  action: string;
  result: string;
  nextStep: string;
  nextDate: string;
  notes: string;
  agreementReference: string;
  agreementCents: number | null;
}
export interface LegalProcess {
  id: string;
  processId: string;
  sequence: number;
  createdAt: string;
  number: string;
  interested: string;
  opponent: string;
  kind: "judicial" | "administrative";
  actionType: string;
  court: string;
  claimCents: number | null;
  status: string;
  responsible: string;
  nextStep: string;
  titleKeys: string[];
  linksConfirmed: boolean;
  source: string;
}
export interface Operations {
  version: 1;
  actions: Treatment[];
  processes: LegalProcess[];
}
export const emptyOperations = (): Operations => ({
  version: 1,
  actions: [],
  processes: [],
});
export function latestActions(store: Operations) {
  const map = new Map<string, Treatment>();
  for (const a of store.actions)
    if ((map.get(a.titleKey)?.sequence ?? 0) < a.sequence)
      map.set(a.titleKey, a);
  return map;
}
export function latestProcesses(store: Operations) {
  const map = new Map<string, LegalProcess>();
  for (const p of store.processes)
    if ((map.get(p.processId)?.sequence ?? 0) < p.sequence)
      map.set(p.processId, p);
  return [...map.values()];
}
export function judicialLinks(store: Operations) {
  return latestProcesses(store).filter(
    (p) =>
      p.kind === "judicial" &&
      p.linksConfirmed &&
      p.number.trim() &&
      p.court.trim() &&
      p.titleKeys.length,
  );
}
export function managementTitles(dataset: Dataset) {
  const map = new Map<string, { key: string; rows: CollectionRow[] }>();
  for (const r of collectionRows(
    dataset,
    dataset.records.filter((r) => r.category === "overdue"),
  )) {
    const k = financialKey({
        ...r.record,
        document: r.document,
        installment: r.installment,
      }),
      g = map.get(k) ?? { key: k, rows: [] };
    g.rows.push(r);
    map.set(k, g);
  }
  return [...map.values()];
}
const text = (v: unknown, max = 3000) =>
  typeof v === "string" && v.length <= max;
const stamp = (v: unknown) =>
  text(v, 40) && !Number.isNaN(Date.parse(v as string));
const amount = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
function exactFields(
  value: unknown,
  fields: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !fields.includes(k))
  )
    throw new Error("Estrutura operacional inválida ou campo não permitido.");
}
/** Validação independente da interface; nenhuma alteração do dataset é permitida. */
export function validateOperations(
  dataset: Dataset,
  value: unknown,
): Operations {
  exactFields(value, ["version", "actions", "processes"]);
  if (
    value.version !== 1 ||
    !Array.isArray(value.actions) ||
    !Array.isArray(value.processes) ||
    value.actions.length > 10000 ||
    value.processes.length > 5000
  )
    throw new Error("Versão ou quantidade operacional inválida.");
  const keys = new Set(managementTitles(dataset).map((t) => t.key));
  const ids = new Set<string>();
  const sequences = new Map<string, Set<number>>();
  const history = (id: unknown, key: string, seq: unknown) => {
    if (
      !text(id, 100) ||
      !id ||
      ids.has(id as string) ||
      !Number.isSafeInteger(seq) ||
      Number(seq) < 1
    )
      throw new Error("Identificador ou sequência de histórico inválida.");
    ids.add(id as string);
    const set = sequences.get(key) ?? new Set<number>();
    if (set.has(Number(seq)))
      throw new Error(
        "Histórico conflitante: duas atualizações na mesma sequência.",
      );
    set.add(Number(seq));
    sequences.set(key, set);
  };
  for (const item of value.actions) {
    exactFields(item, [
      "id",
      "sequence",
      "titleKey",
      "createdAt",
      "status",
      "responsible",
      "contactDate",
      "action",
      "result",
      "nextStep",
      "nextDate",
      "notes",
      "agreementReference",
      "agreementCents",
    ]);
    if (
      !text(item.titleKey, 1000) ||
      !keys.has(item.titleKey as string) ||
      !stamp(item.createdAt) ||
      !stages.includes(item.status as Stage) ||
      !text(item.responsible, 200) ||
      !String(item.responsible).trim() ||
      !text(item.action, 500) ||
      !String(item.action).trim() ||
      !text(item.result) ||
      !text(item.nextStep) ||
      !text(item.notes) ||
      !text(item.agreementReference, 300) ||
      !validDate(String(item.contactDate)) ||
      !(item.nextDate === "" || validDate(String(item.nextDate))) ||
      !amount(item.agreementCents)
    )
      throw new Error(
        "Tratamento inválido: confira título, responsável, datas e ação.",
      );
    history(item.id, "t:" + item.titleKey, item.sequence);
  }
  for (const item of value.processes) {
    exactFields(item, [
      "id",
      "processId",
      "sequence",
      "createdAt",
      "number",
      "interested",
      "opponent",
      "kind",
      "actionType",
      "court",
      "claimCents",
      "status",
      "responsible",
      "nextStep",
      "titleKeys",
      "linksConfirmed",
      "source",
    ]);
    if (
      !text(item.processId, 100) ||
      !item.processId ||
      !stamp(item.createdAt) ||
      !text(item.number, 150) ||
      !String(item.number).trim() ||
      !["judicial", "administrative"].includes(String(item.kind)) ||
      !text(item.interested, 300) ||
      !text(item.opponent, 300) ||
      !text(item.actionType, 300) ||
      !text(item.court, 300) ||
      !text(item.status, 300) ||
      !text(item.responsible, 200) ||
      !text(item.nextStep) ||
      !text(item.source, 500) ||
      !amount(item.claimCents) ||
      !Array.isArray(item.titleKeys) ||
      item.titleKeys.length > 10000 ||
      !item.titleKeys.every((k) => typeof k === "string" && keys.has(k)) ||
      new Set(item.titleKeys).size !== item.titleKeys.length ||
      typeof item.linksConfirmed !== "boolean" ||
      (item.titleKeys.length > 0 && !item.linksConfirmed) ||
      (item.linksConfirmed &&
        (!item.titleKeys.length ||
          !String(item.court).trim() ||
          !String(item.source).trim()))
    )
      throw new Error(
        "Processo inválido ou vínculo financeiro não confirmado.",
      );
    history(item.id, "p:" + item.processId, item.sequence);
  }
  for (const set of sequences.values())
    if (Math.max(...set) !== set.size)
      throw new Error("Histórico incompleto: faltam atualizações anteriores.");
  const processNumbers = new Set<string>();
  for (const p of latestProcesses(value as unknown as Operations)) {
    const k = JSON.stringify([p.kind, keyName(p.number), keyName(p.court)]);
    if (processNumbers.has(k))
      throw new Error("Processo já cadastrado: edite a revisão existente.");
    processNumbers.add(k);
  }
  const result = structuredClone(value) as unknown as Operations;
  const linked = new Set(judicialLinks(result).flatMap((p) => p.titleKeys));
  for (const a of latestActions(result).values())
    if (a.status === "Judicializado" && !linked.has(a.titleKey))
      throw new Error(
        "Judicializado exige processo judicial e vínculo confirmado com a duplicata.",
      );
  return result;
}
export function appendTreatment(
  dataset: Dataset,
  store: Operations,
  input: Omit<Treatment, "id" | "sequence" | "createdAt">,
): Operations {
  const prior = latestActions(store).get(input.titleKey);
  return validateOperations(dataset, {
    ...store,
    actions: [
      ...store.actions,
      {
        ...input,
        id: crypto.randomUUID(),
        sequence: (prior?.sequence ?? 0) + 1,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}
export function appendProcess(
  dataset: Dataset,
  store: Operations,
  input: Omit<LegalProcess, "id" | "sequence" | "createdAt">,
): Operations {
  const prior = latestProcesses(store).find(
    (p) => p.processId === input.processId,
  );
  return validateOperations(dataset, {
    ...store,
    processes: [
      ...store.processes,
      {
        ...input,
        id: crypto.randomUUID(),
        sequence: (prior?.sequence ?? 0) + 1,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}
export interface ManagementFilters {
  year: string;
  month: string;
  client: string;
  representative: string;
  bands: number[];
  status: string;
  responsible: string;
  legal: string;
  search: string;
}
export const initialManagementFilters = (
  d: Dataset | null,
): ManagementFilters => ({
  year: d?.reference.slice(0, 4) ?? "",
  month: "",
  client: "",
  representative: "",
  bands: [],
  status: "",
  responsible: "",
  legal: "",
  search: "",
});
export function managementView(
  dataset: Dataset,
  store: Operations,
  filters: ManagementFilters,
) {
  const actions = latestActions(store),
    processes = latestProcesses(store),
    judicial = judicialLinks(store),
    judicialKeys = new Set(judicial.flatMap((p) => p.titleKeys));
  const titles = managementTitles(dataset)
    .map((t) => ({
      ...t,
      rows: t.rows.filter(
        (r) =>
          (!filters.client || keyName(r.client) === keyName(filters.client)) &&
          (!filters.representative ||
            keyName(r.representative) === keyName(filters.representative)) &&
          (!filters.bands.length ||
            filters.bands.includes(
              agingBandIndex(r.record, dataset.reference),
            )),
      ),
    }))
    .filter((t) => t.rows.length)
    .map((t) => ({
      ...t,
      balance: sum(t.rows.map((r) => r.openCents ?? 0)),
      action: actions.get(t.key),
      judicial: judicialKeys.has(t.key),
      processes: processes.filter(
        (p) => p.linksConfirmed && p.titleKeys.includes(t.key),
      ),
    }))
    .filter(
      (t) =>
        (!filters.status ||
          (filters.status === "pending"
            ? !t.action
            : t.action?.status === filters.status)) &&
        (!filters.responsible ||
          keyName(t.action?.responsible ?? "") ===
            keyName(filters.responsible)) &&
        (!filters.legal ||
          (filters.legal === "yes" ? t.judicial : !t.judicial)) &&
        (!filters.search ||
          keyName(
            t.rows
              .map((r) =>
                [r.client, r.document, r.installment, r.title].join(" "),
              )
              .join(" "),
          ).includes(keyName(filters.search))),
    );
  const selectedKeys = new Set(titles.map((t) => t.key));
  const operational = !!(
    filters.bands.length ||
    filters.status ||
    filters.responsible ||
    filters.legal ||
    filters.search
  );
  const receiptUniverse = receiptRows(dataset).filter(
    (r) =>
      (!filters.client || keyName(r.client) === keyName(filters.client)) &&
      (!filters.representative ||
        keyName(r.representative) === keyName(filters.representative)),
  );
  const recoveryUnknown = receiptUniverse.filter(
    (r) => !r.received || !r.due || r.cents === null,
  ).length;
  const recoveryKnown = receiptUniverse.filter(
    (r) =>
      r.received &&
      r.due &&
      r.cents !== null &&
      r.received <= dataset.reference,
  ).length;
  const receipts = receiptUniverse.filter(
    (r) =>
      r.condition === "late" &&
      r.received &&
      r.received <= dataset.reference &&
      (!filters.year || r.received.startsWith(filters.year + "-")) &&
      (!filters.month || r.received.slice(5, 7) === filters.month) &&
      (!filters.client || keyName(r.client) === keyName(filters.client)) &&
      (!filters.representative ||
        keyName(r.representative) === keyName(filters.representative)) &&
      (!operational || selectedKeys.has(financialKey(r.record))),
  );
  const rows = titles.flatMap((t) =>
    t.rows.map((r) => ({
      ...r,
      key: t.key,
      treatment: t.action,
      judicial: t.judicial,
      processes: t.processes,
    })),
  );
  const classified = titles.filter((t) => t.action),
    total = sum(titles.map((t) => t.balance));
  const byStage = [
    {
      name: "Pendente de classificação",
      value: sum(titles.filter((t) => !t.action).map((t) => t.balance)),
      count: titles.filter((t) => !t.action).length,
    },
    ...stages.map((s) => ({
      name: s,
      value: sum(
        titles.filter((t) => t.action?.status === s).map((t) => t.balance),
      ),
      count: titles.filter((t) => t.action?.status === s).length,
    })),
  ];
  const responsible = [
    ...new Set(classified.map((t) => t.action!.responsible)),
  ].map((name) => ({
    name,
    count: classified.filter((t) => t.action!.responsible === name).length,
    value: sum(
      classified
        .filter((t) => t.action!.responsible === name)
        .map((t) => t.balance),
    ),
  }));
  const monthly = [...new Set(receipts.map((r) => r.received!.slice(0, 7)))]
    .sort()
    .map((name) => ({
      name,
      value: sum(
        receipts
          .filter((r) => r.received!.startsWith(name))
          .map((r) => r.cents ?? 0),
      ),
    }));
  const processRows = processes
    .map((p) => {
      const linked = titles.filter(
        (t) => p.linksConfirmed && p.titleKeys.includes(t.key),
      );
      const cash = receipts.filter(
        (r) => p.linksConfirmed && p.titleKeys.includes(financialKey(r.record)),
      );
      return {
        ...p,
        linkedTitles: linked,
        balance: sum(linked.map((t) => t.balance)),
        recovered: sum(cash.map((r) => r.cents ?? 0)),
      };
    })
    .filter(
      (p) =>
        (!operational && !filters.client && !filters.representative) ||
        p.linkedTitles.length,
    );
  return {
    dataset,
    filters: { ...filters, bands: [...filters.bands] },
    titles,
    rows,
    receipts,
    processes: processRows,
    stages: byStage,
    responsible,
    monthly,
    bands: agingBandNames.map((name, i) => ({
      name,
      value: sum(
        rows
          .filter((r) => agingBandIndex(r.record, dataset.reference) === i)
          .map((r) => r.openCents ?? 0),
      ),
    })),
    summary: {
      total,
      administrative: classified.length
        ? byStage.find((s) => s.name === "Cobrança administrativa")!.value
        : null,
      negotiation: classified.length
        ? byStage.find((s) => s.name === "Em negociação")!.value
        : null,
      judicial: judicial.length
        ? sum(titles.filter((t) => t.judicial).map((t) => t.balance))
        : null,
      recovered:
        !recoveryKnown && recoveryUnknown > 0
          ? null
          : sum(receipts.map((r) => r.cents ?? 0)),
      recoveryUnknown,
      recoveryRate: null,
      classified: classified.length,
      pending: titles.length - classified.length,
      invalid:
        rows.filter((r) => r.openCents === null).length +
        receipts.filter((r) => r.cents === null).length,
      operationalCash: operational,
    },
  };
}
export type ManagementView = ReturnType<typeof managementView>;
export async function financialFingerprint(dataset: Dataset): Promise<string> {
  const text = JSON.stringify([
    dataset.reference,
    enrichCreditRecords(dataset)
      .map((r) => [
        r.id,
        r.category,
        r.client,
        r.title,
        r.document,
        r.installment,
        r.cents,
        r.due,
        r.received,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ]);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function exportOperations(dataset: Dataset, store: Operations) {
  return JSON.stringify(
    {
      format: "biosaude-operations",
      version: 1,
      reference: dataset.reference,
      fingerprint: await financialFingerprint(dataset),
      operations: validateOperations(dataset, store),
    },
    null,
    2,
  );
}
export async function importOperations(
  dataset: Dataset,
  current: Operations,
  textValue: string,
) {
  if (textValue.length > 4_000_000)
    throw new Error("Arquivo operacional acima de 4 MB.");
  const value = JSON.parse(textValue);
  exactFields(value, [
    "format",
    "version",
    "reference",
    "fingerprint",
    "operations",
  ]);
  if (
    value.format !== "biosaude-operations" ||
    value.version !== 1 ||
    value.reference !== dataset.reference ||
    value.fingerprint !== (await financialFingerprint(dataset))
  )
    throw new Error("Backup pertence a outra base ou posição financeira.");
  const incoming = validateOperations(dataset, value.operations);
  const merge = <T extends { id: string }>(a: T[], b: T[]) => {
    const map = new Map(a.map((v) => [v.id, v]));
    for (const item of b) {
      if (
        map.has(item.id) &&
        JSON.stringify(map.get(item.id)) !== JSON.stringify(item)
      )
        throw new Error(
          "Conflito de histórico: identificador com conteúdo diferente.",
        );
      map.set(item.id, item);
    }
    return [...map.values()];
  };
  return validateOperations(dataset, {
    version: 1,
    actions: merge(current.actions, incoming.actions),
    processes: merge(current.processes, incoming.processes),
  });
}
export function processTemplate() {
  return JSON.stringify(
    { format: "biosaude-process-list", version: 1, processes: [] },
    null,
    2,
  );
}
export function parseProcessList(
  textValue: string,
): Omit<LegalProcess, "id" | "sequence" | "createdAt">[] {
  if (textValue.length > 2_000_000) throw new Error("Relação acima de 2 MB.");
  const v = JSON.parse(textValue);
  exactFields(v, ["format", "version", "processes"]);
  if (
    v.format !== "biosaude-process-list" ||
    v.version !== 1 ||
    !Array.isArray(v.processes) ||
    v.processes.length > 1000
  )
    throw new Error("Relação de processos inválida.");
  return v.processes.map((r: unknown) => {
    exactFields(r, [
      "number",
      "interested",
      "opponent",
      "kind",
      "actionType",
      "court",
      "claimCents",
      "status",
      "responsible",
      "nextStep",
    ]);
    if (
      !text(r.number, 150) ||
      !String(r.number).trim() ||
      !["judicial", "administrative"].includes(String(r.kind)) ||
      !amount(r.claimCents)
    )
      throw new Error("Número, tipo ou valor do processo inválido.");
    for (const k of [
      "interested",
      "opponent",
      "actionType",
      "court",
      "status",
      "responsible",
      "nextStep",
    ])
      if (!text(r[k]))
        throw new Error("Campos da relação devem ser textos explícitos.");
    return {
      number: String(r.number),
      interested: String(r.interested),
      opponent: String(r.opponent),
      kind: r.kind as LegalProcess["kind"],
      actionType: String(r.actionType),
      court: String(r.court),
      claimCents: r.claimCents as number | null,
      status: String(r.status),
      responsible: String(r.responsible),
      nextStep: String(r.nextStep),
      processId: crypto.randomUUID(),
      titleKeys: [],
      linksConfirmed: false,
      source: "Relação importada; sem conciliação automática",
    };
  });
}
