# KPIs financeiros e aging da posição

Base: `Faturamento A Vencer, Vencido e Faturado.xlsx`, referência **19/10/2026**. Arquivo mantido fora do repositório. Conferência independente com openpyxl e Decimal, lendo os cabeçalhos e os registros de cada aba; script: `scripts/validate_aging_reference.py`.

## Comparação antes e depois

| Indicador | Antes | Depois |
|---|---:|---:|
| Primeiro KPI | Limite Global: R$ 93.286.081,75 | Exposição Financeira Total: **R$ 36.286.262,45** |
| A Vencer | R$ 25.711.247,24 | R$ 25.711.247,24 |
| Participação A Vencer | 27,56% da soma com recebimentos | **70,86% da exposição** |
| Vencidos (inadimplência) | R$ 10.575.015,21 | R$ 10.575.015,21 |
| Percentual vencido | 11,34% da soma com recebimentos | **29,14% da exposição** |
| Recebido YTD | R$ 56.999.819,30, com percentual da soma | R$ 56.999.819,30, **sem percentual sobre exposição** |
| Aging Médio dos Vencidos | Não apresentado na visão geral | **423,74 dias** |
| Concentração acima de 180 dias | Não destacada | **67,51% do saldo vencido** |

A soma anterior permanece nos seis gráficos e no ranking, identificada como **Movimentação gerencial**, com denominador explícito: saldos da posição + Recebido YTD. Essa soma não equivale a dívida, vendas completas ou limite aprovado. Não foram removidos gráficos, rankings ou filtros. Na conferência da importação, o quarto total passou a ser exposição, para coincidir com o novo KPI.

## Fórmulas e precisão

- Exposição = Σ `Vr.aberto` A Vencer + Σ `Vr.aberto` Vencidos. Não soma recebido.
- Participação A Vencer = saldo A Vencer / exposição × 100.
- Inadimplência = saldo Vencido / exposição × 100.
- Recebido YTD = Σ `Vr.recebido` com recebimento entre 01/01 do ano e o corte selecionado, limitado à referência importada.
- Dias em atraso = referência da posição − vencimento, em dias civis UTC.
- Aging médio = Σ(centavos vencidos × dias em atraso) / Σ centavos vencidos, **pelos registros**, sem média das médias ou dos intervalos.
- Participação de cada faixa = saldo da faixa / saldo vencido × 100.
- Concentração crítica = saldo acima de 180 dias / saldo vencido × 100, sem bloqueio automático.

As somas usam centavos inteiros verificados; os produtos ponderados e a divisão do aging usam Decimal.js com precisão local de 40 dígitos, evitando overflow intermediário de inteiros JavaScript. Não se arredondam valores antes da soma/divisão. Somente a exibição dos dias e percentuais é arredondada a duas casas. Resultado independente não formatado: **423,7408595367873707294648893 dias**.

Sem saldo vencido, a média e a concentração são **Não aplicável**. Uma linha vencida com saldo não zero e data ausente/inválida, atraso não positivo ou saldo inválido/negativo impede publicar uma média parcial; o card mostra a limitação e remete à Auditoria. Saldos zero não têm peso. As faixas diagnósticas existentes continuam visíveis quando apresentam valores.

## Faixas conciliadas

| Faixa | Saldo vencido | Participação |
|---|---:|---:|
| 1–30 dias | R$ 834.646,90 | 7,89% |
| 31–60 dias | R$ 292.886,43 | 2,77% |
| 61–90 dias | R$ 525.062,51 | 4,97% |
| 91–180 dias | R$ 1.783.670,50 | 16,87% |
| Acima de 180 dias | R$ 7.138.748,87 | 67,51% |
| Total | **R$ 10.575.015,21** | **100% antes do arredondamento** |

Todos os 765 registros vencidos têm saldo positivo e vencimento anterior à posição; nenhum é excluído da média oficial. Os 5.099 registros permanecem preservados. O cálculo novo percorre cada registro uma vez; não introduz duplicação nem elimina títulos por coincidência com recebimentos parciais. As advertências de origem e a conferência de sobreposições permanecem disponíveis.

## Datas e filtros

Cliente, representante e categoria mantêm os seletores e o comportamento existentes. Saldos, aging e distribuição usam os registros filtrados da posição ativa. Ano e mês alteram os recebimentos YTD; não reconstroem posições anteriores. Trocar a posição em Gerenciar Base usa somente a versão escolhida.

A classificação original das abas é preservada. A Vencer inclui títulos com vencimento na data-base: não há atraso nesse dia. Valores em categorias divergentes não são reclassificados automaticamente, e a Auditoria informa as ocorrências. A planilha oficial tem cinco divergências em A Vencer, já documentadas; a fórmula resumida descreve a categoria esperada e a nota permanente esclarece que os saldos seguem as abas originais.

## Resultados dos testes

**27 testes de serviços e 56 testes de navegador aprovados**, sem falhas ou testes ignorados na rodada completa com a planilha oficial. TypeScript e Vite compilados. Após a revisão de textos e precisão decimal, os serviços e os oito cenários de aging/importação oficial nas quatro resoluções foram repetidos.

## Verificação executável

```sh
BIOSAUDE_TEST_WORKBOOK='/caminho/privado/Faturamento A Vencer, Vencido e Faturado.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

Os novos testes de serviço cobrem média ponderada, centavos, limites das cinco faixas, vencimento na referência, ano bissexto, zeros, negativos, valores inválidos, overflow intermediário e lançamentos parciais. A leitura Python concilia a exposição, os saldos, as cinco faixas e o aging global e por cada cliente/representante. Os testes existentes cobrem importação, restauração, auditoria e crédito.

Os testes de navegador verificam quatro resoluções (1920, 1440, 834 e 390 px), fórmulas permanentes sem truncamento, ordem dos quatro cards, quinto KPI abaixo da linha, cinco barras, concentração, filtros, denominadores zero, importação oficial e erros de execução/requisições externas.

## Capturas e visualização

As capturas usam **somente registros sintéticos**, sem publicar nomes ou títulos financeiros reais:

- [Desktop](preview-aging-desktop.png)
- [Mobile](preview-aging-mobile.png)

Execute `npm ci` e `npm run dev`. Abra `http://127.0.0.1:5173` (ou a porta informada pelo Vite), importe a planilha em **Gerenciar Base**, confira a referência, valide e clique em **Atualizar Dashboard** após confirmar o uso. A visão geral apresenta os novos KPIs, as fórmulas, o aging e as barras. Uma base salva neste navegador é recuperada normalmente, sem nova migração ou edição manual.

Não houve deploy, conexão ao Neon, alteração de autenticação/permissões ou migração de banco. O módulo de crédito e seu estado de política pendente são preservados.

## Arquivos alterados

- `src/domain/finance.ts` e `types.ts`: total de exposição separado da movimentação e média ponderada com Decimal.js.
- `src/components/FinancialKpis.tsx` e `src/App.tsx`: quatro cards financeiros, fórmulas e quinto KPI em componente de apresentação integrado à visão geral existente.
- `src/components/InadimplenciaDistribution.tsx` e `src/styles.css`: fórmulas nas faixas, barras percentuais, concentração e adaptação das legendas às quatro resoluções.
- `FinancialCharts.tsx`, `Ranking.tsx` e `DetailDialog.tsx`: rótulos/denominadores explícitos da soma gerencial preservada; `ImportManager.tsx`: exposição na conferência da importação.
- `tests/aging.test.ts`, `finance.test.ts`, `interface.spec.ts`, `credit.spec.ts` e `scripts/validate_aging_reference.py`: casos financeiros, leitura independente e regressão dos fluxos existentes.
- `README.md`, `VALIDACAO.md`, este relatório e capturas: metodologia, resultados e instruções de visualização.
