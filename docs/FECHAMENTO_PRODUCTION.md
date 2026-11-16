# Fechamento de Production — 16/11/2026

## Base e escopo

Branch local `fix/production-closeout`, criada da `origin/main` em `e898269772cda7b52b6ec1530244d931a24218ad`. Os merges #20 (`0603514`), #21 (`6ba1957`), #23 (`83a9d62`) e #22 (`e898269`) pertencem ao histórico dessa main. A consulta de refs remotas não encontrou `fix/neon-production-runtime-security`. A API GitHub respondeu Forbidden; a confirmação de integração é pelo grafo Git e pelos commits de merge, não por metadados atuais da API.

Nenhuma alteração em componentes, estilos, cálculos, contratos de dados ou dependências. Nenhum SQL Neon, alteração Vercel, push, PR remoto, merge ou deploy foi executado.

## Correções

- `server/config.ts`: Production exige `biosaude_runtime_prod` na URL, mantendo TLS obrigatório, configuração exclusivamente no servidor e erros sem credenciais. Preview/Development preservados.
- `server/db/client.ts`: cada transação de Production verifica a sessão autenticada antes de definir o workspace ou acessar dados. Recusa usuário divergente, superuser/BYPASSRLS/CREATEDB/CREATEROLE/REPLICATION, membership em outras roles, CREATE no schema, propriedade de objetos/funções, escrita em memberships/migrações e TRUNCATE/TRIGGER nas tabelas e ausência de RLS forçado ou de alguma das 20 políticas restritivas esperadas. A verificação e as operações financeiras fazem parte da mesma transação serializável.
- `scripts/neon-production-login-boundary.sql`: versiona as 20 políticas explícitas fornecidas pelo operador, mantendo nomes, tabelas, expressões e workspace do anexo. Reforça os prechecks de role e compara integralmente as definições das 21 políticas anteriores antes do commit. Espera 41 políticas, sendo 20 novas RESTRICTIVE/ALL/PUBLIC. Recusa reaplicação.
- `scripts/neon-production-runtime-grants.sql`: plano transacional de grants diretos mínimos para as operações dos repositórios existentes. Não cria role, senha, usuário ou membership. Somente `active_datasets` admite DELETE; UPDATE apenas nos três estados mutáveis; histórico não recebe UPDATE/DELETE, memberships são somente leitura e não há DDL/TRUNCATE/TRIGGER. Não modifica grants PUBLIC nem altera roles herdadas: configuração perigosa causa bloqueio.

Os scripts SQL continuam marcados **HOMOLOGAÇÃO**, não são executados pelo aplicativo e não foram adicionados ao executor de migrações 0001–0003. O UUID `6aa0ef36-66d5-4b16-8acc-2846586458ec` e a identificação da branch no cabeçalho provêm do anexo; não são evidência do destino de Production. Não executar em Production sem confirmar destino/workspace e obter autorização específica.

O arquivo anexado já declara ser uma revisão do bloco que falhou. A versão anterior com erro `42601`, o “bloco 1 original aprovado” e o “bloco 3 original” citados no anexo não foram fornecidos. Não se atribui uma causa ao erro anterior nem se afirma ter recuperado esses blocos. A entrega valida integralmente a revisão fornecida com os pre/postchecks adicionais; nenhuma política foi inventada para substituí-la.

## Reprodução da validação

Pré-requisitos: Node >=22.12, dependências via `npm ci`, Chromium e Poppler. Docker é necessário apenas para a suíte PostgreSQL nativa. Na raiz do checkout:

```sh
npm run test:unit
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npx tsx --test tests/production-security.postgres.ts
```

O segundo comando inclui TypeScript frontend/servidor, build Vite, verificação do bundle sem configuração de banco e execução das APIs emitidas em Node ESM. O terceiro usa imagem PostgreSQL 18 fixada por digest, container sem rede e sem portas publicadas; remove o container no fim. Usa migrações reais, duas organizações sintéticas e login efetivo como runtime (não apenas SET ROLE como administrador). Inclui 21 → 41 políticas, preservação integral das originais, isolamento nas 20 tabelas, grants, sessão com privilégios indevidos, reaplicação e rollback por erro sintático 42601 no meio do arquivo, falha de postcondição e operação financeira negada. Somente durante o teste de isolamento há SELECT temporário nas quatro tabelas não utilizadas pelo runtime; depois os grants mínimos são reaplicados.

Os testes de JWT/autorização existentes cobrem assinatura RS256/EdDSA, issuer/audience, expiração, claims obrigatórios, recusa de jku/x5u, vínculo ausente/revogado/expirado, permissões, organização divergente, revisão e concorrência. Usam PostgreSQL embarcado descartável e provedores sintéticos; não comprovam autenticação real no Neon.

## Condições objetivas para liberação remota

| Item | Evidência local e requisito remoto restante |
| --- | --- |
| `DATABASE_URL` | Código exige TLS e usuário runtime em Production; conexão, senha e privilégios reais não verificados. Aplicar/testar grants e políticas somente após aprovação no destino confirmado. |
| Neon Auth | Proxy existente exige `AUTH_PRODUCTION_ENABLED=true`, `NEON_AUTH_BASE_URL` HTTPS do Neon e `AUTH_APP_ORIGIN` exata. Domínio confiável, identidades, verificação de e-mail e entrega real de mensagens continuam exigindo evidência do provedor. |
| Flags financeiras | `FINANCIAL_PRODUCTION_ENABLED=true` e `FINANCIAL_API_ENABLED=true` são obrigatórias no servidor; não substituem JWT, membership ou RLS. Não alteradas. |
| Build | `VITE_AUTH_ENABLED=true`, `VITE_FINANCIAL_REMOTE_ENABLED=true`, `VITE_ALLOW_LOCAL_FALLBACK=false` e workspace confirmado para Production. Não promover build Preview com outros valores. |
| JWT | Confirmar issuer/audience/JWKS do Auth escolhido em `FINANCIAL_AUTH_ISSUER`, `FINANCIAL_AUTH_AUDIENCE`, `FINANCIAL_AUTH_JWKS_URL`; nenhuma confiança é obtida de headers do token. |
| `identity_memberships` | Provisionamento administrativo separado por workspace + issuer + subject reais; cadastro Auth não concede acesso financeiro. Runtime não provisiona membros. |
| Legado e atual | `public.lg_*` não equivale a `Dataset`. Exigir workbook original ou payload de origem/mapeamentos comprovadamente completos, conciliação por centavos/contagens/alertas e validação de leitura pelo aplicativo antes de ativar. Não foi inventado conversor nem dataset. |
| Vercel | `vercel.json` já define Vite/dist, headers de segurança e proxy Auth. Variáveis efetivas, build/deploy real e caminho HTTP em Production não verificados nesta execução. |

Não há variáveis de aplicação Neon/Vercel/financeiras presentes nesta máquina; nenhuma URL privada foi lida ou utilizada. O anexo e o histórico de documentação não comprovam o estado remoto atual. A documentação de legado registra 5.099 linhas, 2.376 alertas e diferença contábil de R$ 972,00 que não deve ser corrigida artificialmente. Sem origem privada e inventário/reconciliação autorizados, a migração financeira real permanece bloqueada; o desenvolvimento e os testes locais estão disponíveis.

Para publicação, permanecem a confirmação do destino/workspace e das configurações reais, o material privado necessário à conciliação e a aprovação específica das ações remotas. O conteúdo de um único PR de fechamento é preparado localmente; abertura depende de autorização.

## Resultados desta execução

- Testes unitários: **182 aprovados, 9 ignorados, zero falhas**. Ignorados dependem de planilhas externas.
- Build padrão: TypeScript frontend/servidor, Vite, separação cliente/servidor e runtime Node ESM aprovados.
- Navegador padrão: **88 aprovados, 52 ignorados, zero falhas**, em desktop/notebook/tablet/mobile. Os builds específicos abaixo exercitam separadamente os casos Auth/remotos ignorados nesse modo.
- PostgreSQL **18.7** nativo: **8 aprovados, zero ignorados/falhas**, incluindo os cenários de RLS e rollback descritos acima. Container descartado.
- Production Auth, dados remotos desligados: **8 aprovados**, desktop/mobile, incluindo primeiro acesso, recuperação e verificação com provedor simulado.
- Preview remoto: **5 aprovados**, desktop, incluindo SDK, importação, recarga em outra sessão, revogação e isolamento com PostgreSQL embarcado sintético.

Comparação textual confirmou as **20 instruções CREATE POLICY idênticas ao anexo**. SHA-256 de `scripts/neon-production-login-boundary.sql`: `94bf06149de472b01fd3c371bfeae91e0bedd84fe072be171399687fb76c0b8c`.

Para repetir os builds Auth/remotos e de workspace, usar a matriz de flags e comandos documentada em [LOGIN_UNICO_PRODUCTION.md](LOGIN_UNICO_PRODUCTION.md#validação-para-revisão). Todos os provedores, tokens, organizações e dados desses testes são sintéticos. Os resultados não comprovam configuração ou dados de Production. Avisos de chunks/dependências no Vite não impediram os builds e não motivaram mudanças de layout/dependências.
- Workspace de Production vazio: **1 aprovado**, sem fallback silencioso para desenvolvimento.
- Workspace de Production configurado com UUID sintético: **1 aprovado**, enviando somente o UUID do build. Os dois builds incluíram novamente TypeScript e verificação de runtime/bundle; zero falhas.
- O build local padrão anterior foi preservado e restaurado após a matriz, evitando deixar um artefato com configuração sintética de Production no checkout.
