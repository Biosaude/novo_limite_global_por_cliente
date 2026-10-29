# Etapa 2 — Teste seguro de conectividade Neon

## O que muda

A PR acrescenta `POST /api/diagnostics/neon`, um diagnóstico técnico privado, independente de `/api/health`. A conexão usa a configuração e o driver de servidor preparados na PR #11. O diagnóstico executa **somente `SELECT 1 AS ok`**, em transação PostgreSQL **READ ONLY**, com timeout de 5 segundos.

Não há leitura de tabelas, parâmetros SQL fornecidos pelo usuário, `set_config` de organização, escrita, DDL, migrações, importação de dados ou ativação dos repositórios financeiros. `/api/health` continua com os mesmos métodos, respostas e comportamento. O frontend e o IndexedDB não foram alterados.

## Proteção da rota

- Disponível exclusivamente quando `VERCEL_ENV` é `preview` ou `development`.
- Em Production ou ambiente não identificado, retorna 404 sem consultar configuração de banco.
- Requer `NEON_DIAGNOSTIC_TOKEN`: chave aleatória de 32 bytes, codificada em **64 caracteres hexadecimais**. Ausente/inválida: rota desabilitada, 404.
- O operador envia a chave somente no header `Authorization: Bearer …`. A comparação usa `timingSafeEqual` sobre buffers de tamanho fixo.
- Chave ausente/incorreta: 401; nenhum acesso a `DATABASE_URL` ou ao driver.
- Após autorização, aceita somente POST sem corpo nem query string. Não aceita token, URL de banco ou consulta via parâmetros da requisição.
- As respostas e o CDN não podem armazenar o resultado em cache.
- Falhas de configuração, transporte, timeout ou resultado inesperado retornam um código técnico genérico, sem host, usuário, senha, URL, stack ou erro original do driver. Não há logs de configuração, headers ou exceções brutas.
- A chave não concede permissões financeiras: as portas remotas da Etapa 1 continuam negando acesso por padrão, e nenhuma API financeira foi adicionada.

A proteção de deploy da Vercel deve permanecer habilitada conforme a política do projeto. A chave do diagnóstico é uma proteção própria da aplicação, adicional a essa camada; não depende de presumir que todo Preview é privado.

## Configurações adicionais

`DATABASE_URL` já está configurada pelo responsável na Vercel para Preview e Development, apontando para a branch de desenvolvimento. Ela permanece apenas no servidor. O cliente de teste **não precisa da URL do banco** nem de sua senha.

É necessário acrescentar:

| Variável | Local | Uso |
|---|---|---|
| `NEON_DIAGNOSTIC_TOKEN` | Vercel **Preview e Development**, e arquivo privado do operador | Autorizar somente o diagnóstico de conexão |
| `VERCEL_ENV` | Variável de sistema da Vercel | Bloquear Production e ambientes não identificados; não vem da requisição |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Cliente operador, somente se necessário e autorizado | Passar pela proteção de deploy da Vercel para automação |

Nenhuma dessas chaves deve usar prefixo `VITE_`. O build bloqueia `VITE_NEON_DIAGNOSTIC_TOKEN`, além da proteção já existente para `VITE_DATABASE_URL`. O auditor de artefatos públicos também detecta o nome da nova chave. `.env.example` contém somente valores vazios; não há segredo padrão.

## Como executar com segurança no Preview

### 1. Criar a chave sem exibi-la em logs

Em um computador/ambiente autorizado do operador, com este branch instalado:

```bash
npm run db:diagnostic-key
```

O comando gera `.env.neon-diagnostic` com acesso restrito ao proprietário onde suportado e **não imprime a chave**. Ele não sobrescreve arquivo existente e nunca é executado automaticamente em instalação, build ou teste. O arquivo é ignorado pelo Git pelas regras `.env.*` existentes.

Abra esse arquivo somente pelo canal local seguro e copie **apenas o valor** de `NEON_DIAGNOSTIC_TOKEN` para a configuração de variáveis da Vercel, com escopo Preview e Development. Não envie o valor em chat, PR, terminal gravado, captura ou log. Não configure a chave como variável pública ou para Production.

### 2. Usar o Preview automático desta PR

Configure as variáveis antes de testar um novo Preview que contenha estas alterações. A integração Git/Vercel deve gerar o Preview automaticamente pelo fluxo normal da PR. Não é necessário fazer merge ou executar `vercel deploy`/`vercel --prod`.

Variáveis da Vercel são associadas à criação de cada deployment. Se a chave foi configurada depois de um Preview anterior, use um **novo Preview automático** que já incorpore a configuração; não presuma que ela entrou retroativamente no deployment antigo.

Copie a URL HTTPS raiz do Preview correspondente ao código desta PR, sem caminho, parâmetros, usuário ou senha. Confira no projeto Vercel que o domínio pertence ao seu deployment. A URL de Production não serve para este diagnóstico, pois Production é sempre bloqueada.

### 3. Se a proteção Vercel bloquear automação

Quando exigido pela política do projeto, obtenha a credencial autorizada de Protection Bypass for Automation na Vercel e adicione `VERCEL_AUTOMATION_BYPASS_SECRET` ao arquivo privado do operador. O cliente a envia somente pelo header oficial `x-vercel-protection-bypass`, nunca pela URL. Não desative a proteção e não envie essa credencial no chat.

Se o projeto não utiliza esse mecanismo ou já permite a requisição autorizada ao Preview, essa variável é dispensável. A chave `NEON_DIAGNOSTIC_TOKEN` continua obrigatória na aplicação em todos os casos.

### 4. Executar a consulta real

No mesmo ambiente local do operador:

```bash
npm run db:probe:preview -- https://seu-preview.vercel.app
```

Substitua o domínio pela URL real do seu Preview. O comando lê a chave do arquivo privado e faz um POST autenticado, sem colocar o segredo nos argumentos do processo. Não segue redirecionamentos e aceita somente HTTPS em domínio `.vercel.app`; por isso, use o domínio canônico do Preview, não um domínio personalizado ou link com parâmetros.

O resultado tem somente `success`, código técnico, status HTTP e, quando confirmado, horário da execução. Sai com código 0 apenas quando o servidor confirmou a consulta de leitura; falhas saem com código 1. Não imprime corpo remoto bruto ou mensagens internas.

**Só um resultado `success: true` com `code: NEON_CONNECTIVITY_OK` desta execução real confirma a conexão.** Build, health check, configuração sintaticamente válida e testes com mocks não confirmam acesso ao Neon.

No servidor, a resposta 200 é criada somente depois de o driver retornar exatamente uma linha com `ok = 1`. Ela inclui `connected: true`, `readOnly: true`, horário e a indicação de que a persistência permanece local e a API financeira desabilitada. Isso não afirma que o esquema financeiro existe ou está migrado, pois nenhuma tabela é consultada.

### 5. Encerrar o uso do diagnóstico

Trate a chave como temporária. Revogação/rotação precisa considerar os Previews já criados, pois mudar a variável do projeto não altera retroativamente o ambiente de deployments existentes. Aplique a política de expiração/revogação de Previews do projeto e proteja ou remova o arquivo privado do operador quando não for mais necessário. Esta entrega não executa operações de deploy, exclusão ou configuração na Vercel.

## Respostas e investigação sem expor credenciais

| Resultado | Interpretação |
|---|---|
| `DIAGNOSTIC_TOKEN_MISSING_OR_INVALID` no cliente | Chave local ausente ou fora do formato; nenhuma requisição enviada |
| 404 / `NOT_FOUND` | Diagnóstico desabilitado, chave não configurada no deploy, ambiente não permitido ou Preview sem a rota nova |
| 401 / `UNAUTHORIZED` | A chave do operador não corresponde à configuração do servidor |
| 401/403 com HTML / `PREVIEW_RESPONSE_NOT_JSON` | Pode ser a proteção da Vercel antes de alcançar a função; verifique o acesso autorizado |
| 405 | Utilize POST pelo cliente; abrir o endereço na barra do navegador faz GET |
| 400 / `INPUT_NOT_ALLOWED` | Remova corpo e query string; nunca envie SQL ou credenciais na URL |
| 503 / `NEON_CONNECTIVITY_UNAVAILABLE` | Não foi possível confirmar a leitura; verifique no canal seguro a configuração, TLS, disponibilidade/rede e permissão de conexão |
| 200 / `NEON_CONNECTIVITY_OK` com sucesso completo | A consulta real retornou 1; persistência financeira continua local |

A validação de configuração da PR #11 continua disponível por `npm run db:check` em ambiente autorizado, sem realizar consulta. Não habilite logs verbosos de headers/variáveis para investigar falhas.

## Validação desta entrega

Resultado automatizado executado nesta entrega:

- **80 testes de serviços/cálculos aprovados**, incluindo os **15 testes novos de conectividade**; zero falhas e zero testes ignorados nessa seleção.
- **108 testes de navegador aprovados**, cobrindo desktop, tablet e celular, com importação das duas planilhas oficiais em contextos locais de teste.
- **188 testes distintos aprovados** no conjunto selecionado. Os 15 testes novos também foram executados separadamente antes da regressão e não são contados duas vezes.
- `npm run typecheck`: aprovado para frontend e servidor.
- `npm run build` (executado por `test:e2e`): aprovado, incluindo a inspeção do bundle público sem configuração/driver de banco. O Vite mantém o aviso sobre chunks grandes já existentes; não houve erro de compilação.
- `/api/health`, frontend, fórmulas, repositórios locais e migrações sem alterações no diff.

Os testes novos usam URLs e chaves sintéticas e simulam o transporte HTTP do driver Neon. Validam a consulta exata, header de transação READ ONLY, sinal de timeout, autorização anterior à configuração, bloqueio de Production, erros sem credenciais/logs, health preservado, cliente seguro, geração privada da chave e HTTP local protegido. Não são uma consulta real ao Neon.

A regressão de serviços exclui expressamente `tests/neon-postgres.test.ts`, a suíte da Etapa 1 que aplica SQL em PostgreSQL descartável. **Nenhuma migração ou DDL foi executada nesta etapa, nem mesmo por essa suíte em memória.** As demais regressões mantêm leitura/normalização dos arquivos e importações apenas em contextos de navegador de teste isolados, sem upload ao Neon ou alteração de dados existentes.

Comandos principais:

```bash
npm run test:connectivity
npm run typecheck
npm run test:e2e
```

Para reproduzir a seleção de serviços sem executar a suíte de migrações, disponibilize as duas planilhas de teste pelos caminhos locais `BIOSAUDE_TEST_WORKBOOK` e `BIOSAUDE_UPDATED_WORKBOOK` e execute:

```bash
python3 - <<'PY'
from pathlib import Path
import subprocess
files = sorted(str(p) for p in Path("tests").glob("*.test.ts")
               if p.name != "neon-postgres.test.ts")
subprocess.run(["node", "--import", "tsx", "--test", *files], check=True)
PY
```

O `npm test` geral do repositório ainda inclui a suíte SQL histórica da Etapa 1; ela não foi executada nesta validação. O gerador de chave foi testado somente em diretório temporário isolado, sem criar uma chave real de operador no projeto.

**Situação da consulta real:** não executada neste ambiente de trabalho. A `DATABASE_URL` da Vercel não está disponível aqui; não foram obtidas ou solicitadas credenciais. A execução real depende de um Preview com esta PR, chave configurada e cliente operador autorizado. Não foi declarado que o Neon está conectado.

## Arquivos

- `server/db/client.ts`: sonda fixa READ ONLY com o driver existente, separada das transações financeiras.
- `server/diagnostics/neon-connectivity.ts`: autorização, ambiente, método, respostas e falhas sanitizadas.
- `api/diagnostics/neon.ts`: rota privada do diagnóstico; `api/health.ts` permanece intacto.
- `scripts/check-neon-preview.ts`, `neon-preview-client.ts`: cliente seguro para o Preview.
- `scripts/diagnostic-key.ts`: geração explícita do arquivo privado, sem impressão/sobrescrita.
- `.env.example`: novo nome de variável, com valor vazio.
- `build/server-boundary.ts`, `scripts/check-client-bundle.ts`: proteção da nova chave no navegador.
- `package.json`, `tsconfig.server.json`: comandos e checagem do servidor.
- `tests/neon-connectivity.test.ts`: testes sem banco ou dados reais.
- `README.md`, este documento: operação segura e evidências.

Nenhuma mudança em frontend, KPIs, filtros, gráficos, fórmulas, IndexedDB, migrações, esquema ou registros financeiros. Nenhum merge ou deploy manual foi realizado.
