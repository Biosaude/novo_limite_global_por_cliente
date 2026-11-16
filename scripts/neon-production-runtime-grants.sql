-- PLANO PARA HOMOLOGACAO; nao executado no Neon. Exige aprovacao separada.
-- Nao cria login/senha/membership, nao provisiona usuarios nem concede DDL.
-- Normaliza apenas grants DIRETOS da role de runtime no schema biosaude.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog;
DO $precheck$
BEGIN
  IF current_database() <> 'neondb' OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='biosaude_runtime_prod'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member
      WHERE r.rolname='biosaude_runtime_prod'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='biosaude' AND r.rolname='biosaude_runtime_prod'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='biosaude' AND r.rolname='biosaude_runtime_prod'
  ) THEN
    RAISE EXCEPTION 'STOP: runtime ausente ou com privilegios excessivos';
  END IF;
END $precheck$;
REVOKE ALL ON SCHEMA biosaude FROM biosaude_runtime_prod;
GRANT USAGE ON SCHEMA biosaude TO biosaude_runtime_prod;
REVOKE ALL ON ALL TABLES IN SCHEMA biosaude FROM biosaude_runtime_prod;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA biosaude FROM biosaude_runtime_prod;
GRANT SELECT ON biosaude.workspaces, biosaude.identity_memberships,
  biosaude.workspace_state, biosaude.dataset_state, biosaude.active_datasets,
  biosaude.import_versions, biosaude.clients, biosaude.financial_titles,
  biosaude.import_titles, biosaude.financial_records, biosaude.receipt_entries,
  biosaude.delinquency_positions, biosaude.credit_proposals, biosaude.audit_issues,
  biosaude.audit_events, biosaude.audit_review_history TO biosaude_runtime_prod;
GRANT INSERT ON biosaude.workspace_state, biosaude.dataset_state,
  biosaude.active_datasets, biosaude.import_versions, biosaude.clients,
  biosaude.financial_titles, biosaude.import_titles, biosaude.financial_records,
  biosaude.receipt_entries, biosaude.delinquency_positions, biosaude.credit_proposals,
  biosaude.audit_issues, biosaude.audit_events, biosaude.audit_review_history TO biosaude_runtime_prod;
GRANT UPDATE ON biosaude.workspace_state, biosaude.dataset_state,
  biosaude.active_datasets TO biosaude_runtime_prod;
GRANT DELETE ON biosaude.active_datasets TO biosaude_runtime_prod;
GRANT EXECUTE ON FUNCTION biosaude.require_permission(uuid,text,text,text),
  biosaude.advance_revision(uuid,bigint), biosaude.require_version(uuid,text),
  biosaude.assert_import_content(uuid,text,text) TO biosaude_runtime_prod;
DO $postcheck$
BEGIN
  IF pg_catalog.has_schema_privilege('biosaude_runtime_prod','biosaude','CREATE')
    OR pg_catalog.has_table_privilege('biosaude_runtime_prod','biosaude.identity_memberships','INSERT')
    OR pg_catalog.has_table_privilege('biosaude_runtime_prod','biosaude.identity_memberships','UPDATE')
    OR pg_catalog.has_table_privilege('biosaude_runtime_prod','biosaude.identity_memberships','DELETE')
    OR pg_catalog.has_table_privilege('biosaude_runtime_prod','biosaude.schema_migrations','INSERT')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='biosaude' AND c.relkind IN ('r','p')
      AND pg_catalog.has_table_privilege('biosaude_runtime_prod',c.oid,'TRUNCATE,TRIGGER'))
  THEN RAISE EXCEPTION 'STOP: privilegios efetivos excessivos; revisar grants PUBLIC';
  END IF;
END $postcheck$;
COMMIT;
