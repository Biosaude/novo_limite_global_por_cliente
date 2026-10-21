import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { creditFixture } from "./credit-fixture";
import { readWorkbook } from "../src/importacao/workbook";
import { normalize } from "../src/importacao/normalize";
import { suggestMappings } from "../src/importacao/mapping";
import { initialFilters } from "../src/domain/finance";
import {
  analyzeCredit,
  clientKey,
  observedMonths,
} from "../src/credito/analysis";
import { proposedConfig, validateConfig } from "../src/credito/policy";
import type { CreditGovernance } from "../src/credito/types";
const dataset = async () => {
  const source = await readWorkbook(
    Uint8Array.from(await creditFixture()).buffer,
  );
  return normalize(
    source,
    suggestMappings(source),
    "2026-03-31",
    "ARQUIVO_DE_TESTE.xlsx",
  );
};
const near = (a: number | null, b: number | null) => {
  if (a === null || b === null) assert.equal(a, b);
  else assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
};
test("correspondência exata normaliza somente espaços e capitalização", () => {
  assert.equal(clientKey("  Cliente    A "), clientKey("CLIENTE A"));
  assert.notEqual(clientKey("Cliente A"), clientKey("Cliente A Ltda"));
  assert.notEqual(clientKey("Clínica A"), clientKey("Clinica A"));
});
test("exposição, pontualidade e títulos parciais são métricas distintas", async () => {
  const data = await dataset(),
    clients = analyzeCredit(data, initialFilters(data));
  assert.equal(clients.length, 2);
  const a = clients.find(
    (client) => client.key === clientKey("cliente teste a"),
  )!;
  assert.equal(a.exposure, 15000);
  assert.equal(a.upcoming, 10000);
  assert.equal(a.overdue, 5000);
  assert.equal(a.received, 10000);
  near(a.delinquency, 1 / 3);
  assert.equal(a.payments.records, 4);
  assert.equal(a.payments.titleCount, 3);
  assert.equal(a.payments.repeatedTitleCount, 1);
  assert.equal(a.payments.titleAnyLateCount, 1);
  assert.equal(a.payments.datedTitleCount, 3);
  assert.equal(a.payments.onTimeCount, 2);
  assert.equal(a.payments.lateCount, 2);
  near(a.payments.onTimeRatio, 0.5);
  near(a.payments.meanLateDays, 20.5);
  near(a.payments.weightedLateDays, 23.6);
  near(a.payments.weightedPaymentDays, 41.8);
  assert.equal(a.payments.meanPerEntry, 2500);
  assert.equal(a.payments.meanPerTitle, 3333);
  assert.equal(a.creditTermDays, 30);
  assert.equal(a.baseLimit, 3483);
  assert.equal(a.risk, "Alto");
  assert.equal(a.recommendation, null);
  assert.equal(a.availableOperational, null);
  assert.equal(a.bands[0].cents, 5000);
  assert.equal(a.variants.length, 3);
  const b = clients.find((client) => client.name === "Cliente Teste B")!;
  assert.equal(b.delinquency, null);
  assert.equal(b.risk, "Dados insuficientes");
  assert.equal(b.baseLimit, null);
});
test("janela usa frações reais de meses, inclusive meses sem atividade", () => {
  near(observedMonths("2026-01-05", "2026-03-31").toNumber(), 27 / 31 + 2);
  near(observedMonths("2024-02-01", "2024-02-29").toNumber(), 1);
});
test("recomendação exige política aprovada externa; aprovação de limite é separada", async () => {
  const data = await dataset(),
    filters = initialFilters(data);
  const config = structuredClone(proposedConfig);
  config.reviewOverdue = false;
  const governance: CreditGovernance = {
    source: "authenticated-backend",
    policy: {
      id: "test-approved",
      version: 1,
      config,
      approvedBy: "TESTE CONTRATO FUTURO",
      approvedAt: "2026-03-31T12:00:00Z",
      justification: "Teste de contrato; não é aprovação real",
    },
    limits: [
      {
        id: "test-limit",
        clientKey: clientKey("cliente teste a"),
        cents: 10000,
        approvedBy: "TESTE CONTRATO FUTURO",
        approvedAt: "2026-03-31T12:00:00Z",
        justification: "Teste de disponibilidade negativa",
      },
    ],
  };
  const pending = analyzeCredit(data, filters, config)[0];
  assert.equal(pending.recommendation, null);
  const approved = analyzeCredit(data, filters, config, governance)[0];
  assert.equal(approved.recommendation, 1742);
  assert.equal(approved.estimatedHeadroom, -13258);
  assert.equal(approved.availableRaw, -5000);
  assert.equal(approved.availableOperational, 0);
  assert.equal(approved.exceeded, 5000);
  const review = structuredClone(governance);
  review.policy!.config = { ...config, reviewOverdue: true };
  assert.equal(
    analyzeCredit(data, filters, review.policy!.config, review)[0]
      .recommendationStatus,
    "Revisão manual obrigatória por inadimplência",
  );
});
test("critérios são validados e nenhum nome de cliente é unido por aproximação", async () => {
  const invalid = structuredClone(proposedConfig);
  invalid.rules.Crítico.delayDays = 0;
  assert.throws(() => validateConfig(invalid), /crescer/);
  const data = await dataset();
  data.records[0].client = "Cliente Teste A Ltda";
  assert.equal(analyzeCredit(data, initialFilters(data)).length, 3);
});
test("negativos e ausência de datas não inventam risco ou limite-base", async () => {
  const data = await dataset();
  data.records[0].cents = -100;
  const negative = analyzeCredit(data, initialFilters(data)).find(
    (client) => client.key === clientKey("Cliente Teste A"),
  )!;
  assert.equal(negative.risk, "Dados insuficientes");
  assert.equal(negative.baseLimit, null);
  const other = await dataset();
  for (const record of other.records)
    if (record.category === "received") record.due = null;
  const missing = analyzeCredit(other, initialFilters(other))[0];
  assert.equal(missing.risk, "Dados insuficientes");
  assert.equal(missing.payments.onTimeRatio, null);
  const future = await dataset();
  const futureReceipt = future.records
    .filter((row) => row.category === "received")
    .at(-1)!;
  futureReceipt.received = "2027-01-01";
  futureReceipt.cents = -1;
  assert.notEqual(
    analyzeCredit(future, initialFilters(future))[0].risk,
    "Dados insuficientes",
    "ajustes fora do YTD não alteram o risco do período",
  );
});
test("base antiga é enriquecida pela origem; filtros não subestimam a dívida do cliente", async () => {
  const data = await dataset();
  for (const map of data.mappings)
    for (const key of ["issued", "document", "installment"])
      delete (map.fields as unknown as Record<string, number>)[key];
  for (const row of data.records) {
    delete row.issued;
    delete row.document;
    delete row.installment;
  }
  const filters = {
    ...initialFilters(data),
    representative: "Representante A",
    category: "received",
  };
  const clients = analyzeCredit(data, filters);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].exposure, 15000);
  assert.equal(clients[0].baseLimit, 3483);
  const january = analyzeCredit(data, {
    ...initialFilters(data),
    month: "01",
  })[0];
  assert.equal(january.received, 6000);
  assert.equal(january.exposure, 15000);
});
test(
  "planilha oficial: todos os clientes conciliam com leitura independente em Python",
  { skip: !process.env.BIOSAUDE_TEST_WORKBOOK },
  async () => {
    const file = process.env.BIOSAUDE_TEST_WORKBOOK!;
    const independent = JSON.parse(
      execFileSync("python", ["scripts/validate_credit_reference.py", file], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      }),
    );
    const source = await readWorkbook(
        Uint8Array.from(await readFile(file)).buffer,
      ),
      data = normalize(
        source,
        suggestMappings(source),
        "2026-10-19",
        "official.xlsx",
      ),
      clients = analyzeCredit(data, initialFilters(data));
    assert.equal(data.records.length, 5099);
    assert.equal(clients.length, 169);
    assert.equal(independent.clientCount, 169);
    assert.deepEqual(independent.totals, {
      upcoming: 2571124724,
      overdue: 1057501521,
      exposure: 3628626245,
      received: 5699981930,
    });
    for (const client of clients) {
      const expected =
        independent.clients[
          createHash("sha256").update(client.key).digest("hex")
        ];
      assert.ok(expected);
      for (const field of [
        "upcoming",
        "overdue",
        "exposure",
        "received",
        "baseLimit",
        "creditReceipts",
        "risk",
      ] as const)
        assert.equal(client[field], expected[field], field);
      near(client.delinquency, expected.delinquency);
      near(client.creditTermDays, expected.term);
      near(client.payments.weightedLateDays, expected.weightedLateDays);
      near(client.payments.meanLateDays, expected.meanLateDays);
      near(client.payments.weightedPaymentDays, expected.weightedPaymentDays);
      near(client.windowMonths, expected.windowMonths);
      assert.equal(client.payments.meanMonthly, expected.meanMonthly);
      assert.equal(client.payments.records, expected.receiptRecords);
      assert.equal(client.payments.titleCount, expected.titleCount);
      assert.equal(client.payments.onTimeCount, expected.onTimeCount);
      assert.equal(client.payments.lateCount, expected.lateCount);
      assert.deepEqual(
        client.bands.map((band) => band.cents),
        expected.bands,
      );
      assert.equal(client.recommendation, null);
    }
  },
);
