# Diagnóstico seguro de falhas do Neon Auth — PR #15

## Evidência e causa do problema de observabilidade

No commit anterior `be9adc5`, `server/auth/proxy.ts` preservava apenas alguns erros funcionais, como token inválido ou e-mail não verificado. Nos pedidos de recuperação e verificação, todos os outros erros HTTP eram convertidos em `EMAIL_SERVICE_UNAVAILABLE`/503, exceto HTTP 429. O status e o código originais eram descartados. O `catch` externo também reunia configuração inválida, rede, timeout e resposta inválida em `AUTH_UNAVAILABLE`/503, sem qualquer diagnóstico.

Assim, HTTP 200 em `get-session` e HTTP 503 no pedido de recuperação não permitiam concluir se havia envio desabilitado, limitação, falha HTTP do serviço ou problema de comunicação. **A causa externa específica do Neon real ainda não foi observada por esta correção.** Não foi enviado e-mail real nem alterada qualquer configuração do Neon/Vercel.

## Contrato dos logs

Somente em Preview/Development, uma falha gera uma linha JSON de `console.warn`, com exatamente dois campos:

```json
{"status":400,"code":"RESET_PASSWORD_DISABLED"}
```

Esse é um **exemplo de formato, não um resultado observado no projeto**. `status` é o status HTTP recebido do provedor, antes do mapeamento público. Quando nenhuma resposta HTTP foi recebida, vale `null`, nunca um status presumido do Neon. Se houver falha durante a leitura de uma resposta já recebida, o status conhecido é preservado.

O código é extraído exclusivamente de `code` ou `error.code` e comparado por igualdade com a lista fechada de `server/auth/diagnostics.ts`. Não se aceita qualquer string só por usar maiúsculas ou parecer um código. Código ausente, desconhecido, objeto, string arbitrária ou resposta de erro sem JSON são registrados como `UNRECOGNIZED_PROVIDER_ERROR`. Não há tentativa de obter o código a partir de mensagens.

Não são registrados e-mails, senhas, tokens, cookies, cabeçalhos, destino, query string, corpo de requisição/resposta, mensagem, stack ou causa da exceção. Não há registro de sucesso. Bloqueio em Production, CSRF e entrada inválida não geram o diagnóstico nem contatam o provedor. O logger não pode alterar o resultado da autenticação se estiver indisponível.

## Interpretação

| Diagnóstico no log | Interpretação e resposta pública |
|---|---|
| `RESET_PASSWORD_DISABLED` | Sinal explícito de recuperação desabilitada; resposta pública 503 `AUTH_CONFIGURATION_ERROR`. No Better Auth instalado, esse código é lançado quando `emailAndPassword.sendResetPassword` não está disponível. Não comprova a configuração da versão gerenciada até aparecer no Preview real. |
| `VERIFICATION_EMAIL_NOT_ENABLED` | Sinal explícito de verificação por e-mail não habilitada; 503 `AUTH_CONFIGURATION_ERROR`. |
| `INVALID_ORIGIN`, `INVALID_CALLBACK_URL`, `INVALID_REDIRECT_URL`, `MISSING_OR_NULL_ORIGIN`, `CALLBACK_URL_REQUIRED` | Rejeição explícita de origem/retorno/configuração do fluxo; 503 `AUTH_CONFIGURATION_ERROR`. O log não inclui o valor rejeitado. |
| HTTP 429 ou `RATE_LIMIT`, `RATE_LIMIT_EXCEEDED`, `TOO_MANY_REQUESTS` | Limitação de solicitações; 429 `TOO_MANY_REQUESTS`. |
| HTTP 5xx, sem sinal explícito de configuração/limitação | Falha HTTP do serviço; 503 `EMAIL_SERVICE_UNAVAILABLE` nos pedidos de envio ou `AUTH_SERVICE_UNAVAILABLE` nas outras operações. |
| `AUTH_PROXY_CONFIGURATION_ERROR`, status `null` | Configuração local ausente ou inválida. Não abre rede. Ausência da URL mantém o bloqueio 404 anterior; configuração inválida gera 503 `AUTH_CONFIGURATION_ERROR`. |
| `AUTH_UPSTREAM_NETWORK_ERROR`, status `null` | A chamada falhou sem resposta HTTP; 503 `AUTH_COMMUNICATION_FAILED`. Não se presume falha de SMTP. |
| `AUTH_UPSTREAM_TIMEOUT` | Timeout de comunicação; 504 `AUTH_COMMUNICATION_FAILED`. Status é `null` se não houve resposta, ou o status já recebido. |
| `AUTH_UPSTREAM_INVALID_RESPONSE` | Falha ao processar uma resposta, inclusive HTTP 200 sem JSON válido; 502 `AUTH_COMMUNICATION_FAILED`. Não há falso sucesso. |
| `UNRECOGNIZED_PROVIDER_ERROR` | Falha com código ausente ou fora da lista. O status ajuda a separar 429 e 5xx; não é possível deduzir uma causa específica de configuração apenas por HTTP 400/403. |

Os códigos acima, exceto os erros funcionais públicos já existentes, não são repassados integralmente do provedor ao navegador. As mensagens públicas são textos fixos da aplicação. As respostas genéricas de anti-enumeração para `USER_NOT_FOUND` e `EMAIL_ALREADY_VERIFIED` permanecem em erros 4xx; uma resposta 5xx não é convertida em sucesso nem em erro de código de verificação.

JWT, assinatura, issuer/audience, autorização por organização, RLS, permissões, SQL, contratos financeiros, layout e fórmulas não foram alterados. Não foi adicionada dependência ou flag de diagnóstico público.

## Como consultar no Preview com segurança

1. No projeto Vercel existente, selecionar o deployment **Preview** da branch `feat/neon-operational-integration` que corresponda ao commit desta correção.
2. Abrir **Runtime Logs / Logs** e incluir o nível **Warning**. Filtrar a função `api/auth/proxy` (a rota `/api/neon-auth/*` é reescrita para ela).
3. Fazer uma única solicitação de recuperação pela interface, com a conta de homologação, respeitando o intervalo e o limite do provedor. Não colocar dados de acesso em URL ou comandos.
4. Localizar a linha JSON de dois campos no horário dessa invocação. O status HTTP da requisição no painel pode ser 503; **`status` dentro do JSON é o status original do Neon**.
5. Para análise técnica, usar somente o par `status`/`code`. Não copiar corpo, cabeçalhos, cookies, token ou dados da conta. Não ativar logs de debug de tráfego para obter mais detalhes.

Se o resultado for `UNRECOGNIZED_PROVIDER_ERROR`, a correção não inventa o erro nem registra conteúdo bruto para tentar descobri-lo. A próxima análise deve usar a documentação/Console/suporte oficial do Neon em canal administrativo seguro; qualquer ampliação da lista precisa de revisão e testes, sem publicar mensagens internas. Logs desta correção não alteram a política de retenção ou os metadados operacionais gerados pela própria plataforma Vercel.

## Validação

Os testes usam somente respostas, exceções, contas e credenciais sintéticas. `tests/auth-diagnostics.test.ts` cobre configuração, limitação, erros HTTP, código malicioso/desconhecido, JSON/HTML inválidos, rede, timeout antes/depois dos cabeçalhos, protocolo inválido, CSRF, Production, anti-enumeração e o formato exato do logger. Os testes verificam que marcadores confidenciais em mensagens, corpos, exceções e cabeçalhos não chegam aos logs ou ao corpo público.

Resultados executados nesta alteração:

- `npm run test:unit`: **160 testes, 152 aprovados, 0 falhas, 8 ignorados** (planilhas oficiais ausentes). Inclui os 13 testes novos de diagnóstico, JWT/autorização e regressões financeiras existentes.
- `VITE_FINANCIAL_REMOTE_ENABLED=true VITE_ALLOW_LOCAL_FALLBACK=true npm run build`: aprovado, incluindo typecheck frontend/servidor, Vite, inspeção de fronteira cliente/servidor e carregamento dos quatro handlers emitidos em Node ESM puro.
- Typecheck estrito de `tests/auth-diagnostics.test.ts`: aprovado.
- Playwright `tests/access-recovery.spec.ts`, desktop e mobile: **8 aprovados, 0 falhas**, usando SDK real e transporte do provedor simulado.
- `git diff --check`: aprovado.

Arquivos desta correção: `server/auth/proxy.ts`, `server/auth/diagnostics.ts`, `tests/auth-diagnostics.test.ts`, `tests/auth-recovery.test.ts` e este documento. Não houve validação de envio real no Neon, acesso a banco, mudança em Production, merge ou deploy manual.
