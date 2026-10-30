# Integração operacional — homologação Preview

## Estado e limites

Esta branch inclui o commit eaf1977 da PR #14 (RS256 + EdDSA), sem merge na main. Preserva os contratos DatasetRepository/ProposalRepository, fórmulas, classificação financeira, layout executivo e IndexedDB. Não adiciona migração, tabela, aprovação de crédito, cadastro automático ou acesso à Neon Data API. Não altera lgc/public nem configura Production.

As flags continuam false no exemplo. A implementação é testável com identidades sintéticas e PostgreSQL descartável. Não considerar a homologação Neon concluída sem executar login, leitura e escrita de teste pelo Preview e confirmar a posição em outra sessão. Autenticação PostgreSQL por senha e status Ready não comprovam esse fluxo.

## Configuração externa mínima — somente desenvolvimento/Preview

Configurar pelos canais seguros dos provedores, nunca pelo chat ou em arquivos versionados:

| Configuração | Onde | Finalidade |
| --- | --- | --- |
| DATABASE_URL | Servidor, Preview/Development | neondb/desenvolvimento como biosaude_api_dev e TLS; já informada pelo administrador |
| NEON_AUTH_BASE_URL | Servidor, Preview/Development | URL pública completa do Auth dessa branch, normalmente terminando em /neondb/auth |
| AUTH_APP_ORIGIN | Servidor, Preview/Development | Origem HTTPS exata do Preview, sem barra final; opcional se VERCEL_URL/VERCEL_BRANCH_URL cobrir exatamente a origem usada |
| FINANCIAL_AUTH_ISSUER | Servidor | Origem exata documentada do Neon Auth, sem /neondb/auth |
| FINANCIAL_AUTH_AUDIENCE | Servidor | Audience efetiva dos tokens dessa instância; documentação atual indica a origem Auth |
| FINANCIAL_AUTH_JWKS_URL | Servidor | NEON_AUTH_BASE_URL + /.well-known/jwks.json |
| FINANCIAL_API_ENABLED | Servidor, somente Preview/Development | true somente na homologação autorizada; Production continua recusada pelo handler |
| VITE_FINANCIAL_REMOTE_ENABLED | Build, somente Preview/Development | true para mostrar login e utilizar a persistência remota; false preserva o modo local anterior |
| VITE_FINANCIAL_WORKSPACE_ID | Build, opcional | UUID público da organização para preencher o seletor; não concede permissão |
| VITE_ALLOW_LOCAL_FALLBACK | Build, opcional, default false | true permite escolher explicitamente armazenamento local isolado depois de autenticar |

A Vercel fornece VERCEL_ENV; valores aceitos pelo backend são preview/development. Não criar VITE_DATABASE_URL nem VITE_NEON_DIAGNOSTIC_TOKEN. O único pacote adicionado é o SDK oficial @neondatabase/auth, fixado em 0.7.0-beta. Suas dependências transitivas ficam no lockfile; componentes UI prontos não são importados.

Antes de habilitar flags, confirmar que o SDK 0.7.0-beta é compatível com o serviço habilitado na branch (baseado em Better Auth 1.7). Não existem credenciais nem acesso administrativo ao Neon/Vercel neste ambiente de execução para confirmar essas configurações.

## Vínculo administrativo

Um usuário precisa existir no Neon Auth, ter o e-mail verificado e ter vínculo explícito em biosaude.identity_memberships para o workspace selecionado. O emissor e subject devem corresponder exatamente ao JWT verificado. Usar permissões datasets:read/datasets:write e credit:read/credit:write conforme a função de cada usuário. O runtime nunca provisiona vínculos nem recebe biosaude_membership_admin.

A interface não oferece cadastro público ou autopromoção. Criar conta, verificar e-mail ou selecionar um UUID não concede acesso financeiro. O cadastro/provisionamento administrativo permanece fora do frontend. Não reutilizar usuários/sessões de lgc/public.

## Sessão e proxy

O cliente usa os métodos oficiais signIn.email, getSession, token e signOut. O proxy de mesma origem é /api/neon-auth/*, reescrito pela Vercel para /api/auth/proxy. Só permite sign-in/email (POST), sign-out (POST), get-session e token (GET), com destino fixo do servidor. Também permite os quatro POSTs de recuperação/verificação descritos em [Acesso inicial](ACESSO_INICIAL_NEON_AUTH.md), com callbacks fixos na mesma origem. Não proxy SQL, cadastro ou URLs arbitrárias.

O proxy preserva o protocolo do SDK (incluindo x-neon-auth-middleware e set-auth-jwt), limita cookies aos prefixos Neon/Better Auth, remove Domain e Partitioned e aplica Secure/HttpOnly/SameSite=Lax e Path restrito. Cookies __Host- mantêm Path=/ conforme exigência do navegador. POST exige origem confiável; requisições cross-site são recusadas. Não há logs de corpo, senha, token ou erro bruto. Logout limpa cookies locais mesmo se a revogação remota falhar; o aviso da falha é mostrado. JWT já emitido pode continuar válido até expirar, sujeito à verificação de vínculo em toda operação.

O SDK instalado possui cache de sessão que também intercepta /token. A opção de headers X-Force-Fetch é consumida internamente por essa versão para exigir uma consulta fresca; o header não é enviado ao upstream. O teste auth-sdk.test.ts usa o SDK real instalado e cobre a obtenção de JWT depois do login, evitando aceitar um cookie opaco ou um objeto de sessão no lugar do token. Não atualizar o SDK sem repetir esse teste. O canal global compartilhado do Better Auth é inicializado com transporte BroadcastChannel em memória antes do cliente: ele transmite apenas sinais de invalidação e não os objetos sessionData/JWT que o transporte localStorage padrão dessa versão incluiria. Esse ponto de integração é fixado à versão do SDK e validado também no navegador.

A CSP permanece connect-src 'self': não foi ampliada para domínios externos. O browser fala com o proxy e com a API da mesma origem, evitando a dependência de cookies de terceiros. No desenvolvimento local usar funções Vercel (por exemplo, fluxo já adotado pela equipe com localhost), configuração Development e origem localhost autorizada; vite preview sozinho só serve arquivos estáticos e não executa funções.

O usuário/organização/mode definem a vida do cliente HTTP. Logout, troca de usuário/organização e recarga invalidam respostas pendentes e remontam o dashboard. Não há token em localStorage/IndexedDB. Uma sessão é revalidada ao obter autorização, no foco e periodicamente. Sair em outra aba invalida a tela via BroadcastChannel.

## Persistência e concorrência

HttpDatasetRepository e HttpProposalRepository compartilham um cliente por sessão/organização. A interface usa as operações já existentes: GET active, POST validate/imports, GET versions/version, PUT/DELETE active, PATCH reviews e GET/POST proposals.

A importação envia source/mappings/reference/filename/confirm, não saldos calculados pelo cliente. A API normaliza novamente e gera seu próprio ID; a interface relê a posição canônica antes de informar sucesso. Revisões enviam notas no formato esperado pela API. Ativação usa versionId, sem reimportar ou regravar finanças. Histórico é paginado em metadados e carrega as versões pelo contrato existente.

ETags fortes são usados literalmente em If-Match. Escrita exige revisão já obtida por leitura. Não há retry automático de escrita. Respostas sem ETag, revisão alterada durante leituras, conflito 409/428 e falha de transporte em escrita impedem continuação silenciosa. Use Recarregar base para reconstruir o cliente e conferir o estado confirmado. Uma falha de transporte pode ocorrer depois do commit; por isso nunca reimportar automaticamente. Escritas concorrentes no mesmo cliente são recusadas enquanto a anterior está em andamento.

A API aceita até 3 MB de JSON de entrada e base normalizada. O frontend verifica o limite de entrada antes do envio e mostra erro específico. Um Excel de até 20 MB pode exceder esse limite depois da serialização; isso requer avaliação de carga separada, sem ampliar limites nesta entrega. Propostas e outras chamadas existentes continuam com as permissões e regras anteriores.

## Fallback

Com a flag remota desativada, o IndexedDB anterior permanece inalterado. Com modo remoto ativo não existe fallback automático por erro, falta de permissão ou indisponibilidade.

Se autorizado por VITE_ALLOW_LOCAL_FALLBACK, o usuário pode escolher Usar modo local isolado. Esse armazenamento usa um nome derivado por SHA-256 da origem, usuário e organização e não lê o banco legado biosaude-financeiro. Nenhuma base remota é copiada automaticamente para ele. O modo aparece explicitamente sem sincronização; retornar ao Neon recarrega do servidor e não envia bases locais. Limpar a sessão remove a tela/dados em memória, mas não apaga bases locais salvas deliberadamente no dispositivo. Perfis de navegador compartilhados continuam inadequados para dados financeiros; a separação por nome não é criptografia do IndexedDB.

## Homologação — ações humanas ainda necessárias

1. Conferir o commit do Preview e a branch Neon desenvolvimento. A vinculação automática GitHub/Vercel pode gerar Preview ao publicar a branch; não foi feito deploy manual.
2. Confirmar URL Auth, issuer, audience, JWKS, origem confiável e verificação de e-mail. Configurar somente Preview/Development pelo canal seguro.
3. Provisionar um usuário sintético e vínculo administrativo mínimo para uma organização de homologação. Não conceder papel administrativo ao runtime.
4. Habilitar as duas flags (servidor e build) somente no Preview após revisão. Manter fallback false até avaliação explícita.
5. Fazer login; usuário sem vínculo deve receber 403 e não ver bases locais antigas.
6. Importar a planilha sintética, conferir totais, confirmar e verificar que o ID/posição voltaram do servidor. Não usar dados financeiros reais nesta primeira validação.
7. Abrir outra sessão/dispositivo autorizado: confirmar mesma versão e totais. Conferir no banco por acesso administrativo somente leitura, sem expor dados ou conexão.
8. Atualizar uma base; conferir histórico e reativação. Revisar auditoria; criar apenas proposta draft. Testar duas sessões na mesma revisão: uma escrita deve conflitar, sem retry silencioso.
9. Revogar vínculo e testar nova operação; testar usuário de outra organização. Não deve haver acesso cruzado ou autopromoção.
10. Testar logout, troca de organização, retorno à tela e erro de rede; não pode haver troca automática para IndexedDB nem gravação duplicada após falha.
11. Revalidar os grants efetivos de biosaude_api_dev após habilitar o serviço Auth, incluindo eventuais privilégios PUBLIC ou funções novas do serviço. Não ampliar permissões do runtime nem revogar privilégios do legado automaticamente.
12. Confirmar que Production continua com flags desativadas e handlers bloqueados. Não usar /api/health para confirmar estado operacional: ele mantém sua resposta pública fixa por compatibilidade.

Não há lint configurado no repositório. A validação estática é feita por TypeScript e git diff --check; não foi instalado um linter nem apresentado typecheck como se fosse lint.

## Testes executados nesta entrega

- npm run test:unit: 129 aprovados, zero falhas, 8 ignorados (planilhas oficiais indisponíveis).
- Playwright no modo local: 84 aprovados, zero falhas, 24 ignorados (planilhas oficiais), em desktop/notebook/tablet/mobile.
- Navegador remoto sintético: 1 cenário aprovado, zero falhas. Usa o SDK real, proxy real com upstream Auth simulado, JWT Ed25519 real sintético, handler financeiro real e PostgreSQL PGlite descartável. Cobre importação pelo Excel, leitura em outra sessão do navegador, cookies de sessão, logout, ausência de JWT em mensagens localStorage, fallback explícito separado, troca de organização e revogação de vínculo.
- O teste de integração HTTP em Node também cobre revisão, histórico, ativação, desativação, propostas e conflito entre dois clientes independentes, usando o servidor HTTP e PostgreSQL descartável.
- Compilação normal e com flags remotas, typecheck da aplicação/servidor/testes e inspeção do bundle executados. git diff --check executado; não há configuração de lint.

Reprodução do cenário remoto isolado: `npm run test:remote:e2e`. Se o Chromium do Playwright não estiver instalado, apontar PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH para o Chromium existente da equipe. O comando não acessa Neon nem Vercel. Para regressão local após ele, executar novamente npm run build sem flags remotas antes do Playwright local.

Os resultados acima demonstram a integração com banco descartável; não comprovam o serviço Neon Auth ou o banco Neon reais. Essa última evidência depende dos passos de homologação externos e não foi inventada.
