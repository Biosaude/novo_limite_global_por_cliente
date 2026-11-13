-- INVENTARIO PRE-CONVERSAO LEGACY -> BIOSAUDE (SOMENTE LEITURA)
-- Execute EXCLUSIVAMENTE em homologacao-migracao-limite-global-20261113 / neondb.
-- Nao faz INSERT/UPDATE/DELETE, nao altera configuracoes, e nao imprime dados pessoais.
-- Antes de executar, CONFIRME a branch no Neon Console (o SQL nao a identifica).
WITH
 p AS (
   SELECT count(*)::bigint n,
     count(*) FILTER (WHERE status IS NULL)::bigint status_nulo,
     count(*) FILTER (WHERE reference_date IS NULL)::bigint referencia_nula,
     count(*) FILTER (WHERE source_filename IS NULL OR btrim(source_filename)='')::bigint arquivo_ausente
   FROM public.lg_publications
 ),
 f AS (
   SELECT count(*)::bigint n,
     count(DISTINCT (publication_id,source_sheet,source_row))::bigint chaves_origem_distintas,
     count(*) FILTER (WHERE publication_id IS NULL OR source_sheet IS NULL OR source_row IS NULL)::bigint origens_nulas,
     count(*) FILTER (WHERE client_key IS NULL OR title_key IS NULL OR raw_record IS NULL)::bigint informacao_incompleta,
     count(*) FILTER (WHERE accounting_band NOT IN ('upcoming','overdue','received') OR accounting_band IS NULL)::bigint categorias_invalidas,
     count(*) FILTER (WHERE accounting_band='received' AND received_amount IS NULL)::bigint recebidos_sem_valor,
     count(*) FILTER (WHERE accounting_band IN ('upcoming','overdue') AND open_amount IS NULL)::bigint abertos_sem_valor,
     count(*) FILTER (WHERE accounting_band='received' AND received_at IS NULL)::bigint recebidos_sem_data,
     count(*) FILTER (WHERE publication_id NOT IN (SELECT id FROM public.lg_publications))::bigint financeiro_sem_publicacao
   FROM public.lg_financial_records
 ),
 a AS (
   SELECT count(*)::bigint n,
     count(*) FILTER (WHERE publication_id NOT IN (SELECT id FROM public.lg_publications))::bigint auditoria_sem_publicacao,
     count(*) FILTER (WHERE source_sheet IS NULL OR source_row IS NULL)::bigint auditoria_sem_origem
   FROM public.lg_audit_issues
 ),
 b AS (
   SELECT
     (SELECT count(*) FROM biosaude.import_versions)::bigint versoes_destino,
     (SELECT count(*) FROM biosaude.financial_records)::bigint registros_destino,
     (SELECT count(*) FROM biosaude.audit_issues)::bigint alertas_destino,
     (SELECT count(*) FROM biosaude.workspaces)::bigint workspaces_destino
 )
SELECT p.n AS publicacoes, p.status_nulo, p.referencia_nula, p.arquivo_ausente,
 f.n AS registros, f.chaves_origem_distintas, f.origens_nulas, f.informacao_incompleta,
 f.categorias_invalidas, f.recebidos_sem_valor, f.abertos_sem_valor, f.recebidos_sem_data,
 f.financeiro_sem_publicacao,
 a.n AS alertas, a.auditoria_sem_publicacao, a.auditoria_sem_origem,
 b.versoes_destino, b.registros_destino, b.alertas_destino, b.workspaces_destino
FROM p CROSS JOIN f CROSS JOIN a CROSS JOIN b;

-- Distribuicao de publicacoes, somente status e somatorios; sem UUIDs, nomes ou documentos.
SELECT p.status, p.reference_date, count(*)::bigint AS publicacoes
FROM public.lg_publications p
GROUP BY p.status, p.reference_date
ORDER BY p.reference_date, p.status;

-- Diagnostico de tipos das celulas RAW originais, sem expor conteudo de documentos.
SELECT jsonb_typeof(raw_record) AS tipo_raw,
       count(*)::bigint AS linhas
FROM public.lg_financial_records
GROUP BY jsonb_typeof(raw_record)
ORDER BY linhas DESC;

-- Chaves JSON mais frequentes em RAW, SOMENTE NOMES DAS CHAVES; nenhuma informacao pessoal.
SELECT key AS chave_raw, count(*)::bigint AS ocorrencias
FROM public.lg_financial_records f
CROSS JOIN LATERAL jsonb_object_keys(
 CASE WHEN jsonb_typeof(f.raw_record)='object' THEN f.raw_record ELSE '{}'::jsonb END
) AS raw_keys(key)
GROUP BY key
ORDER BY ocorrencias DESC, chave_raw
LIMIT 40;
