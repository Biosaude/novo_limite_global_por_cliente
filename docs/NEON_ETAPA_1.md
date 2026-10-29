# Etapa 1 — Preparação do Neon PostgreSQL

## Situação da entrega

A persistência ativa do dashboard continua local: memória e IndexedDB, com os mesmos contratos e comportamento. Definir `DATABASE_URL` **não** troca o repositório, não envia dados, não aplica migrações e não libera endpoints financeiros.

A preparação é independente da PR de Gestão da Inadimplência e parte da `main` `b6a2b103`. O esquema inclui estruturas para o acompanhamento operacional futuro, sem importar ou remover funcionalidades daquela PR.

## Arquitetura preparada

| Camada | Implementação |
|---|---|
| Interface ativa | React/Vite existente; layout, filtros, gráficos, KPIs e fórmulas não alterados |
| Porta de persistência | `src/persistencia/contracts.ts`: `DatasetRepository` e `ProposalRepository`, sem dependências de navegador/servidor |
| IndexedDB | `src/persistencia/repository.ts` mantém a implementação e reexporta os mesmos contratos |
| Configuração | `server/config.ts`: leitura exclusiva de `DATABASE_URL` no servidor, validação de protocolo/TLS e diagnósticos sem valores |
| Driver | `@neondatabase/serverless`, via HTTP transacional; inicialização preguiçosa, sem conexão no import |
| Autorização | `server/security/authorization.ts`: nega tudo por padrão; implementação autenticada ainda necessária |
| Adaptadores SQL | `server/persistence/postgres-datasets.ts` e `postgres-proposals.ts`: portas compatíveis, transações parametrizadas e escopo de organização |
| API | Apenas `api/health.ts`: saúde técnica estática, sem dados financeiros ou acesso ao banco |
| Migrações | Dois arquivos SQL versionados e plano offline com SHA-256; nenhum comando de aplicação automática |
| Fronteira cliente/servidor | Plugin Vite bloqueia módulos de servidor/driver no bundle; auditoria adicional da saída de produção |

A rota técnica responde a GET/HEAD com `status: ok`, `persistence: local`, `financialApi: disabled`. Outros métodos recebem 405. Essa resposta não afirma que o banco está conectado, disponível ou migrado. O servidor de desenvolvimento Vite continua servindo o frontend; a função é testada diretamente e será executada pelo runtime de funções da hospedagem apenas numa etapa autorizada de implantação.

Não existem rotas HTTP de leitura/escrita financeira nesta entrega. Os adaptadores também negam operações sem um `AuthorizationGate` válido, antes de ler configuração ou abrir o driver. Não foi implementado login fictício, token compartilhado ou opção para desligar autenticação.

## Configuração sem credenciais versionadas

`.env.example` contém somente `DATABASE_URL=` vazio e orientações. `.env` e demais variações continuam ignoradas; somente o exemplo é liberado pelo `.gitignore`.

Procedimento local futuro:

1. Copie `.env.example` para `.env` em ambiente autorizado.
2. Configure a URL do banco existente pelo canal seguro do provedor. Não envie senha/URL por chat, PR, logs ou capturas.
3. Use uma URL PostgreSQL com TLS obrigatório (`sslmode=require`, `verify-ca` ou `verify-full`).
4. Execute `npm run db:check`.

A verificação usa Node com `--env-file-if-exists=.env`. Ela **não** conecta ao banco. Retorna apenas código/status; sai com código 1 se a configuração está ausente/inválida. Uma configuração válida retorna `CONFIGURATION_VALID_NOT_CONNECTED`, nunca confirmação de conectividade. A variável não é lida pelo frontend; uma variável pública `VITE_DATABASE_URL` é explicitamente rejeitada pelo build e pela configuração do servidor.

Na hospedagem futura, `DATABASE_URL` deve ser configurada somente para o runtime do servidor, separando ambientes de teste e produção. Nenhuma variável real foi criada ou alterada nesta entrega, e nenhum projeto Neon foi criado.

## Modelo relacional

`0001_financial_foundation.sql` prepara o schema `biosaude` com:

- `schema_migrations`: versão, checksum e data de aplicação futura.
- `workspaces`: fronteira de isolamento de dados.
- `import_versions`: posição, origem, assinatura e snapshot original imutável.
- `dataset_state` e `active_datasets`: revisão atual de anotações e ponteiro de utilização; desativar não exclui histórico.
- `clients`, `financial_titles`, `import_titles`: identificação e associação explícita de títulos às posições.
- `financial_records`: lançamentos por categoria, valores em centavos, datas, representante e aba/linha de origem.
- `receipt_entries`: datas dos recebimentos, referenciando exclusivamente lançamentos da categoria Recebido.
- `delinquency_positions`: referências exclusivas à categoria Vencidos.
- `credit_proposals`: propostas em rascunho; não há aprovação automática de política/limite.
- `audit_issues`, `audit_events` e `audit_review_history`: advertências originais, eventos e revisões das justificativas, sem sobrescrever o histórico.
- `collection_actions`: etapas e ações versionadas por título/posição.
- `legal_processes`, `process_revisions`, `process_title_links`: procedimentos judiciais/administrativos, revisões e vínculos documentais múltiplos.

O valor financeiro de `financial_records.amount_cents` conserva a semântica da categoria: saldo aberto para A Vencer/Vencidos ou valor efetivamente recebido para Recebido. Não é o nominal da duplicata. Os recebimentos não são novamente somados à exposição, não há baixa automática por etapa e o valor da causa não altera a dívida.

`BIGINT` tem limites compatíveis com inteiros seguros JavaScript. Valores negativos e nulos auditáveis não são convertidos em zero pelo mapeamento. Não há funções SQL que substituam fórmulas de KPIs, aging, risco ou recuperação. A classificação financeira segue a aba original, inclusive divergências sinalizadas na auditoria; não há regra SQL que reclassifique vencimentos automaticamente.

Clientes são correspondidos somente por espaços/capitalização, sem aproximação. Títulos usam cliente + duplicata/parcela, ou título completo/linha quando necessário. A identificação sem CNPJ permanece marcada como ambígua. Os lançamentos mantêm seus identificadores de origem: pagamentos parciais e ocorrências em categorias diferentes não são eliminados por coincidência de título ou valor.

## Integridade e segurança no SQL

`0002_security_and_immutability.sql` habilita e força RLS nas tabelas de negócio, usando o contexto `biosaude.workspace_id`. Esse contexto é definido pelo servidor autorizado com `set_config(..., true)` **dentro de cada transação**, junto com as consultas. Não depende de sessão persistente ou de configuração que sobreviva ao pooling HTTP.

Chaves estrangeiras compostas impedem referências entre organizações e posições incompatíveis. Recebimentos e inadimplência exigem a categoria correspondente. Histórico de importações, lançamentos, propostas, ações, revisões de processos e auditoria rejeita UPDATE/DELETE. Reutilizar o identificador de uma importação para outro conteúdo financeiro aborta toda a transação. Revisões/justificativas são registradas separadamente e não mudam os campos financeiros originais; metadados derivados de dias/auditoria podem ser reavaliados sem trocar a identidade financeira.

Processos sem conciliação não criam vínculos por nome. Um vínculo exige fonte documental, órgão, evidência e responsável confirmado. A etapa Judicializado exige vínculo com revisão judicial documentada; procedimento administrativo não atende esse requisito. Vários processos podem compartilhar um título sem duplicar o lançamento financeiro.

RLS é defesa adicional, não substitui autenticação. Antes de ativar, a credencial de execução deve usar papel de mínimo privilégio, **sem SUPERUSER/BYPASSRLS e sem ser proprietária das tabelas**, separado da credencial de migração. O contexto da organização e o ator devem vir de sessão verificada e associação autorizada, nunca do corpo da requisição. Nenhum papel, usuário ou credencial foi criado no Neon. O papel de teste restrito existe apenas no PostgreSQL descartável dos testes.

## Migrações e plano offline

Execute `npm run db:plan` para listar versões/nomes/checksums, sem ler `DATABASE_URL` nem executar SQL. Não há `db:migrate`, aplicação de DDL em postinstall, build, startup, health check ou pipeline de deploy.

Os arquivos são forward-only e não incluem limpeza automática, DROP ou rollback destrutivo. Devem ser revisados contra o estado real do banco existente, com backup e plano de aplicação autorizados. `schema_migrations` está preparado para registrar hashes numa aplicação futura; o executor de migrações com controle de versões/lock ainda precisa ser implementado e revisado. Não foi feita introspecção do banco real nem afirmada compatibilidade com objetos preexistentes.

**Nenhuma migração foi executada no Neon.** Os testes aplicam o SQL apenas a instâncias temporárias em memória do PGlite, que executa PostgreSQL real em WASM sem servidor externo. O estado é descartado ao final.

## Compatibilidade e limites antes da ativação

O adaptador SQL preserva `load/save/clear/history`, snapshots e versões. O frontend ainda importa o `localRepository` original; não existe troca automática por variável de ambiente. O servidor oferece também `list/append` para propostas em rascunho. Não foram expostos serviços HTTP para esses adaptadores.

O snapshot de compatibilidade guarda o `Dataset` completo para não perder mapeamentos, origem e rastreabilidade. A planilha pode incluir pacientes/médicos em colunas brutas: **não habilitar upload real desse snapshot sem revisar minimização, necessidade, retenção, criptografia e acesso a dados pessoais**. Apenas dados sintéticos foram gravados no PostgreSQL de testes. Os arquivos oficiais foram lidos pelos testes já existentes de cálculo/navegador, sem upload ao servidor ou ao Neon.

A validação atual do adaptador é estrutural e de integridade transacional. A etapa de ingestão HTTP deve revalidar a planilha e a auditoria no servidor, sem confiar em objetos normalizados enviados pelo cliente. O limite interno de 32 MB do snapshot não significa que um endpoint de função aceite esse tamanho; upload em blocos/armazenamento de objetos, limites de transporte, tempo de execução e recuperação de falhas precisam ser definidos e testados antes de servir bases grandes.

Ainda faltam para ativar a conexão real e a persistência compartilhada:

1. Implementar autenticação de servidor, autorização por organização/operação e a auditoria do ator verificado.
2. Revisar o banco real e o papel de execução; aprovar e aplicar as migrações por processo autorizado, com registro de versões/checagem de hashes.
3. Configurar `DATABASE_URL` pelo canal seguro e realizar teste de conectividade real somente com autorização.
4. Implementar rotas financeiras autenticadas, validação de entrada/importação, limites e proteção das respostas.
5. Revisar a política dos dados brutos e implementar o transporte remoto que reutilizará `DatasetRepository`, com ativação explícita e manutenção do caminho local.
6. Validar dados/saldos, desempenho, concorrência, backups e permissões em ambiente de teste antes de produção.

## Testes executados

**Resultado: 75 testes de serviços e 108 testes de navegador aprovados (183 no total), sem falhas ou testes ignorados. TypeScript de frontend/servidor e build Vite aprovados.** Depois do refinamento do histórico de justificativas e da validação monetária, os 17 testes novos de backend foram repetidos e passaram. A fronteira também protege Web Workers; após esse ajuste, os quatro fluxos de importação/filtros nas resoluções de navegador foram repetidos e passaram.

`db:plan` foi executado offline com `executed: false`. `db:check`, com variáveis explicitamente vazias, retornou `DATABASE_URL_MISSING`, `connectionAttempted: false` e `migrationsExecuted: false`, com código de saída 1 esperado. A auditoria do bundle público passou sem configuração/driver de banco. Os testes existentes mantêm conciliação das planilhas oficiais, filtros, importação, histórico local, aging e exportações nas quatro resoluções.

As verificações em PGlite utilizaram um papel local restrito sem SUPERUSER/BYPASSRLS. Nenhuma URL real foi usada, nenhuma tentativa de conexão ao Neon foi feita e nenhum DDL foi enviado a produção.

Os testes novos usam URLs sintéticas `.invalid` com fábrica de driver injetada; não utilizam o valor real de `DATABASE_URL`, mesmo se existir no processo. Cobrem configuração/TLS, variável pública proibida, ausência de acesso antecipado à configuração/rede, autorização negada, escopo local por transação, erros sanitizados, saúde técnica, barreira de build, migrações reais em memória, RLS, atomicidade, compatibilidade dos repositórios, versões, revisões de auditoria, SQL parametrizado, categorias e preparação de vínculos judiciais.

Comandos de validação:

```bash
npm run typecheck
npm run db:plan
npm test
```

Para incluir as duas planilhas oficiais locais nos testes de regressão existentes:

```bash
BIOSAUDE_TEST_WORKBOOK='/caminho/Faturamento A Vencer, Vencido e Faturado.xlsx' \
BIOSAUDE_UPDATED_WORKBOOK='/caminho/Modelo_Base_Limite_Global_Biosaude.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

O build também executa `npm run check:client`, que inspeciona os artefatos públicos e não imprime conteúdo suspeito. As migrações e o driver não devem aparecer no bundle do navegador. Os testes de banco não precisam de Docker, rede ou senha.

## Arquivos criados/alterados

- `.env.example`, `.gitignore`: exemplo vazio e exceção segura de versionamento.
- `package.json`, `package-lock.json`: driver Neon, PGlite de testes, tipos Node e comandos.
- `api/health.ts`: única rota, estritamente técnica.
- `server/config.ts`, `server/errors.ts`, `server/db/client.ts`: configuração, conexão preguiçosa e falhas sanitizadas.
- `server/security/authorization.ts`: contrato autenticado futuro e negação padrão.
- `server/persistence/*`: codec e adaptadores dos contratos existentes.
- `migrations/0001_financial_foundation.sql`, `0002_security_and_immutability.sql`: esquema e integridade/RLS.
- `server/db/migration-plan.ts`, `scripts/check-database.ts`, `scripts/migration-plan.ts`: diagnósticos sem conexão/aplicação.
- `build/server-boundary.ts`, `vite.config.ts`, `scripts/check-client-bundle.ts`: proteção da fronteira do navegador.
- `tsconfig.server.json`: checagem separada do servidor.
- `src/persistencia/contracts.ts`, `repository.ts`: extração somente dos contratos; lógica IndexedDB preservada.
- `tests/neon-config.test.ts`, `neon-postgres.test.ts`: verificações sem produção.
- `README.md`, `VALIDACAO.md`, este documento: procedimento e evidências.

Nenhum layout, gráfico, filtro, KPI, fórmula financeira, dado existente, autenticação ou permissão do aplicativo ativo foi alterado. Não houve deploy, merge automático, acesso ao banco real ou criação de outro projeto Neon.
