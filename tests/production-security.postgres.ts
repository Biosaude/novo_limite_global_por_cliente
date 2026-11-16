/** Explicit integration suite: Docker + real PostgreSQL 18, no network/Neon. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { PRODUCTION_RUNTIME_CHECK } from '../server/db/client.js';

const image = 'postgres:18@sha256:2ea8630df176ad090ec92136dee850397c5af8781e4bcf2e4162593691c61bbc';
const runtime = 'biosaude_runtime_prod';
const workspace = '6aa0ef36-66d5-4b16-8acc-2846586458ec'; // supplied HOMOLOGACAO boundary, not evidence of Production
const other = '11111111-1111-4111-8111-111111111111';
const boundary = readFileSync('scripts/neon-production-login-boundary.sql', 'utf8');
const grants = readFileSync('scripts/neon-production-runtime-grants.sql', 'utf8');
const container = `biosaude-security-${process.pid}-${Date.now()}`;
function docker(args: string[], input?: string) {
  return execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 60_000 });
}
function sql(input: string, user = 'postgres') {
  return docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U',user,'-d','neondb'], input).trim();
}
function denied(input: string, user = runtime, state?: string) {
  assert.throws(() => sql(input, user), (error: unknown) => {
    if (!state) return true;
    return !!error && typeof error === 'object' && 'stderr' in error && String(error.stderr).includes(state);
  });
}
function scoped(input: string, w = workspace) {
  return `BEGIN; SELECT set_config('biosaude.workspace_id','${w}',true); ${input}; COMMIT;`;
}
function policies() {
  return sql("SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]') FROM pg_policies p WHERE schemaname='biosaude' AND policyname <> 'production_login_boundary'");
}
function seed(w: string) {
  return `
INSERT INTO biosaude.workspaces(id,name) VALUES('${w}','Synthetic');
INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,permissions,provisioned_by)
 VALUES('${w}','https://synthetic.invalid/','operator',ARRAY['datasets:read','datasets:write','credit:read','credit:write'],'offline-test');
INSERT INTO biosaude.workspace_state(workspace_id) VALUES('${w}');
INSERT INTO biosaude.import_versions VALUES('${w}','v1','2026-10-19','synthetic.xlsx',now(),repeat('0',64),'{}');
INSERT INTO biosaude.dataset_state(workspace_id,version_id,updated_at) VALUES('${w}','v1',now());
INSERT INTO biosaude.active_datasets VALUES('${w}','v1');
INSERT INTO biosaude.clients(workspace_id,id,match_key,display_name) VALUES('${w}','22222222-2222-4222-8222-222222222222','SYNTHETIC','Synthetic');
INSERT INTO biosaude.financial_titles(workspace_id,id,client_id,identity_key,document,installment,display_title)
 VALUES('${w}','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','test','1','1','Synthetic');
INSERT INTO biosaude.import_titles VALUES('${w}','v1','33333333-3333-4333-8333-333333333333');
INSERT INTO biosaude.financial_records(workspace_id,version_id,id,title_id,category,client_original_name,representative,source_sheet,source_row,amount_cents)
 VALUES('${w}','v1','r1','33333333-3333-4333-8333-333333333333','received','Synthetic','Synthetic','Recebido',2,123),
 ('${w}','v1','r2','33333333-3333-4333-8333-333333333333','overdue','Synthetic','Synthetic','Vencidos',2,456);
INSERT INTO biosaude.receipt_entries(workspace_id,version_id,record_id) VALUES('${w}','v1','r1');
INSERT INTO biosaude.delinquency_positions(workspace_id,version_id,record_id) VALUES('${w}','v1','r2');
INSERT INTO biosaude.credit_proposals VALUES('${w}','p1',1,now(),'Synthetic','{}','draft','offline');
INSERT INTO biosaude.audit_issues VALUES('${w}','v1','a1','warning','TEST','Synthetic','["r1"]');
INSERT INTO biosaude.audit_review_history(workspace_id,version_id,issue_key,operation,review,actor_subject) VALUES('${w}','v1','a1','recorded','{}','offline');
INSERT INTO biosaude.collection_actions(workspace_id,version_id,title_id,id,sequence,stage,responsible,actor_subject,contact_on,action)
 VALUES('${w}','v1','33333333-3333-4333-8333-333333333333','c1',1,'Não iniciado','Synthetic','offline',current_date,'Synthetic');
INSERT INTO biosaude.legal_processes(workspace_id,id) VALUES('${w}','l1');
INSERT INTO biosaude.process_revisions(workspace_id,process_id,revision,process_number,interested_party,opposing_party,nature,action_type,court,declared_status,responsible,next_step,source,actor_subject)
 VALUES('${w}','l1',1,'1','Synthetic','Synthetic','judicial','Synthetic','Synthetic','Synthetic','Synthetic','Synthetic','Synthetic','offline');
INSERT INTO biosaude.process_title_links(workspace_id,process_id,process_revision,version_id,title_id,confirmed_by,confirmed_at,evidence)
 VALUES('${w}','l1',1,'v1','33333333-3333-4333-8333-333333333333','offline',now(),'Synthetic');`;
}

test('Production security: PostgreSQL 18 disposable (no external database)', { timeout: 180_000 }, async t => {
  try {
    docker(['run','--rm','--detach','--network','none','--name',container,
      '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=neondb',image]);
    let ready = false;
    for (let n=0; n<60; n++) {
      try { sql('SELECT 1'); ready=true; break; } catch { await delay(250); }
    }
    assert.ok(ready, 'PostgreSQL did not start');
    const version = sql('SHOW server_version');
    assert.match(version, /^18\./);
    t.diagnostic(`PostgreSQL ${version}; image ${image}; network=none; no published ports`);
    for (const file of ['0001_financial_foundation.sql','0002_security_and_immutability.sql','0003_financial_access.sql'])
      sql(readFileSync(`migrations/${file}`, 'utf8'));
    sql(`CREATE ROLE ${runtime} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`);
    sql(seed(workspace) + seed(other));
    const baseline = policies();
    assert.equal(JSON.parse(baseline).length, 21);

    await t.test('full SQL commits 20 restrictive policies, preserving all 21 baseline definitions', () => {
      sql(boundary);
      assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='biosaude'"), '41');
      assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='biosaude' AND policyname='production_login_boundary' AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['public']::name[]"), '20');
      assert.equal(policies(), baseline);
      sql(grants);
      // The saved grants can be reapplied without changing policy/data state.
      sql(grants);
      sql(PRODUCTION_RUNTIME_CHECK, runtime);
    });
    await t.test('runtime privileges: no memberships/admin/DDL/history rewrite or membership provisioning', () => {
      denied(scoped("INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,provisioned_by) VALUES('"+workspace+"','https://synthetic.invalid/','attacker','offline')"));
      denied(scoped("UPDATE biosaude.identity_memberships SET permissions=ARRAY['credit:write']"));
      denied(scoped('DELETE FROM biosaude.identity_memberships'));
      denied('CREATE TABLE biosaude.attacker(id int)');
      denied('SET ROLE biosaude_membership_admin');
      denied('ALTER ROLE biosaude_runtime_prod SUPERUSER');
      denied(scoped("UPDATE biosaude.financial_records SET amount_cents=0"));
      denied(scoped('DELETE FROM biosaude.audit_events'));
      denied("INSERT INTO biosaude.schema_migrations VALUES('9999',repeat('0',64),now())");
      assert.equal(sql(scoped("SELECT biosaude.require_permission('"+workspace+"','https://synthetic.invalid/','operator','datasets:read')"), runtime).split('\n').at(-1), 't');
      denied(scoped("SELECT biosaude.require_permission('"+workspace+"','https://synthetic.invalid/','unprovisioned','datasets:read')"));
    });
    await t.test('all 20 tables enforce workspace scope even when the runtime changes the custom GUC', () => {
      const tables = JSON.parse(sql("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='biosaude' AND tablename <> 'schema_migrations'")) as string[];
      assert.equal(tables.length, 20);
      // Give SELECT on the four unused tables only for this RLS probe, then restore least grants.
      sql('GRANT SELECT ON ALL TABLES IN SCHEMA biosaude TO biosaude_runtime_prod');
      try {
        for (const table of tables) {
          const field = table === 'workspaces' ? 'id' : 'workspace_id';
          assert.ok(Number(sql(scoped(`SELECT count(*) FROM biosaude.${table}`), runtime).split('\n').at(-1)) > 0, table);
          assert.equal(sql(scoped(`SELECT count(*) FROM biosaude.${table} WHERE ${field} <> '${workspace}'`), runtime).split('\n').at(-1), '0', table);
          assert.equal(sql(scoped(`SELECT count(*) FROM biosaude.${table}`, other), runtime).split('\n').at(-1), '0', table);
          assert.equal(sql(`SELECT count(*) FROM biosaude.${table}`, runtime), '0', `${table}: missing GUC`);
        }
      } finally { sql(grants); }
      denied(scoped(`INSERT INTO biosaude.workspace_state(workspace_id) VALUES('${other}') ON CONFLICT(workspace_id) DO UPDATE SET revision=1`, other));
      assert.equal(sql(scoped('UPDATE biosaude.workspace_state SET revision=revision+1 RETURNING revision'), runtime).split('\n').at(-1), '1');
      assert.equal(sql(`SELECT revision FROM biosaude.workspace_state WHERE workspace_id='${other}'`), '0');
      sql("GRANT SELECT ON biosaude.workspaces TO biosaude_membership_admin");
      assert.equal(sql(`BEGIN; SET LOCAL ROLE biosaude_membership_admin; SELECT set_config('biosaude.workspace_id','${other}',true); SELECT count(*) FROM biosaude.workspaces; COMMIT;`).split('\n').at(-1), '1', 'boundary preserves other sessions baseline');
    });
    await t.test('guard rejects actual elevated sessions, memberships, ownership and schema CREATE', () => {
      denied(PRODUCTION_RUNTIME_CHECK, 'postgres');
      for (const attribute of ['SUPERUSER','BYPASSRLS','CREATEDB','CREATEROLE','REPLICATION']) {
        sql(`ALTER ROLE ${runtime} ${attribute}`);
        try { denied(PRODUCTION_RUNTIME_CHECK); } finally { sql(`ALTER ROLE ${runtime} NO${attribute}`); }
      }
      sql(`GRANT biosaude_membership_admin TO ${runtime}`);
      try { denied(PRODUCTION_RUNTIME_CHECK); denied(grants, 'postgres'); } finally { sql(`REVOKE biosaude_membership_admin FROM ${runtime}`); }
      sql(`GRANT CREATE ON SCHEMA biosaude TO ${runtime}`);
      try { denied(PRODUCTION_RUNTIME_CHECK); } finally { sql(`REVOKE CREATE ON SCHEMA biosaude FROM ${runtime}`); }
      sql(`ALTER TABLE biosaude.workspace_state OWNER TO ${runtime}`);
      try { denied(PRODUCTION_RUNTIME_CHECK); } finally { sql('ALTER TABLE biosaude.workspace_state OWNER TO postgres'); }
      for (const [table, privilege] of [['identity_memberships','INSERT'],['schema_migrations','UPDATE'],['financial_records','TRUNCATE']]) {
        sql(`GRANT ${privilege} ON biosaude.${table} TO ${runtime}`);
        try { denied(PRODUCTION_RUNTIME_CHECK, runtime, '42501'); }
        finally { sql(`REVOKE ${privilege} ON biosaude.${table} FROM ${runtime}`); }
      }
      sql('ALTER TABLE biosaude.workspace_state DISABLE ROW LEVEL SECURITY');
      try { denied(PRODUCTION_RUNTIME_CHECK, runtime, '42501'); }
      finally { sql('ALTER TABLE biosaude.workspace_state ENABLE ROW LEVEL SECURITY'); }
      sql('DROP POLICY production_login_boundary ON biosaude.workspace_state');
      try { denied(PRODUCTION_RUNTIME_CHECK, runtime, '42501'); }
      finally { sql(boundary.match(/CREATE POLICY production_login_boundary ON biosaude\.workspace_state[\s\S]*?;/)![0]); }
      sql(PRODUCTION_RUNTIME_CHECK, runtime);
    });
    await t.test('reapplication is refused without modifying any policy', () => {
      denied(boundary, 'postgres');
      assert.equal(policies(), baseline);
      assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='biosaude'"), '41');
    });
    // Remove only policies created by this test, in its disposable container.
    sql("DO $$ DECLARE p record; BEGIN FOR p IN SELECT tablename FROM pg_policies WHERE schemaname='biosaude' AND policyname='production_login_boundary' LOOP EXECUTE format('DROP POLICY production_login_boundary ON biosaude.%I',p.tablename); END LOOP; END $$");
    await t.test('mid-file syntax error and postcondition failure both roll back all newly created policies', () => {
      for (const broken of [
        boundary.replace('ON biosaude.active_datasets\n', 'ON biosaude.active_datasets INVALID_TOKEN\n'),
        boundary.replace('IF n_all<>41', 'IF n_all<>42'),
      ]) {
        denied(broken, 'postgres', broken.includes('INVALID_TOKEN') ? '42601' : 'P0001');
        assert.equal(policies(), baseline);
        assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='biosaude'"), '21');
      }
      sql(boundary);
      assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='biosaude'"), '41');
    });
    await t.test('failed application transaction rolls back previous writes and revision', () => {
      const before = sql(`SELECT revision FROM biosaude.workspace_state WHERE workspace_id='${workspace}'`);
      denied(scoped(`SELECT biosaude.advance_revision('${workspace}',${before}); INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,provisioned_by) VALUES('${workspace}','https://synthetic.invalid/','attacker','offline')`));
      assert.equal(sql(`SELECT revision FROM biosaude.workspace_state WHERE workspace_id='${workspace}'`), before);
    });
  } finally {
    docker(['rm','--force',container]);
  }
});
