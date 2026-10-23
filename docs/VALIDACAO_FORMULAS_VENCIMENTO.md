# Correção das fórmulas de dias e auditoria

## Planilhas reais conferidas

A nova base enviada, **Modelo_Base_Limite_Global_Biosaude.xlsx**, foi inspecionada e importada efetivamente. Contém **5.212 registros**: 1.632 A Vencer, 793 Vencidos e 2.787 Recebidos. Os metadados e os caches são consistentes com **23/10/2026**, referência usada nos testes dessa extração; o último recebimento é de 22/10/2026. A data deve ser confirmada pelo administrador na importação, sem inferência automática pelos caches.

Das 2.425 fórmulas de dias, **2.414** correspondem à regra oficial. As outras **11**, em **F2:F12 de A Vencer**, contêm `E…-TODAY()+1`. Esse acréscimo não faz parte da fórmula solicitada: são advertências legítimas mantidas. O sistema calcula os dias pelas datas, mas não altera o conteúdo original da planilha. Para alinhar essas células à regra, use `=E2-HOJE()` em F2 e copie até F12.

Também foram testadas a base anterior **Faturamento A Vencer, Vencido e Faturado.xlsx**, posição de **19/10/2026**, com 5.099 registros, e uma cópia de teste em memória dessa base com as fórmulas oficiais novas sem cache. Essa cópia altera somente as expressões de F nas duas primeiras abas e seus caches; não modifica valores financeiros, datas ou identificações. Os dois arquivos privados permanecem fora do Git.

O modelo gerado pelo próprio dashboard inclui as fórmulas solicitadas, sem `+1`, e foi baixado e aberto nos testes de navegador.

## Regras antigas e novas

| Situação | Antes | Agora |
|---|---|---|
| A Vencer | Dias informados comparados com referência − vencimento | Vencimento − referência; valores a partir de zero pertencem temporalmente a A Vencer |
| Vencidos | Cache comparado com referência − vencimento | Referência − vencimento; atraso somente quando positivo |
| Fórmula reconhecida sem cache | Dependência do resultado salvo, sem reconhecimento da regra | Recalcula pelas datas, sem advertência por cache ausente |
| Cache de outra data | Podia gerar diferença de dias | Preservado como dado original, sem servir de critério para fórmulas reconhecidas |
| Número manual | Comparação com uma única convenção | Comparação com a convenção correta da aba; diferenças reais continuam auditadas |
| Fórmula incompatível/célula incorreta | Sem validação específica da expressão de dias | Advertência específica, mesmo se o cache coincidir com o esperado |
| Referência inicial | Data histórica fixa no código | Data da posição ativa ou sugestão do dia brasileiro, a confirmar na importação |

## Interpretação restrita, sem execução de fórmulas

O reconhecedor aceita apenas uma subtração entre a célula de vencimento mapeada **da mesma linha** e `TODAY()`/`HOJE()`, na ordem exigida pela categoria:

- A Vencer: `E2-TODAY()` ou `E2-HOJE()`.
- Vencidos: `TODAY()-E2` ou `HOJE()-E2`.

O `=` inicial, capitalização, espaços e referências absolutas são tratados. O endereço aceito acompanha o mapeamento de vencimento: não é presumido que uma coluna reorganizada continue sendo E. Referências a outra coluna, outra linha, outra aba, arquivos externos e expressões diferentes geram advertência. Não há `eval`, interpretador genérico ou execução de funções Excel.

Fórmulas compartilhadas são resolvidas a partir da expressão de origem, com deslocamento relativo de linha/coluna e respeito a `$`. Uma trava na linha incorreta é advertida. A expressão original, o vínculo compartilhado e o cache continuam preservados nas células de origem.

O registro armazena separadamente o número/cache informado e a interpretação dos dias (tipo, expressão reconhecida, referência e valor calculado). O detalhamento original mostra ambos. A auditoria também verifica se os dias recalculados e sua referência são consistentes; não há supressão geral de ocorrências.

A recuperação OOXML mantém resultados zero verdadeiros e passa a distinguir `<v/>` vazio de zero. Regras de fórmulas em valores monetários e datas não foram relaxadas: esses campos continuam dependentes de resultado salvo válido, com advertência e bloqueio quando aplicável.

## Referência atual e histórica

A única referência usada para dias, faixas e aging é a **data da posição financeira confirmada na importação**, já mostrada no dashboard. Nenhum indicador usa silenciosamente o relógio ou o cache de `HOJE()`.

- **Posição atual:** na ausência de posição ativa, o campo existente sugere a data corrente em `America/Sao_Paulo`. O administrador deve confirmar que a extração representa essa data. O valor só é aplicado após validação e confirmação.
- **Posição histórica:** informar a data histórica ou manter a data da posição ativa. Ela permanece fixa após recarregar a página, avançar o relógio ou restaurar uma versão anterior.
- Não foi adicionado um modo que envelheça automaticamente saldos antigos. Uma análise atualizada exige uma extração coerente e confirmação explícita da referência. A correção não transfere saldos entre categorias nem reconstrói posições passadas.

Aging médio continua sendo `Σ(saldo vencido × dias vencidos na referência) / Σ saldo vencido`, por registro, sem cache e com as cinco faixas preservadas. Vencimento na referência tem zero dias e não é atraso. Categorias de origem incompatíveis com aquela referência continuam preservadas e advertidas.

## Alertas conferidos

| Caso executado | Alertas de dias/fórmulas | Demais advertências | Erros bloqueantes |
|---|---:|---:|---:|
| **Nova planilha real de 23/10/2026** | **11 incompatibilidades com `+1`** | **0** | **0** |
| Base anterior de 19/10/2026, fórmula antiga | 2.348 de fórmula incompatível | 6 | 0 |
| Cópia de teste, novas fórmulas sem cache | **0** | **6** | **0** |
| Arquivo sintético válido, novas fórmulas sem cache | 0 | 0 | 0 |
| Arquivo sintético com coluna incorreta na fórmula | 1 de referência incorreta | 0 | 0 |

Na **nova planilha real**, a reprodução independente da antiga comparação de cache com `referência − vencimento` gera **1.632 alertas de dias em A Vencer**: 1.621 em fórmulas válidas e 11 nas expressões com `+1`. A correção elimina os **1.621 falsos positivos**, mantém **11 advertências legítimas** sobre as fórmulas incompatíveis e não encontra erros bloqueantes. As outras 793 fórmulas de Vencidos são reconhecidas corretamente.

Na cópia de teste da base anterior, **2.348 advertências de dias deixam de ocorrer**, sem ocultar as **6 advertências legítimas**: cinco títulos de A Vencer com vencimento já ultrapassado na data histórica e uma sobreposição de cliente/título entre categorias, que pode representar recebimento parcial. A fórmula antiga do original não é declarada correta nem tem seu alerta simplesmente escondido.

Datas inválidas, falta de informações obrigatórias, dias manuais inconsistentes, valores inválidos/negativos e ocorrências de duplicidade/sobreposição continuam nos testes e na auditoria. Coincidência de título não é automaticamente comprovante de duplicidade financeira e não provoca exclusão de linha.

## Conciliação financeira preservada

| Indicador | Nova base real — 23/10/2026 | Base anterior e cópia — 19/10/2026 |
|---|---:|---:|
| Registros | **5.212** | 5.099 |
| A Vencer | **R$ 24.950.832,48** | R$ 25.711.247,24 |
| Vencidos | **R$ 11.105.739,72** | R$ 10.575.015,21 |
| Exposição Financeira Total | **R$ 36.056.572,20** | R$ 36.286.262,45 |
| Recebido YTD | **R$ 57.902.017,98** | R$ 56.999.819,30 |
| Aging médio | **401,31 dias** | 423,74 dias |
| Concentração acima de 180 dias | **63,59%** | 67,51% |

Todos os registros são preservados. Os valores diferentes entre as duas colunas vêm de **extrações diferentes**, sem misturar datas/versões. A leitura de cada arquivo concilia com o script independente Python/openpyxl/Decimal `scripts/validate_aging_reference.py`, por cabeçalhos, sem usar os caches de dias. O script aceita uma referência opcional: `python scripts/validate_aging_reference.py /caminho/privado/base.xlsx 2026-10-23`.

Na nova base, as cinco faixas somam exatamente R$ 11.105.739,72: 1–30 dias, R$ 1.436.185,41; 31–60, R$ 298.751,43; 61–90, R$ 509.907,51; 91–180, R$ 1.798.315,50; acima de 180, R$ 7.062.579,87. Todos os 793 registros vencidos são elegíveis à ponderação. O aging independente não formatado é **401,3115266607382727316429490 dias**. A correção não redefine métricas monetárias ou identidade de clientes/representantes.

## Modelo baixável e bases salvas

O download mantém o nome `Modelo_Base_Limite_Global_Biosaude.xlsx`, as três abas e seus cabeçalhos. F2 das duas primeiras abas contém, respectivamente, `E2-TODAY()` e `TODAY()-E2`, sem cache inventado. O Excel traduz os nomes de função na interface local. Uma nota orienta copiar a fórmula para as próximas linhas, e o arquivo solicita recálculo ao abrir.

A célula de orientação F2 não constitui um registro financeiro: uma linha contendo somente a fórmula reconhecida de dias, sem quaisquer outros dados, é desconsiderada na normalização, mas permanece na origem. Uma linha parcialmente preenchida com cliente, valor ou data continua sendo validada normalmente. O modelo sem registros reais não pode ser ativado como base.

Ao carregar uma base já salva, somente a análise de dias é reavaliada em memória pelos dados originais e pela referência existente. Não há migração ou gravação automática. Identificador, datas de importação/posição, originais, valores, categorias e justificativas são preservados; as demais ocorrências não são removidas. O histórico anterior continua separado por posição.

## Arquivos modificados

- `src/importacao/daysFormula.ts`: reconhecimento restrito de fórmulas e referências compartilhadas.
- `src/importacao/dayAnalysis.ts`: interpretação dos dias e reavaliação somente dos alertas relacionados em bases locais antigas.
- `src/importacao/normalize.ts` e `formulaCache.ts`: integração da leitura, célula de orientação e distinção cache vazio/zero.
- `src/importacao/template.ts`: fórmulas oficiais e orientação em F2.
- `src/auditoria/audit.ts`: convenção por categoria e validação de integridade dos dias recalculados.
- `src/domain/types.ts` e `dates.ts`: rastreabilidade dos dias e sugestão da data civil brasileira.
- `src/persistencia/repository.ts`: reavaliação de dias na leitura, sem mudança de versão do armazenamento.
- `src/components/ImportManager.tsx` e `DetailDialog.tsx`: referência sugerida e informações rastreáveis no detalhamento existente; sem CSS/layout novo.
- Testes novos de fórmulas, fixtures e navegador; ajustes das expectativas existentes do modelo e das referências explícitas; README e relatórios.

## Testes executados

Execução com as duas planilhas reais disponíveis: **42 testes de serviços e 72 testes de navegador aprovados**, sem falhas ou testes ignorados; compilação TypeScript/Vite aprovada. Total: **114 testes distintos**.

Os casos abrangem as duas ordens de subtração, português/inglês, `=` e referências absolutas, fórmulas compartilhadas, caches ausentes/zero/desatualizados, números manuais, endereços incorretos, expressões não permitidas, datas inválidas, vencimento hoje/amanhã/ontem, limites de 30/60/90/180 dias e acima de 180, ponderação por saldo, integridade dos dias recalculados, data histórica, dia brasileiro e persistência sem mudança de referência. A nova planilha real e a cópia da base histórica com fórmulas novas são importadas e ativadas nas quatro resoluções (desktop, notebook, tablet e celular), com monitoramento de erros JavaScript e requisições externas. Os fluxos anteriores de crédito, histórico, auditoria e atualização da base também foram executados.

```sh
BIOSAUDE_TEST_WORKBOOK='/caminho/privado/Faturamento A Vencer, Vencido e Faturado.xlsx' \
BIOSAUDE_UPDATED_WORKBOOK='/caminho/privado/Modelo_Base_Limite_Global_Biosaude.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

O script de fixture modifica somente as células F de uma cópia em memória durante os testes. O arquivo original não é salvo com modificações, e a cópia não é uma nova extração financeira. Ela complementa os testes de cache ausente; a nova planilha enviada é testada também sem alteração de suas células.

## Como validar a importação atualizada

1. Execute `npm ci` e `npm run dev`, e abra o endereço indicado pelo Vite.
2. Em **Gerenciar Base**, use **Baixar Modelo da Base** e confira F2 das duas primeiras abas.
3. Preencha as três abas com dados reais. Copie as fórmulas de F para cada registro das duas primeiras abas. Não confunda `Vr.aberto` e `Vr.recebido` com o nominal.
4. Clique em **Selecionar Nova Base**, informe a data correspondente à extração e valide o mapeamento. Para a nova planilha enviada, use **23/10/2026**; para a base histórica anterior, use **19/10/2026** explicitamente.
5. Na nova base, confira as 11 advertências de `+1` em F2:F12 de A Vencer, os valores e a referência. Elas não bloqueiam o uso dos saldos válidos. Confirme o uso/substituição e clique em **Atualizar Dashboard**.
6. Consulte os KPIs e o aging. Na Auditoria, fórmulas novas válidas não devem gerar alerta de cache/dias; inconsistências reais continuam listadas. No detalhamento original, confira expressão, cache e dias recalculados.
7. Recarregue uma base salva ou restaure uma posição anterior: sua data-base e seu aging permanecem os mesmos.

Sem deploy, alterações no Neon, migrações, alterações de permissões/autenticação ou mudanças no layout/filtros.
