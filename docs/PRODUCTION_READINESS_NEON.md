# Production — preparação controlada (PR separada da #19)

## Escopo desta alteração
Esta branch parte do Preview funcional da PR #19 e **não modifica Production**, o banco, o layout ou as regras financeiras. Só abre a possibilidade de utilizar as rotas remotas em Production quando habilitadas por **duas flags de servidor**:

- `FINANCIAL_PRODUCTION_ENABLED=true` — autorização explícita para Production; ausente ou false mantém API e proxy Auth indisponíveis.
- `FINANCIAL_API_ENABLED=true` — ativa a API financeira; mesmo com a flag Production, ausente ou false retorna 404.

A autenticação do proxy também exige `FINANCIAL_PRODUCTION_ENABLED=true`; não expõe rota de cadastro público pelo aplicativo, não provisiona memberships e não aceita JWT sem assinatura válida. Preview continua comportando-se como antes.

## Checklist obrigatório ANTES de promover ou mesclar

1. **Identificar o destino financeiro**: decidir e confirmar por escrito se Production deve usar uma branch/banco Neon separados ou o mesmo banco já homologado. Não assumir que contas, membros e importações se propagam entre branches. Se ambiente isolado, provisionar banco e migrações aprovadas, realizar backup, checar RLS, constraints e grants mínimos, e não copiar dados automaticamente.
2. No **Neon Auth** correspondente ao destino Production, confirmar serviço de e-mail, identidades, e-mail verificado e origem HTTPS de Production em Trusted Domains. Não editar `emailVerified` em SQL. Não enviar senhas, JWTs ou URLs privadas em PRs ou chats.
3. Provisionar **individualmente** as permissões em `biosaude.identity_memberships`, com `workspace_id`, `issuer` e `subject` correspondentes ao JWT real. Novos funcionários começam com `datasets:read` (e `credit:read` somente se necessário). Não usar `role=user` do Better Auth como permissão financeira e não dar INSERT/UPDATE da tabela ao runtime.
4. Vercel > Project > Settings > Environment Variables: configurar escopo **Production** de `DATABASE_URL` (servidor, usuário restrito, sslmode=require), `NEON_AUTH_BASE_URL`, `AUTH_APP_ORIGIN` (HTTPS exato, sem barra final), `FINANCIAL_AUTH_ISSUER`, `FINANCIAL_AUTH_AUDIENCE`, `FINANCIAL_AUTH_JWKS_URL`, `VITE_FINANCIAL_REMOTE_ENABLED=true` (build), `VITE_FINANCIAL_WORKSPACE_ID` (UUID público), `VITE_ALLOW_LOCAL_FALLBACK=false`. Jamais criar `VITE_DATABASE_URL` nem publicar tokens.
5. Manter **`FINANCIAL_PRODUCTION_ENABLED=false` e `FINANCIAL_API_ENABLED=false`** até terem sido validados o domínio, as credenciais e a autorização. A configuração de variáveis de build deve ser feita antes da compilação de Production. Alterações no dashboard de Production anterior requerem plano de rollback.
6. Homologar em ambiente isolado/equivalente: login e recuperação de senha, leitura por usuário autorizado; GET sem JWT = 401; usuário cadastrado sem vínculo = 403; usuário de outra organização = 403; leitura sem permissão de escrita; importação, histórico, reativação, logout, ETag e conflito de revisão; conferência de totais e retenção dos dados após nova sessão. Verificar os logs sanitizados sem expor dados.
7. **Somente após aprovação explícita**: planejar ativação da Production, definir janela/rollback, habilitar flags no escopo Production e efetuar o deploy/merge aprovado. Não usar Promote to Production de um Preview anterior que foi compilado com outras flags.
8. Pós-publicação: testar conta de leitura, operador e administrador, exportações e dados; manter monitoramento de erros e reverter flags/deploy imediatamente se houver regressão.

## Restrições
Este código **não** concede acesso financeiro a usuários recém-criados, não valida configuração efetiva da Vercel, não confirma entrega real de e-mail e não executa migrations. Os usuários criados na branch `desenvolvimento` não são automaticamente usuários de Production. Vercel Preview protegido por login da Vercel é uma camada distinta de Neon Auth.

## Validação automatizada adicionada
Testes para negar Production quando qualquer uma das duas flags financeiras faltar; quando explicitamente autorizada, o proxy de sessão consegue encaminhar GET de sessão, mas cadastro público continua bloqueado, e a API financeira continua rejeitando requisições sem JWT com 401, sem consulta ao banco.
