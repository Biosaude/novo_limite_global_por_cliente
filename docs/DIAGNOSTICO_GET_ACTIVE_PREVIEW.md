# HTTP 400 persistente em GET /api/financial/active

## Conclusão desta etapa

Não foi reproduzido um erro no GET comum com os helpers oficiais: o teste retorna 200. Foram reproduzidos dois 400 distintos — JSON vazio entregue como objeto e parâmetro `operation` na URL — mas **nenhum foi confirmado como a requisição real do Preview**. Portanto, esta alteração não flexibiliza cabeçalhos, query, corpo, autenticação ou autorização. Adiciona observabilidade segura para identificar o ponto exato antes de outra correção.

A correção anterior de Buffer vazio cobre uma representação específica e não demonstrava a causa do incidente remoto. Não se considera o incidente resolvido até observar a nova instrumentação no Preview.

## Todos os pontos de INVALID_INPUT no GET active

| `validation` no diagnóstico | Condição no handler |
|---|---|
| `workspace_header` | `x-workspace-id` ausente, múltiplo, de outro tipo ou fora do formato UUID aceito. O valor não é registrado. |
| `query_unexpected` | Parâmetro na URL fora da lista permitida; para `/active`, a lista é vazia. |
| `query_duplicate` | Mesmo parâmetro repetido. |
| `body_nonempty` | Corpo diferente dos vazios aceitos, inclusive `{}`, arrays ou Buffer com conteúdo. |
| `body_framing` | Corpo representado como vazio, mas `Content-Length` não é exatamente `0` ou há `Transfer-Encoding`. |

Para `/active` com GET, validações de paginação, versionId, importação, proposta e revisão não são executadas. JWT inválido é 401, ausência de vínculo é 403 e falhas não publicáveis são 503; não se deve atribuir automaticamente um desses problemas ao 400 `INVALID_INPUT`.

## Reprodução com Vercel real, sem mocks do parser

Comando usado:

```sh
VERCEL_NODE_BUILDER_PATH=/tmp/biosaude-vercel-builder node scripts/check-vercel-financial-runtime.mjs
```

O diretório indicado contém uma instalação externa de `@vercel/node@29.0.0`, não credenciais. Para reproduzir em outro ambiente Linux, pode-se instalar essa versão em diretório temporário com `npm install --prefix /tmp/biosaude-vercel-builder --no-package-lock --ignore-scripts --no-audit --no-fund @vercel/node@29.0.0`. Nenhuma dependência do projeto é alterada.

O roteiro executa `build()` e `startDevServer()` oficiais sobre o artefato gerado para `api/financial/[operation].ts`. A entrada é substituída **somente no diretório temporário** pelo bootstrap de `tests/runtime/financial.ts`, que usa o handler financeiro real, JWT Ed25519 assinado e verificado por `jose`, PGlite descartável com as migrações aprovadas, associação sintética, papel sem superpoderes e RLS. Não há mock de `req.body`, do parser, da autorização ou dos resultados SQL. As chaves e a sessão são sintéticas; a chave privada não é escrita em disco. O bootstrap nunca é uma rota publicada do repositório.

Oito casos passaram:

- GET normal sem Content-Type/corpo: 200, `dataset: null`.
- GET binário vazio com comprimento zero: 200, `buffer_empty`.
- GET JSON vazio com comprimento zero: 400, `object_empty`/`body_nonempty`.
- URL com `operation=active`: 400, `query_unexpected`.
- Parâmetro repetido: 400, `query_duplicate`.
- UUID malformado: 400, `workspace_header`.
- JSON com conteúdo: 400.
- JSON `null` com comprimento declarado: 400, sem aceitar conteúdo oculto pelo parsing.

O teste não prova que o roteador do deployment injeta `operation` na URL. Foi testada a URL explicitamente para identificar essa hipótese separadamente de `req.query.operation`. O runtime pode disponibilizar parâmetros em `req.query`; esse objeto não é usado pelo handler para validar a query da URL.

Limite: builder/runtime de desenvolvimento oficiais locais não substituem o roteador de borda, a configuração e a versão exata do runtime remoto. O builder escolheu metadados `nodejs26.x` pelo intervalo aberto de engines já existente; os artefatos foram executados em Node 24.19.0. Não foi alterada a versão do projeto, Vercel, Neon ou Production.

## Diagnóstico seguro no Preview

Apenas GET `/api/financial/active` em ambiente já habilitado Preview/Development emite uma linha de conclusão com `event: FINANCIAL_GET_DIAGNOSTIC`. Production continua bloqueada antes da instrumentação.

Campos registrados:

- `status`, `phase` e `validation`: status público e identificadores fixos do ponto alcançado/rejeitado.
- `bodyKind`: classificação, como `not_read`, `string_empty`, `buffer_empty` ou `object_empty`; nunca conteúdo nem nomes de campos.
- `contentType`, `contentLength`, `transferEncoding`, `workspaceHeader`: somente categorias/tipos/presença, nunca valores de cabeçalhos.
- `query`, `operationMatches`, `runtimeOperation`: somente classificação da query da URL e de `req.query.operation`, sem URL completa, nomes arbitrários, valores ou parâmetros sensíveis.
- `elapsedMs`, `identityMs`, `authorizationMs`, `loadMs`: durações numéricas por etapa.

Não são registrados JWT, Authorization, cookies, UUID, identidade, e-mail, senha, URL, corpo, base financeira, SQL, mensagem ou stack de exceção. Uma falha do logger não altera a resposta pública. Nenhum detalhe novo é enviado ao navegador. Os cabeçalhos `X-Test-*` existem exclusivamente no bootstrap do teste local.

No deployment Preview do commit desta alteração, abrir Runtime Logs, incluir nível **Info**, filtrar a função `api/financial/[operation]` e o texto **FINANCIAL_GET_DIAGNOSTIC**. Repetir uma leitura normal e verificar o campo `validation`, seguido das categorias de corpo/query/cabeçalhos pertinentes. Usar o vínculo da própria invocação e seu horário no painel para correlacionar; não copiar dados de acesso. Não é necessário alterar nenhuma variável ou ativar outra API.

Se não houver linha, confirmar primeiro o commit/deployment e se a resposta veio de fato do handler; falha anterior à execução ou encerramento forçado pode impedir um registro de conclusão. Não é prova de falha do banco.

## Os 31 segundos: investigação separada

- O frontend configura `AbortSignal.timeout(30000)` na chamada HTTP financeira em `src/persistencia/http.ts`. Um aborto no cliente não produz, por si só, `INVALID_INPUT` no servidor.
- O verificador tem prazo de 5 segundos para uma busca JWKS. O diagnóstico mede toda a verificação em `identityMs`, sem alterar JWT.
- A autorização inicial consulta o banco **antes** da validação do corpo; portanto um 400 de corpo pode acontecer depois de espera nessa etapa. `authorizationMs` mede a chamada inicial inteira, incluindo rede/driver/SQL; valor alto não demonstra timeout SQL.
- `loadMs` cobre `repo.load()`, incluindo sua nova autorização, a consulta da base e da revisão. Não representa somente a execução de um SELECT.
- `elapsedMs` começa na entrada do handler. Comparar com a duração da invocação na Vercel ajuda a distinguir tempo interno de espera anterior, importação/inicialização, transporte ou encerramento da plataforma. A instrumentação não identifica sozinha qual desses fatores externos ocorreu.
- No ensaio local, um GET normal levou 71 ms de ida/volta, com 35 ms no handler (8 ms identidade, 15 ms autorização inicial, 11 ms carregamento). São medições sintéticas de uma execução, **não valores do Neon real nem reprodução dos 31 segundos**.

Nenhum timeout, conexão, SQL, permissão ou fórmula foi ajustado por causa dessa duração ainda não localizada.

## Resultados de validação

- `npm run test:unit`: **168 testes, 160 aprovados, 0 falhas, 8 ignorados** (planilhas oficiais indisponíveis). Inclui privacidade dos logs, rastreio dos cinco pontos de rejeição, medição por etapa com relógio controlado e regressões financeiras/JWT/RLS.
- Build remoto de teste com `VITE_FINANCIAL_REMOTE_ENABLED=true VITE_ALLOW_LOCAL_FALLBACK=true`: aprovado, incluindo typecheck da aplicação/servidor, Vite, inspeção do bundle e carregamento dos quatro pontos de entrada serverless em Node ESM.
- Typecheck estrito dos testes financeiros, diagnósticos e bootstrap oficial: aprovado; `node --check` do roteiro `.mjs`: aprovado.
- Roteiro de builder + helpers oficiais + JWT real sintético + PGlite: **8 casos aprovados** na versão final.
- `git diff --check`: aprovado.

Arquivos: `server/financial/handler.ts`, `server/financial/get-diagnostics.ts`, `tests/financial-api.test.ts`, `tests/financial-get-diagnostics.test.ts`, `tests/runtime/financial.ts`, `scripts/check-vercel-financial-runtime.mjs` e este relatório. Não houve alteração das regras de validação, migrações, JWT, RLS, banco real, usuários, fórmulas, layout ou configurações de Production. Nenhum merge ou deploy manual foi executado.
- Regressão de navegador `tests/remote-integration.spec.ts`, desktop: **1 aprovado, 0 falhas**, incluindo importação sintética, outra sessão, conflitos e revogação de vínculo. O diagnóstico não alterou o contrato público.
