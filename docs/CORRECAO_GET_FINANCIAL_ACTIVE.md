# Correção do GET /api/financial/active — PR #15

## Causa reproduzida

A validação anterior em `server/financial/handler.ts` considerava vazio somente `undefined`, `null` ou `""`. Um `Buffer.alloc(0)` não é igual a nenhum desses valores e causava HTTP 400 `{"code":"INVALID_INPUT"}` depois da autorização, antes da consulta da base.

Foi verificado localmente o helper `getBodyParser` de `@vercel/node@29.0.0`: com `application/octet-stream`, ele retorna o próprio Buffer recebido, inclusive um Buffer com zero bytes. Essa representação de corpo vazio é válida em parsers Node/serverless. Um servidor HTTP Node, coletando os bytes em Buffer e entregando-os ao handler financeiro, reproduziu a rejeição anterior de um GET vazio. Os testes antigos usavam `undefined` ou convertiam o Buffer para texto vazio e, por isso, não detectavam esse caso.

Antes da correção, os três novos testes de regressão falharam: o GET com Buffer vazio e a requisição HTTP Node vazia retornavam 400; além disso, `null`/valor ausente com comprimento positivo declarado podia passar pela validação anterior.

Limite da evidência: não foi inspecionado o corpo da requisição real do Preview, nem usada uma sessão/credencial real para chamar a API. O caso foi reproduzido localmente com uma representação suportada pelo helper oficial e com HTTP Node. A confirmação final do incidente no deployment da PR depende de repetir o GET autorizado no Preview do commit corrigido. Não se deduz a representação exata do corpo remoto apenas pelo status 400.

## Correção restrita

Somente a validação de corpo dos métodos sem carga JSON foi ajustada:

- GET aceita também Buffer cujo tamanho é exatamente zero.
- GET continua recusando Buffer com qualquer byte, objetos (inclusive `{}`), arrays, strings não vazias, números, booleanos e outros tipos não admitidos anteriormente.
- `Content-Length` presente deve ser exatamente `"0"`; valor positivo, inválido ou múltiplo é recusado, mesmo se o parser tiver entregue `null`, `""` ou Buffer vazio.
- GET com `Transfer-Encoding` é recusado conservadoramente, inclusive se o parser esconder o conteúdo. Isso evita interpretar enquadramento ambíguo como ausência de corpo.
- A tolerância nova a Buffer vazio é exclusiva de GET. O comportamento de DELETE e da leitura/normalização JSON de POST, PUT e PATCH permanece igual.

Nenhum objeto JSON vazio é tratado como ausência de corpo. Não houve alteração de autenticação, vínculo, permissões, consultas SQL, RLS, revisão/ETag, fórmulas, frontend, layout, configuração externa ou flag de habilitação.

## Testes

`tests/financial-api.test.ts` usa JWT assinado, vínculos e dados sintéticos em PostgreSQL descartável PGlite:

1. Uma base importada é carregada por GET com Buffer vazio, com/sem `Content-Length: 0`, mantendo seus registros e a revisão ETag.
2. Corpos reais e valores escondidos por parsing com framing de conteúdo retornam 400 `INVALID_INPUT`; somente a autorização prévia é consultada, sem leitura da base ou alteração da revisão.
3. Um servidor HTTP Node recebe GET sem corpo (200), GET com conteúdo por `Content-Length` (400) e por chunked (400).

`tests/server-runtime.test.ts`, obrigatório no build, também verifica esses casos no JavaScript emitido executado por Node ESM puro, com identidade/transporte de banco sintéticos. Mantém a importação dos quatro pontos de entrada serverless e seus bloqueios de ambiente. Não se conecta ao Neon.

## Confirmação no Preview

Depois da atualização automática da PR, confirmar que o deployment corresponde ao novo commit e repetir a leitura normal pelo dashboard. Com usuário e organização autorizados, GET sem corpo deve retornar 200 e o ETag, com a base ativa ou `dataset: null` se nenhuma estiver ativa. Não usar esse resultado isolado para afirmar que toda a persistência remota foi homologada. Não registrar nem compartilhar JWT, cookies ou dados financeiros para a conferência.

## Resultados executados

- `npm run test:unit`: **163 testes, 155 aprovados, 0 falhas, 8 ignorados** por ausência das planilhas oficiais. Inclui os três novos testes de GET e as regressões existentes de JWT, organização, RLS, concorrência e cálculos.
- `VITE_FINANCIAL_REMOTE_ENABLED=true VITE_ALLOW_LOCAL_FALLBACK=true npm run build`: aprovado, incluindo typecheck da aplicação/servidor, Vite, inspeção do bundle cliente e teste do JavaScript serverless em Node ESM puro.
- Typecheck estrito de `tests/financial-api.test.ts` e `tests/server-runtime.test.ts`: aprovado.
- Playwright `tests/remote-integration.spec.ts`, desktop: **1 aprovado, 0 falhas**, com SDK real, autenticação simulada e persistência sintética em PGlite.
- Builder oficial `@vercel/node@29.0.0`, instalado somente em `/tmp`: quatro funções geradas e importadas/executadas localmente. O pacote financeiro passou por seis casos de corpo/framing GET em Node ESM puro, com identidade/banco sintéticos. A emissão contém 7 arquivos para o proxy Auth, 14 para diagnóstico, 100 para a API financeira e 3 para health. Nenhuma dependência do projeto foi instalada ou alterada nesta correção.
- `git diff --check`: aprovado.

Limitação do empacotamento local: não foi executado um build autenticado na Vercel ou uma chamada real ao Preview. O builder local escolheu metadados `nodejs26.x` devido ao intervalo aberto já existente de `engines.node`; a execução local dos artefatos ocorreu em Node 24.19.0. A versão/configuração do runtime remoto não foi alterada nem presumida como confirmada.

Arquivos alterados: `server/financial/handler.ts`, `tests/financial-api.test.ts`, `tests/server-runtime.test.ts` e este documento. Sem alteração em banco real, autenticação, permissões, Production, layout ou fórmulas; sem merge e sem deploy manual.
