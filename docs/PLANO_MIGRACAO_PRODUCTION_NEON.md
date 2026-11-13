# Plano de pré-migração: Limite Global — Neon Production
**Estado: PREPARADO; NÃO EXECUTADO NO NEON.** Este pacote não cria branches Neon, não aplica SQL de escrita, não modifica Vercel nem publica código.

## Constatações verificadas pelo usuário (não presumir a branch quando falta evidência)
- A interface Tables da branch `production` mostrou `public.lg_publications`, `public.lg_financial_records` e `public.lg_audit_issues`.
- A interface Tables da branch `desenvolvimento` mostrou `biosaude.*` e usuários em `neon_auth`.
- Uma consulta anterior exibiu 21 tabelas `biosaude`, 5 versões e 1 base ativa, declarada como feita em Production, **mas** consultas posteriores em Production retornaram esquema ausente. Há contradição de seleção de branch/conexão: não tratar a primeira contagem como prova de conteúdo em Production.
- A role `biosaude_api_prod` criada pelo painel herdou `neon_superuser`: **não utilizá-la como DATABASE_URL**. Revogação falhou por falta de ADMIN OPTION; não insistir. A role `biosaude_runtime_prod` foi criada com login e sem BYPASSRLS/CREATEDB/CREATEROLE; **ainda não tem senha/grants testados**, não a utilizar ainda.
- A Vercel Production tem `FINANCIAL_PRODUCTION_ENABLED=false` e `FINANCIAL_API_ENABLED=false`. Manter assim até aprovação de migração e autorização.

## Fase 0: inventário, somente leitura
1. Neon Console: selecionar o projeto correto, branch `production`, database `neondb`, SQL Editor. Executar `scripts/neon-production-preflight.sql`. Guardar retorno sem e-mails, credenciais ou dados pessoais.
2. Repetir na branch `desenvolvimento`, mesmo banco, guardando saída com rótulo inequívoco da branch (não o compute `Primário`).
3. Conferir schemas, políticas de RLS, existência das tabelas antigas e novas. Se discrepância persistir, **PARAR**: não conceder GRANT nem migrar.
4. Fazer inventário de versões, contagens e valores em fonte apropriada após confirmar o schema. Não copiar tabelas por `SELECT *`, pois envolvem dados financeiros e pessoais.

## Fase 1: cópia isolada da Production (sem intervenção na principal)
1. Neon → Branches → **Create branch** → parent **production** → nome sugerido `homologacao-migracao-limite-global-20261113`.
2. Confirmar na interface a branch-filha e que `public.lg_*` existe nessa cópia.
3. Se necessário, criar também snapshot/back-up da branch `production` antes de qualquer DDL. Não confundir branch `backup-pre-migracao-biosaude` (parent = desenvolvimento) com backup de Production.
4. **Nunca** selecionar `production` para aplicar migrações nesse estágio.

## Fase 2: plano de migração em cópia
- Comparar resultados do inventário com `migrations/0001_financial_foundation.sql`, `0002_security_and_immutability.sql`, `0003_financial_access.sql`.
- Confirmar que o esquema alvo não existe antes de rodar `0001`; se já existir, NÃO executar CREATE SCHEMA. Verificar `biosaude.schema_migrations`, checksums e divergências primeiro.
- Confirmar em cópia de teste que RLS FORCE, constraints, funções e triggers não afetam `public.lg_*`; nunca usar `DROP SCHEMA public`, `CASCADE`, `TRUNCATE`, `DELETE` ou `RESET ROLE` como forma de migrar dados.
- **Dados:** definir se haverá conversão dos dados legados `public.lg_*` para `biosaude`, em vez de assumir equivalência entre os modelos. Essas estruturas não são isomórficas: `lg_publications` e registros associados não são `import_versions`/dataset_json. Qualquer conversão necessita mapeamento documentado e reconciliação por centavos, quantidade, origem, categorias, versões, datas e auditoria. Não fazer importação cega nem sobrescrever versão ativa.
- **Identidades:** `neon_auth` no desenvolvimento não garante usuários na Production. Planejar provisionamento de identidades e vínculos `identity_memberships` apenas depois da escolha da instância de Auth de Production.
- **Role:** GRANT restritos somente no clone, incluindo EXECUTE de funções necessárias, e testar RLS com usuário de aplicação; nunca usar `neon_superuser` no runtime. Rever segurança antes de aplicar em produção.
- Repetir homologação de autenticação, dados, conciliação, importação e rollback no clone. Guardar relatório de contagens e somatórios.

## Fase 3: autorização
Só após provas de snapshot íntegro, teste do clone, reconciliação de dados e plano de rollback poderá ser submetida proposta explícita de promoção. Nenhuma flag Production deve ser alterada, PR mesclada ou Preview promovido de forma automática.

**Bloqueador atual:** sem credenciais administrativas conectadas ao Neon neste ambiente, não há como executar uma cópia Neon ou ler os dados reais automaticamente. O primeiro ato humano seguro é executar o inventário somente leitura e criar a cópia da branch Production pelo Console.
