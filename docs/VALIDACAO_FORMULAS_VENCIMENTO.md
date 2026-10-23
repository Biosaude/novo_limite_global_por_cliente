# Correção das fórmulas de dias e auditoria

## Arquivos de referência e limite da validação

O anexo Excel disponível é **Faturamento A Vencer, Vencido e Faturado.xlsx**, posição de **19/10/2026**, com 5.099 registros. Ele foi inspecionado antes da implementação. Suas 2.348 células de dias contêm a fórmula antiga `IF(TODAY() > D…, TODAY() - E…, 0)`, incompatível com as novas regras.

O arquivo externo chamado `Modelo_Base_Limite_Global_Biosaude.xlsx` com as fórmulas novas **não foi anexado nesta solicitação**. A validação usa o original disponível e uma **cópia de teste em memória**, alterando somente as expressões de F nas duas primeiras abas para as fórmulas oficiais novas e removendo seus caches. Nenhum valor financeiro, cabeçalho, data, identificação ou outra fórmula é modificado nessa cópia. Os arquivos privados não foram adicionados ao Git.

O modelo gerado pelo próprio dashboard passa a incluir as fórmulas solicitadas e foi baixado e aberto nos testes de navegador.

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
| Original disponível, fórmula antiga | 2.348 de fórmula incompatível | 6 | 0 |
| Cópia de teste, novas fórmulas sem cache | **0** | **6** | **0** |
| Arquivo sintético válido, novas fórmulas sem cache | 0 | 0 | 0 |
| Arquivo sintético com coluna incorreta na fórmula | 1 de referência incorreta | 0 | 0 |

Na cópia de teste, **2.348 advertências de dias deixam de ocorrer**, sem ocultar as **6 advertências legítimas**: cinco títulos de A Vencer com vencimento já ultrapassado na data histórica e uma sobreposição de cliente/título entre categorias, que pode representar recebimento parcial. A fórmula antiga do original não é declarada correta nem tem seu alerta simplesmente escondido.

Datas inválidas, falta de informações obrigatórias, dias manuais inconsistentes, valores inválidos/negativos e ocorrências de duplicidade/sobreposição continuam nos testes e na auditoria. Coincidência de título não é automaticamente comprovante de duplicidade financeira e não provoca exclusão de linha.

## Conciliação financeira preservada

| Indicador | Original e cópia de teste |
|---|---:|
| Registros | 5.099 |
| A Vencer | R$ 25.711.247,24 |
| Vencidos | R$ 10.575.015,21 |
| Exposição Financeira Total | R$ 36.286.262,45 |
| Recebido YTD | R$ 56.999.819,30 |
| Aging médio em 19/10/2026 | 423,74 dias |
| Concentração acima de 180 dias | 67,51% |

Todos os registros são preservados. Somas e faixas do original e da cópia são comparadas por código; os resultados também conciliam com o script independente Python/openpyxl/Decimal `scripts/validate_aging_reference.py`, que lê o original por cabeçalhos. A correção não redefine métricas monetárias ou identidade de clientes/representantes.

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

Execução com a planilha oficial disponível: **41 testes de serviços e 68 testes de navegador aprovados**, sem falhas ou testes ignorados; compilação TypeScript/Vite aprovada. Total: **109 testes distintos**.

Os casos abrangem as duas ordens de subtração, português/inglês, `=` e referências absolutas, fórmulas compartilhadas, caches ausentes/zero/desatualizados, números manuais, endereços incorretos, expressões não permitidas, datas inválidas, vencimento hoje/amanhã/ontem, limites de 30/60/90/180 dias e acima de 180, ponderação por saldo, integridade dos dias recalculados, data histórica, dia brasileiro e persistência sem mudança de referência. A cópia da planilha oficial com fórmulas novas é importada e ativada nas quatro resoluções (desktop, notebook, tablet e celular), com monitoramento de erros JavaScript e requisições externas. Os fluxos anteriores de crédito, histórico, auditoria e atualização da base também foram executados.

```sh
BIOSAUDE_TEST_WORKBOOK='/caminho/privado/Faturamento A Vencer, Vencido e Faturado.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

O script de fixture modifica somente as células F de uma cópia em memória durante os testes. O arquivo original não é salvo com modificações, e a cópia não é uma nova extração financeira nem substitui a validação de um arquivo externo ainda não recebido.

## Como validar a importação atualizada

1. Execute `npm ci` e `npm run dev`, e abra o endereço indicado pelo Vite.
2. Em **Gerenciar Base**, use **Baixar Modelo da Base** e confira F2 das duas primeiras abas.
3. Preencha as três abas com dados reais. Copie as fórmulas de F para cada registro das duas primeiras abas. Não confunda `Vr.aberto` e `Vr.recebido` com o nominal.
4. Clique em **Selecionar Nova Base**, informe a data correspondente à extração e valide o mapeamento. Para conferir a base histórica, use **19/10/2026** explicitamente.
5. Confira advertências, valores e referência, confirme o uso/substituição e clique em **Atualizar Dashboard**.
6. Consulte os KPIs e o aging. Na Auditoria, fórmulas novas válidas não devem gerar alerta de cache/dias; inconsistências reais continuam listadas. No detalhamento original, confira expressão, cache e dias recalculados.
7. Recarregue uma base salva ou restaure uma posição anterior: sua data-base e seu aging permanecem os mesmos.

Sem deploy, alterações no Neon, migrações, alterações de permissões/autenticação ou mudanças no layout/filtros.
