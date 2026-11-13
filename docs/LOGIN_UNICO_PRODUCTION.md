# Login único Neon Auth — preparação de Production

Implementação preparada a partir de `main` (`6ba19572d8598e6b2ffcb9b841d441ee5fd0b2a0`). Nenhuma mudança no Neon, nas variáveis remotas ou em deploy. A autenticação continua usando o SDK existente e `/api/neon-auth`; não foi criado outro login, cadastro público ou mecanismo de senha.

## Auth independente das APIs financeiras

| Configuração | Efeito |
| --- | --- |
| `AUTH_PRODUCTION_ENABLED=true` no servidor Production | Libera o proxy Auth existente, incluindo sessão, login, logout, recuperação e verificação de e-mail. Ausente/false mantém 404. |
| `VITE_AUTH_ENABLED=true` no build | Exibe o mesmo login mesmo com dados remotos desabilitados; consome e limpa os callbacks de senha/verificação. Após login, mostra a sessão confirmada e logout, sem chamadas financeiras. |
| `VITE_FINANCIAL_REMOTE_ENABLED=true` | Preserva a entrada existente pelo mesmo login no Preview e habilita o fluxo de organização/dados remotos no frontend. Não autoriza APIs por si só. |
| `FINANCIAL_PRODUCTION_ENABLED=true` **e** `FINANCIAL_API_ENABLED=true` | Libera a API financeira em Production, mantendo JWT, vínculo, permissão, RLS e revisão obrigatórios. Nenhuma dessas flags libera Auth. |

Preview e Development continuam aceitando Auth com a configuração anterior, sem exigir `AUTH_PRODUCTION_ENABLED`. Em Production, `AUTH_APP_ORIGIN` HTTPS exata é obrigatória; aliases de Preview não autorizam pedidos ou callbacks. Cookies, restrições de origem, lista de rotas/campos, sanitização e respostas contra enumeração de contas continuam aplicados.

A verificação permanece no Neon Auth: OTP usa `email-otp/verify-email`; links são validados pelo serviço. Retornar com `access=verified` não confirma identidade por si só. As flags financeiras não bloqueiam envio, confirmação ou recuperação. A entrega real ainda depende do provedor de e-mail e da configuração da instância Auth selecionada.

## Workspace separado por ambiente

O build incorpora `VERCEL_ENV` do processo Vercel para distinguir Production de Preview. `import.meta.env.PROD` não serve para isso, porque um Preview também é compilado para produção.

`VITE_FINANCIAL_WORKSPACE_ID` deve ser configurado no escopo **Production** com o UUID confirmado de Production. Não foi inventado nem copiado um UUID. Se estiver ausente, vazio ou inválido, o seletor não adota o UUID de desenvolvimento e o alias `Biosaude` não aponta para ele. Um UUID ainda pode ser informado explicitamente no seletor, e o backend sempre verifica autorização. O alias usa apenas o UUID configurado para aquele build. Preview/Development mantêm o fallback existente e seus overrides.

O UUID real de Production não está documentado no repositório e não foi confirmado nesta execução. Essa confirmação e a futura configuração no escopo Production são pendências da ativação remota, não exigem modificar o workspace de desenvolvimento. Um UUID público não concede permissões e não substitui `identity_memberships`.

## Concorrência e integridade de ETag

O teste antigo rejeitava qualquer `W/"n"`, contrariando a correção de compatibilidade Vercel já presente. Agora testa ETag malformado. Os testes mantêm a normalização de `W/"n"` para `If-Match: "n"`, rejeição de revisões divergentes/fora da faixa segura, bloqueio de escrita sem revisão e conflitos sem retry. Cabeçalhos de revisão presentes mas malformados são recusados mesmo quando o outro cabeçalho é válido.

O mesmo teste antigo pressupunha limite de 3 MB antes da compactação de importações. A cobertura agora distingue o limite de 3 MB de requisições comuns e o limite de 32 MB do JSON expandido de importações; a compactação válida continua testada em `financial-compression.test.ts`.

## Ativação futura, mediante autorização separada

1. Confirmar serviço Auth, domínio confiável e e-mail da instância Production, preservando a instância Preview. Não presumir que identidades se propagam entre branches Neon.
2. Revisar valores **somente no escopo Production**: `NEON_AUTH_BASE_URL`, `AUTH_APP_ORIGIN`, `AUTH_PRODUCTION_ENABLED`, `VITE_AUTH_ENABLED` e, quando houver liberação financeira, `VITE_FINANCIAL_WORKSPACE_ID`. Manter as duas flags financeiras false durante homologação de Auth.
3. Revisar migração e permissões conforme [plano de pré-migração](PLANO_MIGRACAO_PRODUCTION_NEON.md). Esta alteração não aplica SQL, cria vínculos ou habilita dados.
4. Autorizar push/PR/merge separadamente. Publicação, alteração de variáveis e homologação real de e-mail exigem autorização posterior própria.

Rollback: uma futura desativação de `AUTH_PRODUCTION_ENABLED` bloqueia o proxy; a flag financeira não é um desligamento de Auth. Nenhuma flag foi alterada remotamente nesta execução.

Os cálculos, componentes e estilos do dashboard não foram modificados. A validação automatizada usa upstream Auth simulado e PostgreSQL embarcado descartável, sem enviar e-mails ou acessar Neon real.

## Validação para revisão

- `npm run test:unit`: 181 aprovados, 9 ignorados por dependerem de planilhas externas, zero falhas.
- `npm run build`: TypeScript frontend/servidor, bundle cliente sem configuração de banco e execução das APIs emitidas em Node ESM aprovados. O teste de runtime também exerce Auth em Production com ambas as flags financeiras false.
- Build `VERCEL_ENV=production VITE_AUTH_ENABLED=true VITE_FINANCIAL_REMOTE_ENABLED=false VITE_ALLOW_LOCAL_FALLBACK=false`: os 8 casos de `access-recovery.spec.ts` passaram em desktop/mobile com `AUTH_ONLY_E2E=true`, sem chamadas financeiras.
- Build `VERCEL_ENV=preview VITE_AUTH_ENABLED=false VITE_FINANCIAL_REMOTE_ENABLED=true VITE_ALLOW_LOCAL_FALLBACK=true`: os 5 casos de `access-recovery.spec.ts` e `remote-integration.spec.ts` passaram no desktop com `REMOTE_E2E=true`, incluindo logout, persistência entre sessões, revogação e isolamento financeiro.
- Builds `VERCEL_ENV=production VITE_AUTH_ENABLED=true VITE_FINANCIAL_REMOTE_ENABLED=true VITE_ALLOW_LOCAL_FALLBACK=false`, um com `VITE_FINANCIAL_WORKSPACE_ID` vazio e outro com UUID sintético: `production-workspace.spec.ts` passou em ambos. O teste vazio não adota desenvolvimento; o teste configurado envia apenas o UUID configurado. A API simulada continua negando autorização.
- Build local padrão com `VITE_AUTH_ENABLED=false VITE_FINANCIAL_REMOTE_ENABLED=false VITE_ALLOW_LOCAL_FALLBACK=false`, seguido da suíte Playwright completa: 88 aprovados nas quatro resoluções e 52 ignorados (planilhas externas e suites que exigem builds específicos, exercitadas separadamente acima). Zero falhas; importação, cálculos, layout, persistência, Excel e PDF validados com fixtures sintéticas.

Nos testes de navegador foi usado `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. O runner inicia o preview local do build; não houve publicação. Para repetir os casos de workspace, usar `WORKSPACE_E2E=true` e `EXPECTED_WORKSPACE` igual ao UUID sintético do build (vazio no primeiro caso). Os comandos de teste não alteram variáveis remotas.

Avisos de chunks maiores que 500 kB e comentários de otimização em dependências foram emitidos pelo Vite, sem impedir o build. Otimização de bundle está fora desta alteração.
