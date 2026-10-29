import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrationPlan } from "../server/db/migration-plan";
import {
  createDatabase,
  type DriverFactory,
  type Row,
} from "../server/db/client";
import { PostgresDatasetRepository } from "../server/persistence/postgres-datasets";
import { PostgresProposalRepository } from "../server/persistence/postgres-proposals";
import type { AuthorizationGate } from "../server/security/authorization";
import { proposedConfig } from "../src/credito/policy";
import { readWorkbook } from "../src/importacao/workbook";
import { suggestMappings } from "../src/importacao/mapping";
import { normalize } from "../src/importacao/normalize";
import { fixture } from "./fixtures";
const pg = new PGlite();
const fake =
  "postgresql://unit_user:NOT_A_REAL_PASSWORD@ep-unit.example.invalid/test_db?sslmode=require";
before(async () => {
  for (const m of await migrationPlan()) await pg.exec(m.sql);
  await pg.exec(
    "CREATE ROLE biosaude_app_test NOSUPERUSER NOBYPASSRLS NOLOGIN; GRANT USAGE ON SCHEMA biosaude TO biosaude_app_test; GRANT SELECT ON biosaude.workspaces TO biosaude_app_test;",
  );
  const tables = (
    await pg.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='biosaude' AND tablename NOT IN ('workspaces','schema_migrations')",
    )
  ).rows;
  for (const t of tables)
    await pg.exec(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON biosaude.${t.tablename} TO biosaude_app_test`,
    );
});
after(async () => pg.close());
const factory: DriverFactory = () => ({
  async transaction(statements) {
    return pg.transaction(async (tx) => {
      const result: Row[][] = [];
      for (const q of statements)
        result.push(
          (await tx.query(q.text, [...(q.values ?? [])])).rows as Row[],
        );
      return result;
    });
  },
});
async function scope() {
  const workspaceId = crypto.randomUUID();
  await pg.exec("RESET ROLE");
  await pg.query("INSERT INTO biosaude.workspaces(id,name) VALUES($1,$2)", [
    workspaceId,
    "Organização sintética",
  ]);
  await pg.exec("SET ROLE biosaude_app_test");
  const db = createDatabase({ DATABASE_URL: fake }, factory),
    gate: AuthorizationGate = {
      async authorize() {
        return { workspaceId, subject: "verified-test-subject" };
      },
    };
  return {
    workspaceId,
    db,
    gate,
    repo: new PostgresDatasetRepository(db, gate),
  };
}
async function dataset() {
  const source = await readWorkbook(Uint8Array.from(await fixture()).buffer);
  return normalize(
    source,
    suggestMappings(source),
    "2026-10-19",
    "BASE_SINTETICA.xlsx",
  );
}
test("PostgreSQL descartável: migrações criam esquema com RLS e nenhum dado financeiro pré-cadastrado", async () => {
  await pg.exec("RESET ROLE");
  const count = await pg.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM biosaude.import_versions",
  );
  assert.equal(count.rows[0].count, 0);
  const security = await pg.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='biosaude' AND c.relkind='r' AND c.relname<>'schema_migrations'",
  );
  assert.ok(security.rows.length >= 15);
  assert.ok(
    security.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
  );
});
test("repositório PostgreSQL: round-trip mantém seis lançamentos, centavos, referências e saldos distintos do nominal", async () => {
  const s = await scope(),
    d = await dataset(),
    original = JSON.stringify(d);
  assert.equal(await s.repo.load(), null);
  await s.repo.save(d);
  const loaded = await s.repo.load();
  assert.ok(loaded);
  assert.deepEqual(
    loaded.records.map((r) => [r.id, r.category, r.cents, r.due, r.received]),
    d.records.map((r) => [r.id, r.category, r.cents, r.due, r.received]),
  );
  assert.equal(JSON.stringify(d), original);
  const [totals] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT category,count(*)::int AS count,sum(amount_cents)::text AS total FROM biosaude.financial_records WHERE workspace_id=$1 GROUP BY category",
      values: [s.workspaceId],
    },
  ]);
  assert.deepEqual(
    Object.fromEntries(totals.map((r) => [r.category, [r.count, r.total]])),
    { upcoming: [1, "10010"], overdue: [1, "5020"], received: [4, "155070"] },
  );
  const [receipts] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT count(*)::int AS count FROM biosaude.receipt_entries WHERE workspace_id=$1",
      values: [s.workspaceId],
    },
  ]);
  assert.equal(receipts[0].count, 4);
});
test("repositório: novas versões e desativação preservam histórico, sem misturar posições", async () => {
  const s = await scope(),
    d = await dataset();
  await s.repo.save(d);
  const second = {
    ...structuredClone(d),
    id: crypto.randomUUID(),
    reference: "2026-10-23",
    updatedAt: "2026-10-23T12:00:00.000Z",
  };
  await s.repo.save(second);
  assert.equal((await s.repo.load())?.id, second.id);
  assert.equal((await s.repo.history()).length, 2);
  await s.repo.clear();
  assert.equal(await s.repo.load(), null);
  assert.equal((await s.repo.history()).length, 2);
});
test("repositório: revisão auditável mantém finanças imutáveis e rejeita reuso de identificador", async () => {
  const s = await scope(),
    d = await dataset();
  await s.repo.save(d);
  const loaded = (await s.repo.load())!;
  const review = {
    ...loaded,
    reviews: {
      "issue-test": {
        note: "Conferência sintética",
        reviewedAt: "2026-10-19T12:00:00Z",
      },
    },
  };
  await s.repo.save(review);
  assert.deepEqual((await s.repo.load())?.reviews, review.reviews);
  const altered = structuredClone(d);
  altered.records[0].cents = 999999;
  await assert.rejects(s.repo.save(altered), {
    code: "DATABASE_OPERATION_FAILED",
  });
  assert.equal((await s.repo.load())?.records[0].cents, d.records[0].cents);
  const [events] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT count(*)::int AS count FROM biosaude.audit_events WHERE workspace_id=$1",
      values: [s.workspaceId],
    },
  ]);
  assert.equal(events[0].count, 2);
  await s.repo.save({
    ...review,
    reviews: {
      "issue-test": {
        note: "Segunda revisão",
        reviewedAt: "2026-10-19T13:00:00Z",
      },
    },
  });
  await s.repo.save({ ...review, reviews: {} });
  const [history] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT operation,review FROM biosaude.audit_review_history WHERE workspace_id=$1 ORDER BY created_at,id",
      values: [s.workspaceId],
    },
  ]);
  assert.equal(history.length, 3);
  assert.ok(
    history.some(
      (r) =>
        (r.review as { note?: string } | null)?.note ===
        "Conferência sintética",
    ),
  );
  assert.ok(history.some((r) => r.operation === "removed"));
});
test("RLS: organizações isoladas, ausência de contexto nega leitura e contexto não vaza após transação", async () => {
  const a = await scope(),
    d = await dataset();
  await a.repo.save(d);
  const b = await scope();
  assert.equal(await b.repo.load(), null);
  const [rows] = await b.db.transaction(b.workspaceId, [
    {
      text: "SELECT * FROM biosaude.import_versions WHERE id=$1",
      values: [d.id],
    },
  ]);
  assert.equal(rows.length, 0);
  assert.equal(
    (await pg.query("SELECT * FROM biosaude.import_versions")).rows.length,
    0,
  );
  await assert.rejects(
    b.db.transaction(b.workspaceId, [
      {
        text: "INSERT INTO biosaude.active_datasets(workspace_id,version_id) VALUES($1,$2)",
        values: [b.workspaceId, d.id],
      },
    ]),
    { code: "DATABASE_OPERATION_FAILED" },
  );
  assert.equal((await a.repo.load())?.id, d.id);
});
test("integridade: categoria, limites monetários e histórico financeiro/auditoria protegidos pelo SQL", async () => {
  const s = await scope(),
    d = await dataset();
  await s.repo.save(d);
  for (const q of [
    "DELETE FROM biosaude.financial_records WHERE workspace_id=$1",
    "UPDATE biosaude.audit_events SET action='tampered' WHERE workspace_id=$1",
  ]) {
    await assert.rejects(
      s.db.transaction(s.workspaceId, [{ text: q, values: [s.workspaceId] }]),
      { code: "DATABASE_OPERATION_FAILED" },
    );
  }
  const up = d.records.find((r) => r.category === "upcoming")!;
  await assert.rejects(
    s.db.transaction(s.workspaceId, [
      {
        text: "INSERT INTO biosaude.receipt_entries(workspace_id,version_id,record_id) VALUES($1,$2,$3)",
        values: [s.workspaceId, d.id, up.id],
      },
    ]),
    { code: "DATABASE_OPERATION_FAILED" },
  );
  const malformed = structuredClone(d);
  malformed.records[0].cents = Number.MAX_SAFE_INTEGER + 1;
  await assert.rejects(s.repo.save(malformed), { code: "DATASET_INVALID" });
  const overflow = structuredClone(d);
  overflow.records[0].cents = Number.MAX_SAFE_INTEGER;
  await assert.rejects(s.repo.save(overflow), { code: "DATASET_INVALID" });
});
test("crédito: porta de propostas é compatível, guarda apenas rascunhos e mantém auditoria", async () => {
  const s = await scope(),
    repo = new PostgresProposalRepository(s.db, s.gate),
    p = {
      id: crypto.randomUUID(),
      version: 1,
      createdAt: "2026-10-19T12:00:00.000Z",
      reason: "Revisão sintética",
      config: proposedConfig,
      status: "draft" as const,
    };
  await repo.append(p);
  assert.deepEqual(await repo.list(), [p]);
  await assert.rejects(
    repo.append({ ...p, id: crypto.randomUUID(), status: "approved" as never }),
    { code: "PROPOSAL_INVALID" },
  );
  const [events] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT * FROM biosaude.audit_events WHERE workspace_id=$1 AND action='credit.proposal.append'",
      values: [s.workspaceId],
    },
  ]);
  assert.equal(events.length, 1);
});
test("SQL parametrizado: texto com aspas e SQL permanece dado literal, sem execução", async () => {
  const s = await scope(),
    d = await dataset();
  d.records[0].client = "Cliente'; DROP TABLE biosaude.financial_records; --";
  await s.repo.save(d);
  assert.equal((await s.repo.load())?.records[0].client, d.records[0].client);
  const [rows] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT count(*)::int AS count FROM biosaude.financial_records WHERE workspace_id=$1",
      values: [s.workspaceId],
    },
  ]);
  assert.equal(rows[0].count, 6);
});

test("processos preparados: vínculo administrativo não judicializa, revisões documentadas e causas não alteram dívida", async () => {
  const s = await scope(),
    d = await dataset();
  await s.repo.save(d);
  const [rows] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT title_id FROM biosaude.financial_records WHERE workspace_id=$1 AND version_id=$2 AND category='overdue'",
      values: [s.workspaceId, d.id],
    },
  ]);
  const title = String(rows[0].title_id),
    p = "processo-sintetico";
  await s.db.transaction(s.workspaceId, [
    {
      text: "INSERT INTO biosaude.legal_processes(workspace_id,id) VALUES($1,$2)",
      values: [s.workspaceId, p],
    },
    {
      text: "INSERT INTO biosaude.process_revisions(workspace_id,process_id,revision,process_number,interested_party,opposing_party,nature,action_type,court,claim_cents,declared_status,responsible,next_step,source,actor_subject) VALUES($1,$2,1,'REFERENCIA-SINTETICA','Parte informada','Adversa informada','administrative','Procedimento','Órgão sintético',9999900,'Informado','Responsável','Providência','Documento sintético',$3)",
      values: [s.workspaceId, p, "verified-test-subject"],
    },
    {
      text: "INSERT INTO biosaude.process_title_links(workspace_id,process_id,process_revision,version_id,title_id,confirmed_by,confirmed_at,evidence) VALUES($1,$2,1,$3,$4,'verified-test-subject',now(),'Documento conferido')",
      values: [s.workspaceId, p, d.id, title],
    },
  ]);
  const stage = {
    text: "INSERT INTO biosaude.collection_actions(workspace_id,version_id,title_id,id,sequence,stage,responsible,actor_subject,contact_on,action) VALUES($1,$2,$3,$4,1,'Judicializado','Responsável','verified-test-subject','2026-10-19','Ação informada')",
    values: [s.workspaceId, d.id, title, "acao-sintetica"],
  };
  await assert.rejects(s.db.transaction(s.workspaceId, [stage]), {
    code: "DATABASE_OPERATION_FAILED",
  });
  await s.db.transaction(s.workspaceId, [
    {
      text: "INSERT INTO biosaude.process_revisions(workspace_id,process_id,revision,process_number,interested_party,opposing_party,nature,action_type,court,claim_cents,declared_status,responsible,next_step,source,actor_subject) VALUES($1,$2,2,'REFERENCIA-SINTETICA','Parte informada','Adversa informada','judicial','Ação informada','Órgão sintético',9999900,'Informado','Responsável','Providência','Documento sintético','verified-test-subject')",
      values: [s.workspaceId, p],
    },
    {
      text: "INSERT INTO biosaude.process_title_links(workspace_id,process_id,process_revision,version_id,title_id,confirmed_by,confirmed_at,evidence) VALUES($1,$2,2,$3,$4,'verified-test-subject',now(),'Documento conferido')",
      values: [s.workspaceId, p, d.id, title],
    },
    stage,
  ]);
  const [balance] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT sum(amount_cents)::text AS total FROM biosaude.financial_records WHERE workspace_id=$1 AND version_id=$2 AND category='overdue'",
      values: [s.workspaceId, d.id],
    },
  ]);
  assert.equal(balance[0].total, "5020");
  await assert.rejects(
    s.db.transaction(s.workspaceId, [
      {
        text: "UPDATE biosaude.collection_actions SET stage=$2 WHERE workspace_id=$1",
        values: [s.workspaceId, "Recuperado"],
      },
    ]),
    { code: "DATABASE_OPERATION_FAILED" },
  );
});
test("atomicidade PostgreSQL: falha em lote desfaz inclusive evento de auditoria anterior", async () => {
  const s = await scope();
  await assert.rejects(
    s.db.transaction(s.workspaceId, [
      {
        text: "INSERT INTO biosaude.audit_events(workspace_id,actor_subject,action) VALUES($1,'verified-test-subject','must.rollback')",
        values: [s.workspaceId],
      },
      {
        text: "INSERT INTO biosaude.active_datasets(workspace_id,version_id) VALUES($1,$2)",
        values: [s.workspaceId, "versao-inexistente"],
      },
    ]),
    { code: "DATABASE_OPERATION_FAILED" },
  );
  const [rows] = await s.db.transaction(s.workspaceId, [
    {
      text: "SELECT count(*)::int AS count FROM biosaude.audit_events WHERE workspace_id=$1",
      values: [s.workspaceId],
    },
  ]);
  assert.equal(rows[0].count, 0);
});
