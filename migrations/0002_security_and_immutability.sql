-- Escopo é definido pelo servidor autorizado, somente dentro da transação.
DO $$
DECLARE t text;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='biosaude' AND tablename NOT IN ('schema_migrations','workspaces') LOOP
  EXECUTE format('ALTER TABLE biosaude.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE biosaude.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY workspace_scope ON biosaude.%I USING (workspace_id = nullif(current_setting(''biosaude.workspace_id'',true),'''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''biosaude.workspace_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
ALTER TABLE biosaude.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE biosaude.workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_scope ON biosaude.workspaces USING(id=nullif(current_setting('biosaude.workspace_id',true),'')::uuid) WITH CHECK(id=nullif(current_setting('biosaude.workspace_id',true),'')::uuid);
CREATE FUNCTION biosaude.reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Versioned financial and audit history is append-only'; END $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['import_versions','import_titles','financial_records','receipt_entries','delinquency_positions','audit_issues','audit_events','audit_review_history','credit_proposals','collection_actions','process_revisions','process_title_links'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON biosaude.%I FOR EACH ROW EXECUTE FUNCTION biosaude.reject_history_change()',t);
 END LOOP;
END $$;
-- Impede reuso do identificador da importação para outra posição/conteúdo.
CREATE FUNCTION biosaude.assert_import_content(w uuid,v text,h text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM biosaude.import_versions WHERE workspace_id=w AND id=v AND content_hash=h) THEN
  RAISE EXCEPTION 'Import version content mismatch';
 END IF;
END $$;
CREATE FUNCTION biosaude.require_link_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM biosaude.process_revisions p WHERE (p.workspace_id,p.process_id,p.revision)=(NEW.workspace_id,NEW.process_id,NEW.process_revision) AND length(trim(p.process_number))>0 AND length(trim(p.court))>0 AND length(trim(p.source))>0) THEN
  RAISE EXCEPTION 'Documented process source is required';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER documented_links BEFORE INSERT ON biosaude.process_title_links FOR EACH ROW EXECUTE FUNCTION biosaude.require_link_evidence();
CREATE FUNCTION biosaude.require_judicial_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.stage='Judicializado' AND NOT EXISTS(
  SELECT 1 FROM biosaude.process_title_links l JOIN biosaude.process_revisions p ON (p.workspace_id,p.process_id,p.revision)=(l.workspace_id,l.process_id,l.process_revision)
  WHERE (l.workspace_id,l.version_id,l.title_id)=(NEW.workspace_id,NEW.version_id,NEW.title_id) AND p.nature='judicial'
  AND p.revision=(SELECT max(p2.revision) FROM biosaude.process_revisions p2 WHERE (p2.workspace_id,p2.process_id)=(p.workspace_id,p.process_id))
 ) THEN RAISE EXCEPTION 'Confirmed judicial link is required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER judicial_stage_evidence BEFORE INSERT ON biosaude.collection_actions FOR EACH ROW EXECUTE FUNCTION biosaude.require_judicial_link();
