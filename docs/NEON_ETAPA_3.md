# Etapa 3 — APIs financeiras protegidas e preparação da persistência

## Situação da entrega

Base: `main`, após os merges das PRs #11 e #12. Esta etapa reutiliza o driver Neon, as transações com contexto de organização, os contratos `DatasetRepository`/`ProposalRepository`, os adaptadores PostgreSQL e o esquema financeiro existentes.

**A persistência da interface continua em IndexedDB.** Nenhum seletor de repositório, layout, gráfico, KPI, filtro ou fórmula do frontend foi alterado. As novas APIs estão **desabilitadas por padrão** e **sempre bloqueadas em Production** nesta etapa. Definir apenas `DATABASE_URL` não as habilita.

**A integração operacional com Neon ainda não está concluída.** Houve persistência e releitura confirmadas somente em PostgreSQL embarcado descartável (PGlite), com dados sintéticos. Não houve consulta real ao Neon nesta etapa, migração remota, importação de dados reais, configuração de Production, merge, deploy manual ou nova tentativa de bypass da Vercel.

## O que faltava e o que foi preparado

| Área | Antes | Nesta entrega |
|---|---|---|
| Identidade | Gate padrão negava tudo | Validação criptográfica JWT RS256 contra JWKS de provedor externo configurado no servidor |
| Autorização | Interface de gate e RLS por organização | Vínculos por emissor + subject + organização, permissões específicas, validade e revogação no PostgreSQL |
| Operações remotas | Adaptadores sem rotas financeiras | Rota privada com validação, importação/ativação atômicas, consulta, versões, revisões e propostas em rascunho |
| Concorrência | Escritas sem precondição HTTP | Revisão global por organização, ETag e If-Match obrigatórios para mutações persistentes |
| Provisionamento | Sem vínculo operacional de identidade | Papel administrativo separado, sem login, RLS e auditoria de alterações de acesso; sem API de administração de usuários |
| Testes | Adaptadores e esquema em PGlite | Testes de identidade, HTTP e SQL real no motor descartável; nenhuma dependência de banco remoto |

Os contratos anteriores foram preservados. `PostgresDatasetRepository` ganhou métodos adicionais para operações específicas da API. `save`, `load`, `clear` e `history` continuam disponíveis; `clear` desativa a posição e preserva o histórico. A futura implementação do cliente remoto poderá continuar atendendo aos mesmos contratos.

## Autenticação e autorização

Não foi criado formulário de login, usuário padrão, senha administrativa, chave financeira compartilhada ou token assinado pela própria aplicação. O provedor real de identidade ainda precisa ser definido/configurado pelo responsável. A API consome **access tokens destinados a esta API**, emitidos após autenticação pelo provedor.

Configuração exclusivamente de servidor:

| Variável | Uso |
|---|---|
| `FINANCIAL_API_ENABLED` | Deve ser exatamente `true` para habilitar as rotas em Preview/Development; exemplo permanece `false` |
| `VERCEL_ENV` | Variável de sistema: somente `preview` ou `development`; Production retorna 404 incondicionalmente |
| `FINANCIAL_AUTH_ISSUER` | Emissor HTTPS exato e confiável, validado contra `iss` |
| `FINANCIAL_AUTH_AUDIENCE` | Identificador dedicado da API financeira, validado contra `aud`; não usar o identificador de um cliente de login para aceitar ID tokens |
| `FINANCIAL_AUTH_JWKS_URL` | Endpoint HTTPS fixo de chaves públicas do provedor; não derivado do token ou de parâmetros HTTP |
| `DATABASE_URL` | Conexão de servidor, com TLS, já preparada na Etapa 1 |

O backend aceita exclusivamente RS256 e exige `exp`, `iat`, `sub`, `iss` e `aud`; valida expiração, `nbf` quando presente e emissão não futura, com tolerância de relógio de cinco segundos. URLs de chave indicadas em `jku`/`x5u` não são aceitas. Tokens inválidos, assinaturas indevidas e algoritmos alternativos retornam 401. A resolução JWKS tem timeout e cache gerenciado pelo `jose`, compartilhado entre requisições do mesmo handler.

`Authorization: Bearer <access-token>` é a única fonte de identidade. Cookies, e-mail informado, headers de usuário, claims de administrador, claims de organização e a chave do diagnóstico Neon **não** concedem acesso financeiro. Nenhum endpoint deste módulo emite tokens ou configura CORS para origens externas. O futuro cliente deverá operar na mesma origem ou exigir uma revisão explícita de CORS.

A organização é selecionada em `X-Workspace-Id`, mas isso sozinho não autoriza nada. O backend verifica no banco o vínculo exato `(workspace_id, issuer, subject)` e a permissão exigida. Repete a verificação **na mesma transação** de cada operação financeira. Vínculos revogados, expirados, ausentes ou sem a permissão retornam 403. O autor de eventos financeiros é a identidade canônica JSON `[issuer, subject]`, evitando colisões entre provedores; esse identificador deve caber nos 300 caracteres do contrato existente.

Permissões disponíveis: `datasets:read`, `datasets:write`, `credit:read`, `credit:write`. Não são concedidas implicitamente umas pelas outras. Um importador que também consulta a posição deve ter `datasets:read` e `datasets:write`. Propostas continuam exclusivamente em `draft`; nem mesmo `credit:write` permite aprovar políticas, limites ou crédito.

A proteção de deployments da Vercel é uma camada anterior e independente. Autenticar na Vercel não substitui o access token financeiro e o vínculo no banco. Esta etapa não tenta contornar ou testar essa proteção.

## Provisionamento administrativo e migração versionada

`0003_financial_access.sql` acrescenta:

- `identity_memberships`, com permissões, revogação, expiração, responsável informado e data de provisionamento;
- `workspace_state`, com revisão para controle de concorrência;
- funções de verificação de permissão, avanço de revisão e existência da versão;
- papel `biosaude_membership_admin` **NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB**;
- políticas de RLS e trigger de auditoria para inclusão, alteração e exclusão de vínculos.

O runtime recebe somente leitura dos vínculos. Mesmo com privilégios de tabela excessivos nos testes, RLS impede sua autopromoção. O papel de provisionamento pode gerir vínculos da organização selecionada e acrescentar auditoria, mas não recebe leitura das tabelas financeiras. Não é atribuído automaticamente a nenhum login, ao usuário da aplicação ou a usuários de dashboard. `provisioned_by` registra o responsável informado; a auditoria registra adicionalmente o `session_user` real do banco e os estados anterior/posterior do vínculo.

A execução futura da migração exige conta administrativa capaz de criar esse papel. Antes de aplicar, revisar existência do papel, privilégios do provedor e separação dos usuários de banco. O procedimento de associação do papel a um responsável deverá ser aprovado pelo administrador fora do runtime. **Não há endpoint público nem comando automático de bootstrap de administrador.** Nos testes, os privilégios e os dados de bootstrap existem apenas no banco descartável.

O usuário SQL da aplicação deverá ser separado do proprietário/migrador, sem superusuário e sem BYPASSRLS, com permissões estritamente necessárias nas tabelas existentes, `SELECT` em `identity_memberships`, acesso a `workspace_state` e `EXECUTE` nas três funções de serviço. Estas funções usam SECURITY INVOKER; suas permissões de execução públicas foram revogadas. Não conceder ao runtime o papel de provisionamento, propriedade do esquema ou capacidade de alterar RLS. A validação dessas concessões no Neon é uma pendência de ativação, não uma operação desta PR.

## Contrato HTTP preparado

Entrada única em `api/financial/[operation].ts`. Todas as operações abaixo exigem Bearer verificado e `X-Workspace-Id` autorizado. Corpos usam `Content-Type: application/json`.

| Método e caminho | Permissão | Comportamento |
|---|---|---|
| `GET /api/financial/active` | datasets:read | Posição ativa ou `dataset: null`, com ETag |
| `POST /api/financial/validate` | datasets:write | Normaliza e valida entrada em memória; retorna `valid`, quantidade e issues; não persiste nem exige If-Match |
| `POST /api/financial/imports` | datasets:write | Valida novamente e grava/ativa uma nova versão atomicamente; exige `confirm: true` e If-Match |
| `GET /api/financial/versions?limit=20&offset=0` | datasets:read | Histórico paginado de metadados, posição ativa e quantidade de registros; limite máximo 100 |
| `GET /api/financial/version?versionId=…` | datasets:read | Dataset completo de uma única versão da organização |
| `PUT /api/financial/active` | datasets:write | Ativa versão já existente; corpo `{ "versionId": "…" }` |
| `DELETE /api/financial/active` | datasets:write | Desativa somente a posição; não apaga versões, títulos, recebimentos ou auditoria |
| `PATCH /api/financial/reviews` | datasets:write | Substitui notas de auditoria da versão, sem trocar posição ativa ou regravar finanças |
| `GET /api/financial/proposals` | credit:read | Lista propostas de política em rascunho |
| `POST /api/financial/proposals` | credit:write | Acrescenta proposta em rascunho, usando o contrato existente |

Importação/validação recebe `{ source, mappings, reference, filename, confirm }`: `source` e `mappings` são as estruturas existentes do importador Excel. Não é um upload multipart de XLSX. **Não aceita `records`, saldos ou totais previamente calculados pelo cliente.** O backend reutiliza `normalize` e valida o resultado. A importação com qualquer issue de severidade `error` é rejeitada com 422; advertências são preservadas. Categorias `upcoming`, `overdue` e `received`, centavos, datas, linhas de origem e distinção entre saldo aberto e recebido permanecem os mesmos do projeto.

Há limites explícitos: JSON de entrada e dataset normalizado de até 3.000.000 bytes, até 20 abas, 500 colunas, 250.000 células/nós de célula e profundidade 8. Estes limites pertencem à API; o importador local não foi alterado. Cargas maiores exigem uma solução revisada de transporte/staging antes da troca de armazenamento. Datasets antigos que excedam os limites de resposta da plataforma também precisam de estratégia de transporte. Os testes desta etapa não validam uma transferência de grande volume pela Vercel.

Revisões recebem `{ "versionId": "…", "reviews": { "id-da-issue": "Justificativa" } }`. O mapa substitui o anterior; mapa vazio remove as notas, mantendo o histórico auditável. Datas de revisão vêm do servidor. Não aceita modificações de valores financeiros. Correção de dados financeiros requer uma nova importação/versionamento.

## Concorrência, histórico e respostas

Leituras persistentes retornam `ETag: "N"`, onde N é a revisão atual da organização, obtida na mesma transação da leitura. Toda mutação persistente requer `If-Match: "N"`. O avanço da revisão, as alterações e a auditoria são atômicos. Omissão/valor inválido resulta em 428; revisão antiga ou conflito de serialização resulta em 409. Nenhuma falha deixa revisão avançada ou lote parcialmente aplicado. O cliente deve reler a posição e revisar a intenção do usuário; não repetir automaticamente POSTs.

Uma nova importação grava somente a posição da referência informada e seus recebimentos de origem. Ativar uma versão anterior apenas troca o ponteiro; não soma posições históricas. A consulta histórica usa ordenação determinística por data de importação e ID. A paginação por offset deve ser reiniciada se o ETag mudar durante a leitura, evitando combinações de páginas de revisões distintas.

As respostas não permitem cache de navegador/CDN e variam por autorização/organização. Nenhum token, URI, host de banco, erro SQL ou exceção bruta é registrado ou retornado. Falhas inesperadas são `503 FINANCIAL_API_UNAVAILABLE`; nenhum diagnóstico de conexão implícito é exposto. `/api/health` e o diagnóstico da Etapa 2 permanecem intactos; o health continua informando o estado do dashboard local.

O adaptador de propostas também passou a conservar milissegundos quando o driver retorna `Date`, corrigindo uma perda de precisão detectada pelo round-trip de teste. Não há alteração de fórmula ou política de crédito.

## Testes executados

- **14 testes novos** de identidade/API/PostgreSQL descartável aprovados, incluídos na suíte abaixo: assinaturas RSA reais com chaves exclusivamente sintéticas; rejeição de assinatura, emissor, audience, algoritmo, ausência de expiração, expiração e nbf indevidos; API desabilitada/Production; acesso HTTP; isolamento entre organizações; permissões; revogação antes da gravação; importação/validação; centavos e categorias; histórico e revisão; conflito de dois escritores; rollback; propostas somente em rascunho; papel administrativo sem login e auditoria de provisionamento.
- **96 testes de serviços aprovados; 8 ignorados**, todos os ignorados dependem das planilhas reais externas.
- **84 testes de navegador aprovados; 24 ignorados**, os ignorados dependem de dados reais. Regressão em desktop, notebook, tablet e celular, com IndexedDB e somente fixtures sintéticas.
- **180 testes distintos aprovados**. Os 14 novos foram executados isoladamente e na suíte completa, sem contagem duplicada.
- Typecheck de frontend/servidor e build com inspeção do bundle público aprovados. O build mantém o aviso preexistente de chunks grandes.

Comandos executados sem as variáveis de planilhas reais:

```bash
npm run test:financial-api
npm run typecheck
env -u BIOSAUDE_TEST_WORKBOOK -u BIOSAUDE_UPDATED_WORKBOOK npm run test:unit
env -u BIOSAUDE_TEST_WORKBOOK -u BIOSAUDE_UPDATED_WORKBOOK \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

`test:e2e` inclui o build e a inspeção do bundle. O teste PostgreSQL usa PGlite **em memória**, com migrações aplicadas somente nessa instância, RLS e papel SQL não privilegiado. Não usa `DATABASE_URL` do ambiente, disco de produção, Neon ou conexão TCP. O transporte remoto Neon e o provedor real JWKS ainda precisam de validação em ambiente autorizado; não são comprovados pelo teste embarcado. Os testes não requerem nem imprimem credenciais reais.

## Pendências para ativação futura

1. Definir o provedor de identidade real e registrar a API com audience dedicada, política de autenticação e access tokens RS256. Configurar emissor/JWKS no servidor por canal seguro e validar usuários reais autorizados. Não houve alteração dessas configurações nesta entrega.
2. Confirmar a conexão real ao Neon de desenvolvimento pelo procedimento autorizado, sem repetir as tentativas de bypass já rejeitadas. A relação entre proteção Vercel, URL e credencial existente precisa estar resolvida pelo administrador.
3. Revisar/aprovar migrações e concessões SQL, aplicá-las posteriormente somente na branch de desenvolvimento autorizada e provisionar os vínculos mínimos com conta administrativa separada, de forma auditada. Não usar o papel proprietário/BYPASSRLS no runtime.
4. Habilitar a feature flag somente no Preview/Development autorizado e executar testes remotos com dados sintéticos: importação, releitura, histórico, concorrência, revogação, isolamento e transporte de volumes compatíveis. Persistência real só estará confirmada após essa validação.
5. Implementar/revisar o cliente HTTP que cumpre os contratos de repositório, integrado ao login real, ETag/If-Match, paginação, tratamento de 401/403/409/413 e expiração de token. O frontend atual não possui esse cliente nem troca automática de backend. O envio usa as estruturas `source`/`mappings` já existentes; nenhum saldo local será sincronizado sem ação explícita de usuário autorizado.
6. Validar integralmente a experiência remota antes de selecionar o novo adaptador na interface. Planejar a transferência explícita das versões locais necessárias e a estratégia para bases grandes. IndexedDB continua ativo durante todo esse processo. Habilitar Production exigirá outra mudança revisada: não basta ligar a variável nesta versão.

## Arquivos desta entrega

- `api/financial/[operation].ts`: entrada das APIs privadas.
- `server/financial/handler.ts`, `import-input.ts`: roteamento, controles HTTP, validação e normalização existentes no servidor.
- `server/security/identity.ts`, `financial-context.ts`: verificação JWT, vínculo e autorização transacional.
- `server/persistence/postgres-datasets.ts`: operações de versão, metadados, ativação e revisões, preservando contrato anterior.
- `server/persistence/postgres-proposals.ts`: preservação de milissegundos no retorno de propostas.
- `server/db/client.ts`: mapeamento sanitizado de conflitos, acesso negado e versão ausente.
- `migrations/0003_financial_access.sql`: definição versionada da autorização e concorrência; sem aplicação remota.
- `.env.example`, `package.json`, `package-lock.json`: nomes de configuração, dependência `jose` e comando de testes; nenhuma credencial.
- `tests/financial-api.test.ts`, `tests/neon-config.test.ts`: testes novos e expectativa atualizada das três migrações.
- `README.md`, este documento: operação, evidências e pendências.
