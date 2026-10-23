# Evidências de validação

Referência da conciliação: **19/10/2026**. Arquivo real fornecido pelo usuário: `Faturamento A Vencer, Vencido e Faturado.xlsx`. O arquivo permanece fora do repositório.

## Estrutura real inspecionada

| Aba | Registros | Campo financeiro |
|---|---:|---|
| CONSOLIDADO - A VENCER (VA529) | 1.583 | Vr.aberto |
| CONSOLIDADO - VENCIDO (VA529) | 765 | Vr.aberto |
| CONSOLIDADO - RECEBIDO (VA527) | 2.751 | Vr.recebido, com Dt.recebimento no YTD |
| Total | 5.099 | Sem deduplicação ou exclusão automática |

A identificação usa os cabeçalhos reais. `Vr.duplicata` não é usado em lugar do saldo ou do recebimento. As colunas `Descricao` repetidas são preservadas por posição na origem.

## Conciliação reproduzida

| Indicador | Resultado |
|---|---:|
| A Vencer | R$ 25.711.247,24 |
| Vencidos (inadimplência) | R$ 10.575.015,21 |
| Recebido YTD | R$ 56.999.819,30 |
| Exposição Financeira Total | R$ 36.286.262,45 |
| Movimentação gerencial (saldos + Recebido YTD) | R$ 93.286.081,75 |
| Aging Médio dos Vencidos | 423,74 dias |

Os totais também foram conferidos independentemente com openpyxl e Decimal em Python. Não são valores fixos da interface. Uma nova planilha é processada pelos mesmos serviços e produz seus próprios totais.

## Auditoria do arquivo

- 2.348 fórmulas antigas de dias incompatíveis com a regra oficial nova (`IF(TODAY() > D…, TODAY() - E…, 0)`). Na cópia de teste com as novas subtrações reconhecidas sem cache, esses alertas não ocorrem.
- 5 divergências entre categoria A Vencer e data de vencimento.
- 1 ocorrência por sobreposição de cliente e título entre A Vencer e Recebido, abrangendo os dois registros de `87848/01`.
- Total: **2.354 advertências, zero erros bloqueantes**. Todos os 5.099 registros são preservados.

O cache OOXML contém 13 resultados zero de fórmulas compartilhadas omitidos pela leitura padrão do ExcelJS. O importador recupera o cache original; não altera as fórmulas originais. Somente as duas subtrações oficiais de dias são reconhecidas e calculadas pelas datas da posição; fórmulas monetárias e de datas continuam usando cache válido. Há teste de regressão específico para esse caso, inclusive com nome de aba contendo entidade XML.

## Escopo dos testes

Resultado da execução com o arquivo oficial: **58 testes de serviços aprovados; 108 testes de navegador aprovados; nenhum teste ignorado ou falho.** A compilação TypeScript/Vite também passou.

Testes de serviços: centavos e formatos monetários, overflow, datas civis, leitura de Excel, campos originais, YTD, filtros, agrupamentos, faixas de atraso, séries mensais, arquivos inválidos, mapeamento reordenado, campos ausentes, cache de fórmulas e conciliação integral da base oficial.

Testes de navegador: interface sem dados, importação e confirmação, quatro KPIs financeiros mais aging, seis gráficos, filtros, representantes, consulta de títulos, detalhamento de títulos e células originais, justificativas locais, IndexedDB, recarga, remoção, arquivo corrompido, erro bloqueante e substituição válida. A importação oficial é executada em desktop (1920 × 1080), notebook (1440 × 1000), tablet (834 × 1112) e mobile (390 × 844), com os totais históricos e as advertências conferidos no DOM. Os testes monitoram erros JavaScript e requisições externas durante o fluxo com a planilha real.

A suíte de navegador usa o build de produção servido localmente; isso evita que a otimização de dependências do servidor de desenvolvimento recarregue a página na primeira importação. O desenvolvimento também declara explicitamente as dependências do worker para pré-otimização.

## Atualização visual e controles da base

Os três botões foram conferidos no navegador nas quatro resoluções. Em desktop, notebook e tablet, as posições, larguras e alturas são verificadas para garantir alinhamento horizontal e dimensões uniformes. No celular, ficam empilhados, com alvos de toque preservados.

O teste de **Baixar Modelo da Base** aguarda o evento de download, salva o arquivo e o abre com ExcelJS. Verifica as três abas, os cabeçalhos financeiros e a ausência de registros. Um teste de serviço preenche o modelo com registros identificados de teste e os importa pelo mesmo normalizador, conciliando os valores esperados sem usar o nominal.

**Selecionar Nova Base** é testado pelo evento real de seleção de arquivo do navegador. A prévia é gerada automaticamente. **Atualizar Dashboard** é testado nos estados sem arquivo, validado mas não confirmado, confirmado, invalidado por alteração de referência e aplicado. Os fluxos de erro, substituição e persistência anteriores continuam passando.

O teste do cabeçalho usa um relógio controlado: a base é lida em um horário e aplicada em outro. Confere que a última atualização registra o horário da aplicação em America/Sao_Paulo, além dos registros e do status. O FY responde ao filtro de ano. Nenhum desses horários controlados alimenta o produto.

As capturas em `docs/preview-*.png` usam somente o arquivo sintético `ARQUIVO_DE_TESTE_VISUAL.xlsx`. Não contêm a planilha oficial, pacientes ou dados financeiros reais. A nova planilha `Modelo_Base_Limite_Global_Biosaude.xlsx` também foi recebida e validada: 5.212 registros, referência 23/10/2026, 11 advertências legítimas de `+1` nas fórmulas F2:F12 de A Vencer, zero erros bloqueantes. Os totais e o aging novos estão no relatório de fórmulas de vencimento.

## Painel sem menu lateral e rótulo de inadimplência

A categoria passa a ser exibida como **Vencidos (inadimplência)** em todos os rótulos de interface, incluindo KPIs, filtros, rankings, prévia da base, detalhamento e legendas. Os identificadores internos e os nomes originais das abas e colunas não foram alterados. As fórmulas e o tratamento temporal permanecem os mesmos.

A navegação foi movida para o topo, sem elemento lateral. Os filtros usam um bloco em grade com o status da seleção. As faixas da inadimplência reutilizam a função de agrupamento por atraso já existente, com valores e participações reais da seleção; eventuais faixas de diagnóstico com valor são preservadas. Em telas largas, o gráfico mensal ocupa a área principal e as faixas de atraso ficam ao lado.

O novo fluxo de navegador verifica a ausência do menu lateral, o acesso às cinco seções no topo, o rótulo uniforme, os valores das faixas, a resposta ao filtro da categoria e a geometria da linha principal de gráficos. Também verifica que os cards e a página não ultrapassam seus contêineres em desktop, notebook, tablet e celular.

## Análise de Crédito

A validação do novo módulo e a comparação dos 169 clientes com leitura independente em Python estão documentadas em [docs/VALIDACAO_CREDITO.md](docs/VALIDACAO_CREDITO.md). Metodologia, suficiência, janela observada, tratamento de pagamentos parciais e proposta de política estão em [docs/METODOLOGIA_CREDITO.md](docs/METODOLOGIA_CREDITO.md). A recomendação numérica permanece pendente de política aprovada.

## Limites da evidência

Esses testes demonstram funcionamento no navegador automatizado da máquina de desenvolvimento. Não comprovam implantação na Vercel ou a aprovação visual e funcional do usuário no próprio dispositivo. A atualização da Vercel será feita pelo responsável após revisão da PR. Não houve conexão ao Neon, migrations, autenticação administrativa ou publicação da base financeira.

## Ajustes de exposição e aging

[Conferência independente, fórmulas, comparativo e capturas](docs/VALIDACAO_AGING.md).

## Correção das fórmulas de dias

[Regras antigas/novas, conciliação da nova planilha de 23/10/2026, alertas preservados e instruções](docs/VALIDACAO_FORMULAS_VENCIMENTO.md).

## Cinco KPIs e menu reorganizado

[Arquivos, testes, capturas e conferência dos valores preservados](docs/VALIDACAO_LAYOUT_KPIS_MENU.md).

## Cobrança interativa e relatórios

[Seleção única de registros, arquivos, privacidade, exemplos e resultados financeiros](docs/VALIDACAO_COBRANCA_RELATORIOS.md).

## Reorganização da Visão Geral

[KPIs sem fórmulas visíveis, retirada do ranking e consulta no final: arquivos, testes e capturas](docs/VALIDACAO_REORGANIZACAO_LAYOUT.md).

## Análise de Recebimentos

[Conciliação independente, metodologia, ajuizamento, relatórios e testes do novo painel](docs/ANALISE_RECEBIMENTOS.md).
