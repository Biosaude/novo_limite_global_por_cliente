-- SOMENTE LEITURA. Execute separadamente no SQL Editor de cada branch.
-- Nao altera tabelas, roles, RLS, usuarios ou dados financeiros.
-- Anote o nome da branch selecionada na interface Neon: SQL por si nao identifica branch.
SELECT current_database() AS banco, current_user AS usuario,
       current_setting('search_path') AS caminho_esquemas,
       to_regnamespace('biosaude') IS NOT NULL AS possui_biosaude,
       to_regnamespace('neon_auth') IS NOT NULL AS possui_neon_auth,
       to_regclass('public.lg_publications') IS NOT NULL AS possui_publicacoes_legadas,
       to_regclass('public.lg_financial_records') IS NOT NULL AS possui_registros_legados,
       to_regclass('public.lg_audit_issues') IS NOT NULL AS possui_auditoria_legada,
       to_regclass('biosaude.workspaces') IS NOT NULL AS possui_workspaces,
       to_regclass('biosaude.identity_memberships') IS NOT NULL AS possui_memberships,
       to_regclass('biosaude.import_versions') IS NOT NULL AS possui_versoes,
       to_regclass('biosaude.active_datasets') IS NOT NULL AS possui_ativos,
       to_regclass('biosaude.financial_records') IS NOT NULL AS possui_financeiro;

-- Inventario de estrutura por nome; nao retorna dados financeiros ou pessoais.
SELECT n.nspname AS esquema, c.relname AS objeto,
       CASE c.relkind WHEN 'r' THEN 'tabela'
         WHEN 'p' THEN 'tabela particionada' WHEN 'v' THEN 'view'
         ELSE c.relkind::text END AS tipo,
       c.relrowsecurity AS rls_ativo,
       c.relforcerowsecurity AS rls_forcado
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public','biosaude','neon_auth')
  AND c.relkind IN ('r','p','v')
  AND (n.nspname <> 'public' OR c.relname LIKE 'lg_%')
ORDER BY 1,2;

-- Checagem da role de runtime; nao atribui nem altera privilegios.
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolbypassrls, rolinherit
FROM pg_roles
WHERE rolname IN ('neondb_owner','biosaude_api_prod','biosaude_runtime_prod')
ORDER BY 1;
