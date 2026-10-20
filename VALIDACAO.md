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
| Vencido | R$ 10.575.015,21 |
| Recebido YTD | R$ 56.999.819,30 |
| Limite Global | R$ 93.286.081,75 |

Os totais também foram conferidos independentemente com openpyxl e Decimal em Python. Não são valores fixos da interface. Uma nova planilha é processada pelos mesmos serviços e produz seus próprios totais.

## Auditoria do arquivo

- 2.348 diferenças entre dias informados e `referência − vencimento`.
- 5 divergências entre categoria A Vencer e data de vencimento.
- 1 ocorrência por sobreposição de cliente e título entre A Vencer e Recebido, abrangendo os dois registros de `87848/01`.
- Total: **2.354 advertências, zero erros bloqueantes**. Todos os 5.099 registros são preservados.

O cache OOXML contém 13 resultados zero de fórmulas compartilhadas omitidos pela leitura padrão do ExcelJS. O importador recupera o cache original; não calcula ou altera fórmulas. Há teste de regressão específico para esse caso, inclusive com nome de aba contendo entidade XML.

## Escopo dos testes

Resultado da execução com o arquivo oficial: **13 testes de serviços aprovados; 10 testes de navegador aprovados; nenhum teste ignorado ou falho.** A compilação TypeScript/Vite também passou.

Testes de serviços: centavos e formatos monetários, overflow, datas civis, leitura de Excel, campos originais, YTD, filtros, agrupamentos, faixas de atraso, séries mensais, arquivos inválidos, mapeamento reordenado, campos ausentes, cache de fórmulas e conciliação integral da base oficial.

Testes de navegador: interface sem dados, importação e confirmação, quatro KPIs, seis gráficos, filtros, ranking, representantes, detalhamento de títulos e células originais, justificativas locais, IndexedDB, recarga, remoção, arquivo corrompido, erro bloqueante e substituição válida. A importação oficial é executada em desktop (1440 × 1000) e mobile (390 × 844), com os totais históricos e as advertências conferidos no DOM. Os testes monitoram erros JavaScript e requisições externas durante o fluxo com a planilha real.

A suíte de navegador usa o build de produção servido localmente; isso evita que a otimização de dependências do servidor de desenvolvimento recarregue a página na primeira importação. O desenvolvimento também declara explicitamente as dependências do worker para pré-otimização.

## Limites da evidência

Esses testes demonstram funcionamento no navegador automatizado da máquina de desenvolvimento. Não comprovam implantação na Vercel ou a aprovação visual e funcional do usuário no próprio dispositivo. A atualização da Vercel será feita pelo responsável após revisão da PR. Não houve conexão ao Neon, migrations, autenticação administrativa ou publicação da base financeira.
