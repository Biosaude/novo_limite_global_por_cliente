# Fase de conversao de dados legados: desenho e criterios de bloqueio

**Estado:** diagnostico/planejamento versionado; nenhuma gravacao no Neon; nenhuma ativacao na Vercel. Para a PR #21, ver `docs/PLANO_MIGRACAO_PRODUCTION_NEON.md`.

## Base factual trazida da homologacao
- `public.lg_publications`: 1; `public.lg_financial_records`: 5.099; `public.lg_audit_issues`: 2.376.
- Total de valor em aberto `upcoming` R$ 25.711.247,24; `overdue` R$ 10.575.015,21. `received_amount` R$ 56.999.819,30.
- 2.375 alertas possuem correspondencia unica apos normalizacao de abas, nenhum vinculo ambiguo; `CLIENT_NAME_ONLY` tem linha/aba sem correspondencia e deve ser preservado sem vinculo inventado.
- O total de recebido excede soma de `invoice_amount-discount_amount` em R$ 972,00, concentrado em 8 lancamentos (1 de R$ 720,00; 7 de R$ 36,00). Razao contabil ainda nao confirmada; NUNCA ajustar valores para forcar igualdade.
- Migrações 0001-0003 aplicadas manualmente **somente** na branch `homologacao-migracao-limite-global-20261113`; consulta relatou RLS ligado/forcado nas 20 tabelas do esquema (excluindo `schema_migrations`). O processo de versionamento/hashes aplicados nao foi certificado.

## Bloqueio tecnico fundamental
O aplicativo nao carrega apenas `biosaude.financial_records`; sua leitura ativa faz JOIN de `biosaude.active_datasets`, `biosaude.import_versions.dataset_payload` e `biosaude.dataset_state`, depois valida um objeto `Dataset`.
`Dataset` exige `version:1`, `id`, `filename`, `importedAt`, `reference`, `source.sheets` (celulas/linhas de origem), `mappings` (cabecalho/campos), `records`, `issues` e `reviews`. Os dados legados contem `raw_record`, mas **nao existe prova** de que guardem o workbook completo e o mapeamento exato do importador.
**Proibido** fabricar `source.sheets` ou `mappings` falsos, inventar data de importacao, nomes de abas, reduzir dados originais ou marcar alertas resolvidos. `dataset_payload` incoerente pode passar no banco mas quebrar no frontend.

## Decisoes para implementacao
1. Executar `scripts/neon-legacy-conversion-readiness.sql` somente em homologacao, registrar retorno completo do inventario sem dados pessoais.
2. Verificar se a planilha original publicada esta disponivel e se o importador vigente consegue reproduzir categorias, 5.099 IDs/linhas, 2.376 alertas e todos os somatorios (por centavo), sem descartar `raw_record`. Se planilha ou regras originais nao estiverem disponiveis, declarar bloqueio para conversao compativel com o aplicativo; **nao** preencher payload de fachada.
3. Verificar no frontend como classificacao dos recebidos, titulo/cliente, chaves e data de referencia sao construidos. Mapeamento proposto: `a_vencer` => `upcoming` com `open_amount`; `vencido` => `overdue` com `open_amount`; `recebido` => `received` com `received_amount`. Usar inteiros em centavos, sem ponto flutuante como valor canonico.
4. Manter `public.lg_*` imutaveis. Caso reconstruir Dataset seja viavel, desenvolver conversor testavel que valide `validateDataset` e `financialSnapshot`, e utilize as escritas de `PostgresDatasetRepository.save` ou transacao equivalente com escopo/permissoes apropriadas. Nao executar script ad hoc de INSERT parcial.
5. Alertas `DAYS_MISMATCH` podem corresponder a calculos de dias do modelo novo; preservar os avisos originais e distinguir recalculo da auditoria historica. Preservar 1 alerta sem linha como evento/issue vinculado a versao, sem atribuicao forjada.
6. Antes de ativar dataset, validar total exato por categoria/centavos, contagens por aba, unicidade por registro, numero de alertas, integridade de referencia e historico; comparar decodificacao de versao com frontend real. Efetuar dry-run local descartavel com dados sinteticos e teste de tentativa de reimportacao. Testar de forma isolada na branch Neon de homologacao.
7. Checar roles/privilegios e authenticator. `biosaude_api_prod` tem privilegios excessivos e nao deve ser runtime. `biosaude_runtime_prod` ainda nao esta pronta para uso. Nao copiar identidades `neon_auth` implicitamente da branch desenvolvimento.
8. **Production bloqueada**: sem merge, DATABASE_URL de producao, mudanca das flags `FINANCIAL_PRODUCTION_ENABLED`/`FINANCIAL_API_ENABLED`, provisionamento de usuarios ou SQL fora da homologacao.

## Stop conditions
- Dados `Dataset.source`/`mappings` ausentes ou inconsistentes.
- Totais/contagens de legado e novo divergentes, registros multiplos para mesma chave, dados financeiros sintetizados, qualquer erro grave de RLS.
- Banco/branch selecionados incorretamente ou execucao sem backup.
- Ausencia de autoria e aprovacao explicita da promocao.

## Proximo artefato apos retorno do diagnostico
Desenvolver migrador unico com mapeamento validado e transacao atomica em branch isolada do codigo e Neon. Testar em banco descartavel antes de executar no clone.
