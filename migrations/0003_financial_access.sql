-- Etapa 3. Apenas versionada; aplicação nesta entrega somente em PostgreSQL descartável.
CREATE TABLE biosaude.identity_memberships (
 workspace_id uuid NOT NULL REFERENCES biosaude.workspaces(id),
 issuer text NOT NULL CHECK(length(issuer) BETWEEN 1 AND 500),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 300),
 permissions text[] NOT NULL DEFAULT '{}' CHECK(permissions <@ ARRAY['datasets:read','datasets:write','credit:read','credit:write']::text[]),
 revoked_at timestamptz, expires_at timestamptz,
 provisioned_by text NOT NULL CHECK(length(trim(provisioned_by))>0),
 provisioned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,issuer,subject)
);
ALTER TABLE biosaude.identity_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE biosaude.identity_memberships FORCE ROW LEVEL SECURITY;
-- Aplicação pode somente consultar vínculos. Nenhuma política permite autopromoção ou provisionamento.
CREATE POLICY membership_read ON biosaude.identity_memberships FOR SELECT
 USING(workspace_id = nullif(current_setting('biosaude.workspace_id',true),'')::uuid);
CREATE TABLE biosaude.workspace_state (
 workspace_id uuid PRIMARY KEY REFERENCES biosaude.workspaces(id),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
);
ALTER TABLE biosaude.workspace_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE biosaude.workspace_state FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_state_scope ON biosaude.workspace_state
 USING(workspace_id = nullif(current_setting('biosaude.workspace_id',true),'')::uuid)
 WITH CHECK(workspace_id = nullif(current_setting('biosaude.workspace_id',true),'')::uuid);
CREATE FUNCTION biosaude.require_permission(w uuid, i text, s text, p text) RETURNS boolean
 LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM biosaude.identity_memberships
   WHERE workspace_id=w AND issuer=i AND subject=s AND p=ANY(permissions)
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) THEN
  RAISE EXCEPTION 'access denied' USING ERRCODE='42501';
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION biosaude.advance_revision(w uuid, expected bigint) RETURNS bigint
 LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE next_revision bigint;
BEGIN
 INSERT INTO biosaude.workspace_state(workspace_id) VALUES(w) ON CONFLICT DO NOTHING;
 UPDATE biosaude.workspace_state SET revision=revision+1
   WHERE workspace_id=w AND revision=expected RETURNING revision INTO next_revision;
 IF next_revision IS NULL THEN
  RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001';
 END IF;
 RETURN next_revision;
END $$;
REVOKE ALL ON FUNCTION biosaude.require_permission(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION biosaude.advance_revision(uuid,bigint) FROM PUBLIC;
CREATE FUNCTION biosaude.require_version(w uuid, v text) RETURNS boolean
 LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM biosaude.import_versions WHERE workspace_id=w AND id=v) THEN
  RAISE EXCEPTION 'version not found' USING ERRCODE='P0002';
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION biosaude.require_version(uuid,text) FROM PUBLIC;
-- Papel de provisionamento separado, sem login e sem herança/atribuição automática ao runtime.
CREATE ROLE biosaude_membership_admin NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA biosaude TO biosaude_membership_admin;
GRANT SELECT,INSERT,UPDATE,DELETE ON biosaude.identity_memberships TO biosaude_membership_admin;
GRANT INSERT ON biosaude.audit_events TO biosaude_membership_admin;
CREATE POLICY membership_admin_write ON biosaude.identity_memberships TO biosaude_membership_admin
 USING(workspace_id = nullif(current_setting('biosaude.workspace_id',true),'')::uuid)
 WITH CHECK(workspace_id = nullif(current_setting('biosaude.workspace_id',true),'')::uuid);
CREATE FUNCTION biosaude.audit_membership_change() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE target_workspace uuid;
BEGIN
 target_workspace := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
 INSERT INTO biosaude.audit_events(workspace_id,actor_subject,action,metadata)
 VALUES(target_workspace,session_user,'identity.membership.' || lower(TG_OP),
   jsonb_build_object('before',CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
                      'after',CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END));
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER membership_audit AFTER INSERT OR UPDATE OR DELETE ON biosaude.identity_memberships
 FOR EACH ROW EXECUTE FUNCTION biosaude.audit_membership_change();
