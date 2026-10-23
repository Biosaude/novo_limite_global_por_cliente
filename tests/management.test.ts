import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { managementFixture } from "./management-fixture";
import { readWorkbook } from "../src/importacao/workbook";
import { suggestMappings } from "../src/importacao/mapping";
import { normalize } from "../src/importacao/normalize";
import {
  emptyOperations,
  managementTitles,
  managementView,
  initialManagementFilters,
  appendTreatment,
  appendProcess,
  exportOperations,
  importOperations,
  parseProcessList,
  validateOperations,
  type Operations,
  type LegalProcess,
} from "../src/inadimplencia/model";
import { managementExcel, managementPdf } from "../src/inadimplencia/reports";
async function base() {
  const source = await readWorkbook(
    Uint8Array.from(await managementFixture()).buffer,
  );
  return normalize(
    source,
    suggestMappings(source),
    "2026-10-23",
    "TESTE_GESTAO.xlsx",
  );
}
const action = (key: string, status = "Cobrança administrativa") => ({
  titleKey: key,
  status: status as "Cobrança administrativa",
  responsible: "Responsável de Teste",
  contactDate: "2026-10-23",
  action: "Contato de teste",
  result: "Retorno registrado",
  nextStep: "Aguardar resposta",
  nextDate: "2026-10-26",
  notes: "Sem dados de pacientes",
  agreementReference: "",
  agreementCents: null,
});
const caseInput = (
  keys: string[],
  kind: "judicial" | "administrative" = "judicial",
  number = "PROCESSO-TESTE-1",
) => ({
  processId: crypto.randomUUID(),
  number,
  interested: "Parte sintética",
  opponent: "Adversa sintética",
  kind,
  actionType: "Cobrança informada",
  court: "Órgão sintético",
  claimCents: 9999900,
  status: "Status informado de teste",
  responsible: "Responsável declarado",
  nextStep: "Providência informada",
  titleKeys: keys,
  linksConfirmed: keys.length > 0,
  source: "Documento sintético conferido",
});
test("gestão: posição e recebimentos preservados; pendentes não viram classificação automática", async () => {
  const d = await base(),
    before = JSON.stringify(d),
    v = managementView(d, emptyOperations(), initialManagementFilters(d));
  assert.equal(v.summary.total, 65000);
  assert.equal(v.titles.length, 3);
  assert.equal(v.rows.length, 4);
  assert.equal(v.summary.recovered, 70000);
  assert.equal(v.summary.administrative, null);
  assert.equal(v.summary.negotiation, null);
  assert.equal(v.summary.judicial, null);
  assert.equal(v.summary.recoveryRate, null);
  assert.equal(v.summary.pending, 3);
  assert.equal(JSON.stringify(d), before);
  const incomplete = structuredClone(d);
  for (const record of incomplete.records)
    if (record.category === "received") record.due = null;
  assert.equal(
    managementView(
      incomplete,
      emptyOperations(),
      initialManagementFilters(incomplete),
    ).summary.recovered,
    null,
  );
});
test("gestão: histórico acrescenta revisões, etapas exclusivas e filtro operacional de caixa", async () => {
  const d = await base(),
    key = managementTitles(d).find((t) => t.rows[0].document === "P3")!.key;
  let s = appendTreatment(d, emptyOperations(), action(key));
  s = appendTreatment(d, s, action(key, "Em negociação"));
  assert.equal(s.actions.length, 2);
  const v = managementView(d, s, {
    ...initialManagementFilters(d),
    status: "Em negociação",
  });
  assert.equal(v.summary.total, 25000);
  assert.equal(v.summary.administrative, 0);
  assert.equal(v.summary.negotiation, 25000);
  assert.equal(v.summary.recovered, 30000);
  assert.equal(
    v.stages.reduce((s, r) => s + r.value, 0),
    25000,
  );
  assert.equal(
    managementView(d, s, { ...initialManagementFilters(d), month: "07" })
      .summary.total,
    65000,
  );
  assert.equal(
    managementView(d, s, { ...initialManagementFilters(d), month: "07" })
      .summary.recovered,
    40000,
  );
});
test("gestão: processos múltiplos, vínculos compartilhados e valor da causa sem dupla contagem", async () => {
  const d = await base(),
    titles = managementTitles(d),
    keys = titles
      .filter((t) => ["P3", "P4"].includes(t.rows[0].document))
      .map((t) => t.key);
  let s = appendProcess(d, emptyOperations(), caseInput(keys));
  s = appendProcess(d, s, caseInput([keys[0]], "judicial", "PROCESSO-TESTE-2"));
  s = appendProcess(
    d,
    s,
    caseInput([titles[0].key], "administrative", "PROCEDIMENTO-TESTE"),
  );
  const v = managementView(d, s, initialManagementFilters(d));
  assert.equal(v.summary.judicial, 55000);
  assert.equal(v.summary.total, 65000);
  assert.equal(v.processes[0].balance, 55000);
  assert.equal(v.processes[1].balance, 25000);
  assert.equal(v.processes[2].balance, 10000);
  assert.equal(v.processes[0].claimCents, 9999900);
  assert.equal(v.processes[0].recovered, 70000);
});
test("gestão: judicialização exige documentação e não decorre de aging; revisões de processos preservadas", async () => {
  const d = await base(),
    key = managementTitles(d)[0].key;
  assert.throws(
    () => appendTreatment(d, emptyOperations(), action(key, "Judicializado")),
    /exige processo/,
  );
  assert.throws(
    () =>
      appendProcess(d, emptyOperations(), {
        ...caseInput([key]),
        linksConfirmed: false,
      }),
    /não confirmado/,
  );
  assert.throws(
    () =>
      appendProcess(d, emptyOperations(), { ...caseInput([key]), source: "" }),
    /não confirmado/,
  );
  let s = appendProcess(d, emptyOperations(), caseInput([key]));
  const existing = s.processes[0];
  s = appendProcess(d, s, { ...existing, status: "Nova situação declarada" });
  assert.equal(s.processes.length, 2);
  assert.equal(s.processes[1].sequence, 2);
  assert.equal(s.processes[0].status, "Status informado de teste");
  assert.throws(() => appendProcess(d, s, caseInput([key])), /já cadastrado/);
});
test("gestão: backup controlado restaura e mescla sem duplicar; conflitos e outra base são rejeitados", async () => {
  const d = await base(),
    key = managementTitles(d)[0].key,
    s = appendTreatment(d, emptyOperations(), action(key)),
    text = await exportOperations(d, s);
  assert.deepEqual(
    await importOperations(
      { ...d, id: "nova-importacao" },
      emptyOperations(),
      text,
    ),
    s,
  );
  assert.deepEqual(await importOperations(d, s, text), s);
  await assert.rejects(
    importOperations(
      { ...d, reference: "2026-10-24" },
      emptyOperations(),
      text,
    ),
    /outra base/,
  );
  const modified = structuredClone(d);
  modified.records[0].cents = 999;
  await assert.rejects(
    importOperations(modified, emptyOperations(), text),
    /outra base/,
  );
  const bad = JSON.parse(text);
  bad.operations.actions[0].result = "Conteúdo divergente";
  await assert.rejects(
    importOperations(d, s, JSON.stringify(bad)),
    /Conflito de histórico/,
  );
  assert.equal(s.actions.length, 1);
  assert.throws(
    () => validateOperations(d, { ...s, extra: "proibido" }),
    /não permitido/,
  );
});
test("gestão: importação processual não presume vínculos e rejeita dados e natureza inválidos", () => {
  const record = caseInput([]);
  const { processId, titleKeys, linksConfirmed, source, ...input } = record;
  const text = JSON.stringify({
    format: "biosaude-process-list",
    version: 1,
    processes: [input],
  });
  const result = parseProcessList(text);
  assert.equal(result[0].titleKeys.length, 0);
  assert.equal(result[0].linksConfirmed, false);
  assert.equal(result[0].status, input.status);
  assert.throws(
    () => parseProcessList(text.replace("judicial", "desconhecido")),
    /inválido/,
  );
  assert.throws(
    () =>
      parseProcessList(
        JSON.stringify({
          format: "biosaude-process-list",
          version: 1,
          processes: [{ ...input, paciente: "Não permitido" }],
        }),
      ),
    /não permitido/,
  );
});
test("gestão: filtros de cliente, representante, aging e responsável respeitam saldos", async () => {
  const d = await base(),
    key = managementTitles(d).find((t) => t.rows[0].document === "P3")!.key,
    s = appendTreatment(d, emptyOperations(), action(key));
  const v = managementView(d, s, {
    ...initialManagementFilters(d),
    client: "Cliente Sintético A",
    representative: "Rep X",
    bands: [5],
    responsible: "Responsável de Teste",
  });
  assert.equal(v.summary.total, 25000);
  assert.equal(v.rows.length, 2);
  assert.equal(v.summary.recovered, 30000);
  assert.equal(
    managementView(d, s, { ...initialManagementFilters(d), legal: "yes" })
      .summary.total,
    0,
  );
});
test("gestão: três relatórios Excel/PDF preservam valores, histórico e rastreabilidade", async () => {
  const d = await base(),
    key = managementTitles(d).find((t) => t.rows[0].document === "P3")!.key;
  let s = appendTreatment(d, emptyOperations(), action(key));
  s = appendProcess(d, s, caseInput([key]));
  const v = managementView(d, s, initialManagementFilters(d)),
    font = (await readFile("src/relatorios/assets/DejaVuSans.ttf")).toString(
      "base64",
    );
  for (const kind of ["pending", "treatment", "process"] as const) {
    const w = new ExcelJS.Workbook();
    await w.xlsx.load(
      Uint8Array.from(await managementExcel(v, s, kind)).buffer,
    );
    const rows = w.getWorksheet("Pendências e Tratamentos")!;
    let sum = 0;
    rows.eachRow((r, i) => {
      if (i > 1) sum += Math.round(Number(r.getCell(6).value) * 100);
    });
    assert.equal(sum, kind === "process" ? 25000 : 65000);
    assert.ok(!JSON.stringify(w.model).includes("PACIENTE-NAO-EXPORTAR"));
    const pdf = await managementPdf(v, s, kind, font),
      text = execFileSync("pdftotext", ["-", "-"], { input: pdf }).toString();
    assert.match(text, /Gestão da Inadimplência/);
    assert.ok(text.includes(kind === "process" ? "250,00" : "650,00"));
    assert.ok(!text.includes("PACIENTE-NAO-EXPORTAR"));
  }
});
for (const [env, ref, expected] of [
  ["BIOSAUDE_TEST_WORKBOOK", "2026-10-19", 1057501521],
  ["BIOSAUDE_UPDATED_WORKBOOK", "2026-10-23", 1110573972],
] as const)
  test(
    "gestão real: carteira vencida " + ref,
    { skip: !process.env[env] },
    async () => {
      const source = await readWorkbook(
          Uint8Array.from(await readFile(process.env[env]!)).buffer,
        ),
        d = normalize(source, suggestMappings(source), ref, "oficial.xlsx"),
        v = managementView(d, emptyOperations(), initialManagementFilters(d));
      assert.equal(v.summary.total, expected);
      assert.equal(v.summary.classified, 0);
      assert.equal(v.summary.judicial, null);
      assert.equal(v.summary.recoveryRate, null);
    },
  );
