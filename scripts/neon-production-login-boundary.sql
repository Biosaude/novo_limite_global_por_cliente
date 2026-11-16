-- BIOSAUDE / HOMOLOGACAO EXCLUSIVAMENTE
-- Neon branch ID: br-small-smoke-b58d8gl6; DB: neondb.
-- A identificacao da branch precisa ser confirmada no painel Neon.
-- Esta versao remove o SELECT aninhado complexo que falhou no bloco 2.
-- NAO EXECUTADO no Neon pelo assistente. Nao executar em Production.
-- O bloco 1 original aprovado continua como preflight antes deste arquivo.
-- Execute este arquivo SOMENTE apos preflight aprovado e com branch confirmada.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL idle_in_transaction_session_timeout='60s';
SET LOCAL search_path=pg_catalog;
CREATE TEMP TABLE biosaude_policy_baseline ON COMMIT DROP AS
  SELECT * FROM pg_catalog.pg_policies WHERE schemaname='biosaude';

DO $precheck$
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'STOP: banco incorreto';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname='biosaude') <> 21 THEN
    RAISE EXCEPTION 'STOP: baseline de 21 politicas nao confirmado';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
             WHERE schemaname='biosaude' AND policyname='production_login_boundary') THEN
    RAISE EXCEPTION 'STOP: politicas novas ja existem; nao reaplicar';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='biosaude' AND c.relkind IN ('r','p')
         AND c.relname <> 'schema_migrations'
         AND c.relrowsecurity AND c.relforcerowsecurity) <> 20 THEN
    RAISE EXCEPTION 'STOP: RLS ativo e forcado nao confirmado nas 20 tabelas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='biosaude_runtime_prod'
       AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
       AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication) THEN
    RAISE EXCEPTION 'STOP: runtime invalido';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles r ON r.oid=m.member
       WHERE r.rolname='biosaude_runtime_prod') THEN
    RAISE EXCEPTION 'STOP: runtime possui membership de role; revisar privilegios';
  END IF;
END $precheck$;

CREATE POLICY production_login_boundary ON biosaude.workspaces
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.identity_memberships
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.workspace_state
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.dataset_state
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.active_datasets
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.import_versions
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.clients
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.financial_titles
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.import_titles
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.financial_records
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.receipt_entries
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.delinquency_positions
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.credit_proposals
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.audit_issues
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.audit_events
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.audit_review_history
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.collection_actions
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.legal_processes
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.process_revisions
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

CREATE POLICY production_login_boundary ON biosaude.process_title_links
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid)
  WITH CHECK (session_user <> 'biosaude_runtime_prod' OR workspace_id = '6aa0ef36-66d5-4b16-8acc-2846586458ec'::uuid);

DO $postcheck$
DECLARE n_all integer; n_boundary integer; n_restrictive integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE policyname='production_login_boundary'),
         count(*) FILTER (WHERE policyname='production_login_boundary'
                            AND permissive='RESTRICTIVE' AND cmd='ALL')
    INTO n_all,n_boundary,n_restrictive
    FROM pg_catalog.pg_policies WHERE schemaname='biosaude';
  IF n_all<>41 OR n_boundary<>20 OR n_restrictive<>20 THEN
    RAISE EXCEPTION 'STOP: contagens de politicas divergentes %/%/%', n_all,n_boundary,n_restrictive;
  END IF;
  IF EXISTS (
    (SELECT * FROM pg_temp.biosaude_policy_baseline
     EXCEPT SELECT * FROM pg_catalog.pg_policies WHERE schemaname='biosaude')
    UNION ALL
    (SELECT * FROM pg_catalog.pg_policies WHERE schemaname='biosaude'
       AND policyname <> 'production_login_boundary'
     EXCEPT SELECT * FROM pg_temp.biosaude_policy_baseline)
  ) THEN
    RAISE EXCEPTION 'STOP: baseline de politicas foi alterado';
  END IF;
END $postcheck$;
COMMIT;
-- APOS commit: executar bloco 3 original (somente leitura), separadamente.
