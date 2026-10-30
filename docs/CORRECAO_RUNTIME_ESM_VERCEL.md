# Correção do carregamento ESM das APIs na Vercel

## Causa comprovada

O projeto declara `"type": "module"`. As funções TypeScript são emitidas como JavaScript ESM, mas os imports relativos não tinham extensão. O Node não acrescenta `.js` nem procura arquivos TypeScript ao resolver esses imports. Assim, `api/auth/proxy.js` tentava carregar `server/auth/proxy`, embora o artefato emitido fosse `server/auth/proxy.js`.

O problema foi reproduzido antes da correção por compilação TypeScript seguida de execução em Node puro: `ERR_MODULE_NOT_FOUND` no mesmo módulo indicado nos Runtime Logs. Os testes anteriores executados via `tsx` e a resolução `Bundler` do TypeScript aceitavam os caminhos sem extensão e não detectavam essa incompatibilidade.

## Correção e alcance

Os imports locais passaram a usar a extensão de destino `.js`, que o TypeScript resolve para os respectivos fontes `.ts`. A correção abrange as três funções com dependências locais (`auth/proxy`, `diagnostics/neon` e `financial/[operation]`), seus módulos de servidor e os módulos de domínio/importação compartilhados alcançados pela função financeira. `api/health.ts` é independente e permanece idêntico.

As mudanças nos 23 arquivos de código existentes são exclusivamente sufixos de imports. Assinatura JWT, autorização, RLS, SQL, regras de cálculo, layout, senhas e SMTP não foram alterados. Nenhuma dependência foi adicionada ao projeto.

## Proteção contra regressão

`tests/server-runtime.test.ts`, executado por `npm run check:server` e obrigatoriamente por `npm run build`:

1. Descobre todas as funções `.ts` em `api/` e emite a árvore transitiva em diretório temporário.
2. Confere a emissão dos pontos de entrada JavaScript e cria um pacote ESM isolado.
3. Inicia outro processo Node, sem `tsx`, loaders ou flags especiais de resolução.
4. Importa todas as funções, inclusive a árvore financeira completa.
5. Executa as três rotas afetadas com transporte de autenticação sintético, conferindo chamadas e respostas.
6. Confere a resposta original de `/api/health`, o bloqueio em Production e o bloqueio da API financeira desabilitada.

O transporte externo é substituído antes da importação dos handlers; o teste não usa Neon, SMTP ou credenciais. O diretório gerado é removido ao concluir. Antes da correção, esse teste falhou com o erro reportado; depois, passou.

## Testes executados

- `npm run test:unit`: **139 aprovados, 0 falhas, 8 ignorados**, total de 147. As oito exclusões dependem de planilhas oficiais não disponíveis neste ambiente.
- `VITE_FINANCIAL_REMOTE_ENABLED=true VITE_ALLOW_LOCAL_FALLBACK=true npm run build`: typecheck de aplicação/servidor, Vite, inspeção do bundle cliente e teste ESM aprovados.
- Typecheck estrito específico de `tests/server-runtime.test.ts`: aprovado.
- Playwright, `tests/access-recovery.spec.ts` e `tests/remote-integration.spec.ts`, desktop e mobile: **10 aprovados, 0 falhas**, com SDK real, autenticação simulada e PostgreSQL sintético descartável.
- `git diff --check`: aprovado.

## Artefatos do builder oficial

Foi executado localmente o `build()` de `@vercel/node@29.0.0`, com TypeScript 5.9.3 e os fontes corrigidos, sem credenciais ou acesso à Vercel. O builder foi instalado apenas em `/tmp`, sem modificar as dependências do projeto. O comando de instalação e o build da aplicação foram ignorados nesse ensaio do builder, pois as dependências já estavam disponíveis e o build completo havia passado separadamente.

| Entrada | Handler emitido | Arquivos empacotados |
|---|---|---:|
| `api/auth/proxy.ts` | `api/auth/proxy.js` | 5 |
| `api/diagnostics/neon.ts` | `api/diagnostics/neon.js` | 14 |
| `api/financial/[operation].ts` | `api/financial/[operation].js` | 100 |
| `api/health.ts` | `api/health.js` | 3 |

O pacote do proxy contém `package.json`, `api/auth/proxy.js`, seu source map, `server/auth/proxy.js` e seu source map. Os outros pacotes incluem as dependências transitivas de servidor/domínio e os pacotes externos rastreados pelo builder. Não foi necessário incluir arquivos manualmente ou modificar `vercel.json`.

Os quatro handlers efetivamente empacotados foram importados e executados em um processo Node 24.19.0 sem loader TypeScript. Passaram os bloqueios de ambiente e as três rotas de autenticação com transporte sintético. Os artefatos e o manifesto ficaram em `/tmp/biosaude-vercel-artifacts/`; são temporários e não serão publicados como código da aplicação.

Limitação: esse é o builder oficial isolado, não um `vercel build` autenticado nem o runtime remoto completo da Vercel. A versão exata do builder e do Node usados pelo Preview não foi consultada. O builder local selecionou metadados de runtime `nodejs26.x` devido ao intervalo aberto `engines.node >=22.12.0`; a execução local foi em Node 24.19.0. A configuração de runtime do projeto não foi alterada. É necessária a confirmação no Preview do commit corrigido.

## Validação no Preview

Nenhum deploy foi executado manualmente. Após a atualização automática do Preview da PR, conferir que o deployment corresponde ao novo commit e que as três rotas não registram `ERR_MODULE_NOT_FOUND`. `get-session` sem sessão deve preservar a resposta oficial do serviço; recuperação/verificação precisam ser avaliadas com uma conta de homologação e com a configuração de e-mail existente. A ausência do erro de módulo não comprova entrega de e-mail nem persistência real no Neon.
