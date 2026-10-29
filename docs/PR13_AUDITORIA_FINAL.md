# Auditoria final da PR #13 — Etapa 3 Neon

Data: 29/10/2026. Base de comparação: `main` em `ad9d073` (PRs #11 e #12 mescladas). Head inicial da PR: `dcd8335`, branch `feat/neon-financial-api`. A auditoria inclui todos os arquivos modificados pela PR e os contratos, adaptadores, migrações e proteções anteriores relacionados.

**Parecer: aprovada tecnicamente para merge mantendo a integração desativada. A correção desta auditoria integra o próprio branch da PR.** Não há aprovação para ativação da persistência ou uso em Production. Nenhum merge foi executado.

## Verificações

| Item | Evidência e resultado |
|---|---|
| JWT RS256 | `jose` verifica assinatura, algoritmo fixo, emissor, audience, expiração, emissão e nbf. Exige claims e subject válido. JWKS fixo no servidor; headers jku/x5u não são aceitos. Testes com assinaturas criptográficas sintéticas e casos negativos, sem provedor remoto. |
| Autorização | Vínculo exato por emissor + subject + workspace e permissão. Não confia em papel/workspace informado no token, header de usuário ou chave do diagnóstico. Verificação repetida na transação; revogação e expiração testadas. |
| Isolamento financeiro | Organização B preenchida com base sintética: A não lê nem altera sua versão, revisões ou posição. ID de versão de outra organização retorna 404 no escopo próprio; selecionar workspace sem vínculo retorna 403. SQL sem filtro de workspace continua isolado por RLS. |
| SQL/RLS | Três migrações aplicadas somente em PGlite descartável. Todas as tabelas de negócio têm RLS habilitado e forçado. Runtime de teste não é proprietário/superusuário/BYPASSRLS, não herda o papel de provisionamento, e as três funções de serviço não têm EXECUTE público. Migrações #11 anteriores intactas. |
| Provisionamento | Papel NOLOGIN separado, sem leitura de dados financeiros; mudanças de vínculo geram auditoria. Runtime não pode se promover. Testes SQL e inspeção dos privilégios/políticas confirmam esses controles locais. |
| ETag/If-Match | Revisão lida na mesma transação da consulta e incrementada atomicamente na mutação. Revisões antigas conflitam; erro desfaz gravação, revisão e auditoria do lote. Wildcard, ETag fraco, múltiplos valores e inteiros inseguros são rejeitados sem gravação. |
| Dashboard/IndexedDB | Nenhuma diferença em `src/`, layout, KPIs, filtros, gráficos, fórmulas ou seleção de repositório em relação à main. Regressão de navegador passou nos quatro tamanhos de tela. |
| Desativação/Production | Ausência da flag ou valor diferente de `true` desabilita a API. Production é bloqueada mesmo com flag ligada e headers tentando indicar Preview. Teste comprova 404 antes de autenticar ou ler DATABASE_URL. |
| Credenciais | Revisão dos arquivos, busca por padrões de chave privada/token/URI de banco e auditoria do bundle sem credenciais reais encontradas. As quatro URIs literais identificadas são explicitamente sintéticas, com domínio `.invalid` e senha fictícia marcada. Somente `.env.example` está versionado, com configurações vazias e flag falsa. Nenhum valor de ambiente secreto foi lido ou exibido. |
| Compatibilidade | Contratos existentes mantidos. Health, diagnóstico da PR #12, configurações Vercel e migrações #11 não foram alterados. Driver continua exclusivamente no servidor; inspeção do bundle aprovada. |

## Problema encontrado e corrigido

O validador numérico existente percorre os critérios presentes em cada nível de risco. Um objeto vazio de critérios não entrava nesse laço e podia passar na validação. O adaptador remoto aceitava e persistia esse rascunho incompleto.

**Reprodução executada:** POST de proposta sintética com `rules = { Moderado: {}, Alto: {}, Crítico: {} }` retornava **201**. O teste que exigia 400 falhou antes da correção. Isso não aprovava crédito, pois tanto a API quanto o SQL restringem o estado a `draft`, mas permitia armazenar uma política inválida.

**Correção:** `server/persistence/proposal-codec.ts` valida a estrutura completa de proposta/configuração, todos os campos de cada faixa e todos os fatores antes de chamar o mesmo `validateConfig` numérico. Rejeita campos inesperados, tipos de metadados inválidos e versão fora do tipo integer SQL, preservando o estado exclusivamente draft. O adaptador usa a proposta validada e clonada. Nenhum fator, limiar ou fórmula em `src/credito/policy.ts` foi alterado.

O teste de regressão agora confirma **400 PROPOSAL_INVALID**, sem proposta persistida e sem avanço de revisão, para regras vazias, campo obrigatório ausente e campo adicional indevido. Propostas completas continuam passando no round-trip.

Arquivos alterados pela auditoria:

- `server/persistence/proposal-codec.ts`: validação estrutural de rascunhos no servidor.
- `server/persistence/postgres-proposals.ts`: integração do validador antes da gravação.
- `tests/financial-api.test.ts`: seis testes adicionais de regressão e segurança.
- `docs/NEON_ETAPA_3.md`: resultados atualizados e referência ao parecer.
- Este relatório.

## Execução dos testes

Resultados finais, sem contar reexecuções duas vezes:

| Suíte | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Serviços, cálculos, autenticação, APIs e PostgreSQL descartável | 102 | 0 | 8 |
| Navegador: desktop, notebook, tablet e celular | 84 | 0 | 24 |
| **Total** | **186** | **0** | **32** |

Os **20 testes** de `financial-api.test.ts` estão incluídos nos 102, não somados novamente. Seis foram acrescentados nesta auditoria. Os 32 ignorados exigem as planilhas reais externas: suas variáveis foram removidas dos comandos para respeitar o uso exclusivo de dados sintéticos. A falha inicial foi intencionalmente reproduzida e corrigida; os números da tabela são da validação final.

Comandos:

```bash
env -u BIOSAUDE_TEST_WORKBOOK -u BIOSAUDE_UPDATED_WORKBOOK npm run test:unit
env -u BIOSAUDE_TEST_WORKBOOK -u BIOSAUDE_UPDATED_WORKBOOK \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run build
git diff --check
```

O build inclui typecheck do frontend/servidor e inspeção do bundle. O aviso preexistente sobre chunks grandes permanece, sem erro de compilação. A regressão de navegador valida a interface preservada; após a correção exclusivamente de servidor, a suíte de serviços e o build foram executados novamente.

O PostgreSQL descartável é o motor PGlite em memória: migrações, RLS, privilégios, transações e persistência/releitura são exercitados nele, sem DATABASE_URL real ou transporte TCP. O teste de duas requisições concorrentes verifica a precondição e o rollback nesse motor; não substitui validação multiconexão ou de carga no Neon.

## Pendências e limites para ativação

- Configurar e validar o provedor de identidade real com audience exclusiva da API e usuários autorizados.
- Confirmar conexão e persistência no Neon de desenvolvimento por acesso autorizado, sem repetir os testes de bypass já rejeitados.
- Revisar privilégios reais, separar proprietário/migrador/runtime, garantir NOBYPASSRLS e revisar criação/atribuição do papel administrativo antes de aplicar a migração 0003. Ela exige privilégio de criação de papel; sua aplicação não é automática.
- Provisionar os vínculos mínimos e validar revogação, isolamento e concorrência no ambiente real, com dados sintéticos.
- Implementar e validar o cliente HTTP dos contratos de repositório, login, expiração de token, paginação, conflitos e transporte de bases grandes. Entrada/dataset normalizado estão limitados a 3 MB; volume de respostas e limites da Vercel exigem validação antes de ativação.
- Manter `FINANCIAL_API_ENABLED=false`/ausente. O IndexedDB permanece ativo. Production continua bloqueada pelo código, independentemente da flag.

**Nenhuma consulta real ao Neon foi executada nesta auditoria. Não houve migração remota, dados reais importados, mudança na Vercel, deploy, merge ou ativação de persistência.** O parecer se limita ao merge seguro da preparação desativada.
