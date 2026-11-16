# Auditoria consolidada do incidente — 16/11/2026

## Escopo e revisão

Repositório `Biosaude/novo_limite_global_por_cliente`, base remota `main` em
`c32ac93fa6963f33458985051e628bf9f17b5354`, incluindo PR #24 (`82d398a`) e
PR #25 (`ad11505`, `f7bc569`). A revisão inicial do checkout era anterior a ambos;
as correções partem da `main` atual em `fix/consolidated-auth-financial-20261116`.
O SHA atualmente servido pela Vercel não pôde ser consultado.

## Causas confirmadas e limites da conclusão

| Sintoma | Evidência | Conclusão |
|---|---|---|
| Login inválido apresentado como falha 502 | Resposta simulada realista `400 INVALID_EMAIL_OR_PASSWORD` ao proxy retornou `502 AUTH_REJECTED` antes da correção. O ramo final preservava apenas 401/403 e convertia os demais status em 502. | Defeito de classificação confirmado e corrigido. Não explica, por si, o 503 do login válido em Production. |
| Runtime inseguro apresentado como falta de permissão do usuário | O guard de Production e `require_permission` utilizavam o mesmo SQLSTATE `42501`; o cliente convertia ambos em `403 ACCESS_DENIED`. | Separados por SQLSTATE `PBR01` exclusivo do guard, mantendo todos os predicados. Runtime inseguro continua bloqueando a transação e passa a produzir 503 genérico. |
| 503 financeiro sem causa identificável em Production | As categorias do driver só eram registradas em Preview/Development; a leitura/validação da URL ocorria fora do tratamento diagnóstico. | Lacuna de diagnóstico confirmada e corrigida com vocabulário fechado, sem informações privadas. A causa do incidente remoto continua não comprovada. |
| Histórico `404 AUTH_DISABLED` | O proxy retorna 404 antes da rede quando a flag de Auth não habilita o ambiente ou quando falta a URL Auth. | Sem configuração efetiva do deployment, não é possível escolher qual condição ocorreu no incidente histórico. |
| Histórico 503 de login/recuperação | Há ramos distintos de configuração local/provedor, rede e erro upstream. O proxy não lê `DATABASE_URL` e não importa o driver PostgreSQL em runtime. Teste com acesso proibido às variáveis de banco comprova independência dos fluxos. | Não foi comprovada relação causal entre a troca de `DATABASE_URL` e falha do Neon Auth. Configuração/log upstream reais indisponíveis. |
| Histórico `503 FINANCIAL_API_UNAVAILABLE`, fase `authorization`, `loadMs=0` | A autorização já abre transação, executa o guard, configura o workspace e chama `require_permission`. O log fornecido não identifica qual desses passos falhou. | Não se atribuiu a falha ao pooling, senha, JWT ou guard sem evidência. |

O PR #25 foi preservado: audience ausente ou vazia usa o issuer configurado,
mantendo a validação criptográfica estrita de `aud`, `iss`, assinatura, algoritmo,
expiração e demais claims. Não foram acrescentadas exceções JWT.

## Correções implementadas

- Códigos conhecidos de credenciais inválidas retornam 401 genérico e uniforme,
  mesmo quando Better Auth responde 400. Respostas upstream 5xx continuam 503;
  verificação pendente permanece 403; limites permanecem 429.
- O guard de runtime emite `PBR01`, distinguindo configuração insegura de
  permissão de usuário. Não houve mudança nos critérios de segurança, grants,
  políticas, migrações ou no uso de transações Serializable.
- `FINANCIAL_DATABASE_FAILURE` fica disponível também em Production. Contém apenas
  evento, fase (`configuration`/`transaction`), categoria e reconhecimento do
  SQLSTATE. Nunca contém erro bruto, stack, SQL, parâmetros, nomes de usuário,
  workspace, host, URI, senha ou JWT. Falha do logger não muda a resposta.
- A interface e as regras financeiras permanecem preservadas. Não há nova
  dependência nem fallback automático.

## Inventário auditado

- Auth: `api/auth/proxy.ts`, rewrite `/api/neon-auth/*`,
  `server/auth/proxy.ts`, `server/auth/diagnostics.ts`, gates independentes,
  `src/auth/client.ts`, `Access.tsx`, recuperação e configuração de workspace.
  Rotas restritas: login por e-mail, logout, sessão, token, recuperação, definição
  de senha, envio de verificação e verificação OTP. Cadastro público não foi aberto.
- Financeiro: `api/financial/[operation].ts`, configuração/driver,
  handler, identidade, autorização e contexto por workspace, repositórios e codecs.
  Rotas: `active` GET/PUT/DELETE; `validate` e `imports` POST; `versions` e
  `version` GET; `reviews` PATCH; `proposals` GET/POST.
- SQL: migrações 0001–0003 e scripts de boundary/grants foram lidos e executados
  exclusivamente em bancos descartáveis. O guard é aplicado antes do escopo e
  da autorização dentro da mesma transação. Contexto usa `set_config(...,true)`
  local à transação, compatível com a transação HTTP em lote do driver.
- Base vazia: o repositório já retorna `null` quando não existe dataset ativo;
  revisão ausente resulta em zero, permitindo a primeira importação autorizada.
  Esses comportamentos foram verificados e não precisaram de correção.

## Validação automatizada

Todos os usuários, chaves, credenciais de teste e dados são sintéticos.
Nenhum teste utiliza a variável privada de homologação ou credenciais Production.

- `npm run test:unit`: **193 aprovados, 9 ignorados, zero falhas**. Os ignorados
  exigem planilhas reais externas ausentes. Inclui SDK oficial, proxy, JWT,
  assinatura RS256/EdDSA, issuer/audience, autorização, revogação, importação,
  versões, contratos financeiros e regressões novas.
- `npm run build`: **aprovado**, incluindo TypeScript frontend/servidor, Vite,
  separação cliente/servidor e carregamento de todas as APIs em Node ESM.
- `node --import tsx --test tests/production-security.postgres.ts`:
  **8 aprovados** em PostgreSQL **18.7**, container descartável, rede desativada,
  sem portas publicadas. Confirma 41 políticas, 20 restritivas, 20 tabelas com
  RLS forçado, privilégios mínimos, isolamento, recusa de elevação e rollback.
- Nova integração `production-financial-driver.test.ts`: driver Neon verdadeiro
  com transporte HTTPS simulado, SQL executado em PGlite descartável com banco
  `neondb`, identidade de sessão `biosaude_runtime_prod`, JWT assinado e os scripts
  reais de boundary/grants. **5 testes aprovados**, incluídos nos 193 acima:
  401 sem JWT e sem conexão; 200 com `dataset:null`, revisão zero e listas vazias;
  403 para outro workspace apesar de membership; validação/importação Excel e
  leitura de versões com grants mínimos; preservação de legado sintético;
  runtime inseguro bloqueado com 503. Isso não comprova login TCP/Neon real.

- Navegador padrão: **88 aprovados**, quatro resoluções, zero falhas; 52 cenários
  ignorados naquele modo por dependerem de planilhas externas ou builds específicos.
- Build Auth com ambiente Production, financeiro e fallback desligados:
  **10 aprovados** em desktop/mobile, incluindo login inválido com upstream 400,
  recuperação/verificação sintéticas, sessão e logout. Não houve e-mail real.
- Build Preview remoto: **6 aprovados** no desktop, incluindo SDK oficial,
  importação Excel, recarga em outra sessão, revogação e isolamento. O modo local
  isolado já existente foi habilitado somente nesse build de teste para exercitar
  a troca explícita prevista na suíte; nenhum fallback automático foi criado.
  O artefato padrão foi reconstruído após a matriz de builds.

## Arquivos modificados

- `server/auth/proxy.ts`: classificação de credenciais inválidas.
- `server/db/client.ts`: SQLSTATE próprio para runtime inseguro e diagnóstico
  seguro da configuração/transação também em Production.
- `server/db/diagnostics.ts`: categorias fechadas de erro e logger seguro.
- `server/financial/handler.ts`: correção de comentário sobre o diagnóstico já
  existente; nenhum comportamento do handler foi alterado diretamente.
- `tests/auth-proxy.test.ts`: regressões de status e independência de PostgreSQL.
- `tests/access-recovery.spec.ts`: regressão de login inválido no navegador.
- `tests/database-diagnostics.test.ts`: falhas categóricas, sigilo e logger falho.
- `tests/production-financial-driver.test.ts`: integração Production isolada.
- `tests/production-security.postgres.ts`: exige o SQLSTATE específico do guard.
- `docs/AUDITORIA_INCIDENTE_20261116.md`: evidências e limites desta entrega.

## Pull Request

A tentativa de criar **um PR em rascunho** contra `main`, com título e descrição
consolidados, falhou: `POST https://api.github.com/graphql: Forbidden`.
**Não existe URL de PR para esta entrega.** A branch de correção permanece local;
nenhum push, merge ou comando de deploy foi executado. O commit e seu patch
permitem revisão sem depender da API remota.

## Impedimentos externos comprovados

- A política atual libera o hostname PostgreSQL de homologação, mas o driver
  oficial deriva `https://api.c-7.us-east-2.aws.neon.tech/sql`. O CONNECT para esse
  serviço recebeu **403 do proxy**, antes de qualquer SQL. A tentativa anterior
  neste chat ao `/sql` do hostname pooler não reproduzia o transporte do driver;
  seu HTTP 400 não comprova falha de autenticação PostgreSQL.
- O CONNECT para `novolimiteglobalporcliente.vercel.app` recebe **403 do proxy**.
  Não foi possível observar sessão, login ou API publicados nesta execução.
- `gh api repos/Biosaude/novo_limite_global_por_cliente/pulls/25` recebeu
  **Forbidden**. A leitura Git funciona; os commits dos PRs foram auditados por
  Git. A disponibilidade de escrita Git não implica acesso à API de PRs.
- Não existem `DATABASE_URL` de Production, `VERCEL_TOKEN` ou `NEON_API_KEY`
  nesta execução. A variável privada de homologação existe, mas não autoriza
  inferir os valores ou o estado do deployment Production.

## Prontidão e ações externas necessárias

**Corrigido e testado em isolamento; não validado em Production.** Não é possível
declarar concluído o incidente de login/API até obter evidência do fluxo publicado.
Nenhuma variável externa foi declarada incorreta sem acesso ao seu valor/estado.
Não houve acesso ao banco Production, redefinição de senha, migração remota,
alteração de grants/RLS, movimentação de legado, merge ou deploy.

Para concluir o trabalho remoto, fornecer acesso seguro de leitura ao deployment
e logs Vercel, à configuração Neon correspondente e a uma sessão autorizada de
teste existente; habilitar as rotas de rede necessárias ao serviço publicado e
ao transporte oficial Neon. O acesso à API GitHub também é necessário para abrir
o único PR solicitado. Segredos não devem ser enviados por texto ou versionados.
Após revisão do PR, merge/deploy continuam dependendo de autorização explícita.
