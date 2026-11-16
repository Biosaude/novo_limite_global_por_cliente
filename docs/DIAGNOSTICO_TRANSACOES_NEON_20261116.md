# Transações Neon — investigação do 503 após o PR #26

## Base e limites da comprovação

Base auditada: `main` em `ed2538c`, incluindo o PR #26. SDK instalado:
`@neondatabase/serverless` **1.2.0**. Branch desta correção:
`fix/neon-transaction-errors-20261116`.

O usuário confirmou o funcionamento do login. O 503 informado corresponde à API
Financeira; não foi fornecido o status HTTP do serviço SQL Neon nem um SQLSTATE
separado. A presença da chamada externa não comprova sucesso da autenticação,
execução, commit ou decodificação da resposta. Não se atribuiu a falha a senha,
role, pooling, `DO` ou `Serializable` sem evidência.

**Causa confirmada no código:** tanto o diagnóstico quanto o tratamento de erros
consultavam somente `error.code`. Um SQLSTATE encapsulado em `sourceError`,
`cause` ou `AggregateError.errors` era perdido. Por exemplo, um `42501` encapsulado
produzia `DATABASE_OPERATION_FAILED`/503 em vez de `ACCESS_DENIED`/403; `40001`
perdia a resposta 409, `P0002` perdia 404 e `PBR01` perdia a categoria de runtime
inseguro. Códigos de rede encapsulados também não eram classificados corretamente.
Os testes novos falharam antes da correção e passaram depois.

**Limite:** não existe evidência de que o erro concreto de Production contenha
algum desses códigos. O defeito de classificação/mapeamento está confirmado e
corrigido; a causa do 503 remoto continua não comprovada. Não se declara resolvido
o incidente de Production com base em uma simulação de transporte.

## Implementação

- `server/db/diagnostics.ts`: percorre apenas propriedades de dados `code`,
  `sourceError`, `cause` e `errors`, com limite de profundidade, quantidade de nós
  e proteção contra ciclos. Não executa getters fornecidos pela exceção.
- SQLSTATEs conhecidos e códigos de DNS, conexão, TLS e timeout são convertidos
  exclusivamente em categorias de vocabulário fechado. Um código não reconhecido
  não é copiado ao log; mensagens e stacks nunca são analisadas para inferir códigos.
- `databaseErrorCode` compartilha a mesma extração com `server/db/client.ts`,
  preservando as respostas já previstas para permissão, conflito, versão ausente
  e runtime inseguro, mesmo quando a exceção está encapsulada.
- O formato público do diagnóstico permanece: `event`, `phase`, `category` e
  `sqlStateRecognized`. Não se registram SQL, parâmetros, host, URI, credenciais,
  mensagens brutas, identificadores de workspace ou dados financeiros.

Não houve alteração em Auth/JWT, interface, variáveis de ambiente, dependências,
guard SQL, RLS, FORCE RLS, grants ou isolamento transacional. `set_config` continua
local à transação, antes de `require_permission` e da consulta financeira no mesmo
lote. Nenhuma verificação foi removida ou adiada para depois da consulta.

## Compatibilidade examinada

O SDK usa `sql.query(text, params)` e `sql.transaction([...],
{ isolationLevel: "Serializable" })`; os parâmetros são enviados separadamente do
SQL. A implementação pública consultada do proxy Neon aceita o cabeçalho
`Serializable`, abre uma transação, executa as consultas sequencialmente e retorna
arrays de campos e linhas, inclusive arrays vazios para comandos sem resultado.

Referência pública auditada: [sql_over_http.rs, revisão fa504217](https://github.com/neondatabase/neon/blob/fa504217c61bbcaf5c512d75830564541f917f8f/proxy/src/serverless/sql_over_http.rs),
funções `map_header_to_isolation_level`, `BatchQueryData::process`, `query_batch`
e `query_to_json`. Essa revisão pública **não comprova a revisão servida em
Production**. Não foi encontrada evidência que justifique substituir o guard `DO`
ou reduzir o nível de isolamento.

No SDK 1.2.0, exceções de `fetch` são encapsuladas em `sourceError`; respostas
HTTP 400 transportam os campos de erro recebidos, enquanto outros status geram
um `NeonDbError` sem SQLSTATE estruturado. Portanto, a ausência de SQLSTATE não
identifica, sozinha, qual etapa falhou. Se o status existir somente em uma mensagem
bruta, ele permanece desconhecido: esta correção não analisa nem registra mensagens.

## Testes e evidências

- `npm run test:unit`: **196 aprovados, 9 ignorados, zero falhas**. Ignorados
  dependem de planilhas externas. Inclui a integração existente com driver real,
  JWT assinado e PGlite descartável, além das três regressões novas de erros.
- `npm run build`: **aprovado**, incluindo TypeScript, Vite, separação
  cliente/servidor e carregamento das APIs em Node ESM.
- `node --import tsx --test tests/neon-http-transactions.postgres.ts`:
  **6 aprovados, zero ignorados/falhas**. PostgreSQL 18 nativo em container
  descartável, sem rede e sem portas publicadas. O driver Neon e o verificador JWT
  são reais; somente o adaptador HTTP é simulado.

Na suíte nativa, cada lote HTTP utiliza uma conexão PostgreSQL diretamente como
`biosaude_runtime_prod`, sem `SET ROLE`, e um `BEGIN ISOLATION LEVEL SERIALIZABLE`.
Os scripts existentes criam 41 políticas e os grants mínimos somente no banco
descartável. O guard `DO` é executado pelo protocolo estendido do `psql` 18
(`\bind` sem parâmetros); as consultas SELECT mantêm placeholders e a inferência
de tipos PostgreSQL por `PREPARE`/`EXECUTE`, com conversão de resultados para JSON
feita exclusivamente pelo adaptador de teste. Isso não replica a infraestrutura
Neon nem substitui uma verificação do serviço hospedado.

Cenários aprovados na suíte nativa:

1. Sem JWT: 401 e nenhuma chamada SQL. Com JWT, membership e runtime válidos:
   `GET /api/financial/active` retorna **200 com `{ "dataset": null }`**.
2. A sequência real das três transações de leitura é verificada: guard, contexto
   local e `require_permission`; a última contém a leitura da base e da revisão.
   O banco confirma usuários de sessão/execução e isolamento `serializable`.
3. `POST /api/financial/validate` retorna 200 com os seis registros sintéticos
   analisados; a tabela de versões permanece vazia.
4. Parâmetros com aspas e barras continuam literais; o contexto de workspace não
   passa a outra conexão/lote. Outro workspace, mesmo com membership, recebe 403.
5. O SDK real encapsula uma falha de fetch com `cause.code=ECONNRESET`; a categoria
   resultante é `connection_failed`, sem expor a exceção ou seus dados.
6. Runtime com privilégio excessivo é rejeitado antes da leitura, retorna 503
   genérico e mantém as tabelas financeiras vazias.

- `node --import tsx --test tests/production-security.postgres.ts`:
  **8 aprovados, zero ignorados/falhas**, em PostgreSQL **18.7**. Confirma as 41
  políticas, 20 restritivas, 20 tabelas com RLS forçado, grants mínimos, isolamento,
  recusa de elevação e rollback. Os predicados de `PRODUCTION_RUNTIME_CHECK`
  permanecem idênticos aos da `main`.

## Acesso externo e entrega

A política efetiva desta execução libera o hostname PostgreSQL de homologação,
mas não o hostname HTTPS regional usado pelo SDK. Não há credencial de Production
ou acesso de leitura a logs/configuração Vercel neste ambiente. Não se repetiram
as tentativas de conectividade já bloqueadas nas execuções anteriores.

Não houve acesso ou alteração ao banco Neon, redefinição de senha, merge ou deploy.
A prontidão remota permanece **não comprovada**. Se o problema persistir após uma
publicação posteriormente autorizada, a evidência estritamente necessária é a nova
categoria sanitizada do erro ou o status da requisição SQL, correlacionado ao
deployment. Não é necessário enviar mensagens brutas, SQL, dados ou segredos.
