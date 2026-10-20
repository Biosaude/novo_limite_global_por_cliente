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

Resultado da execução com o arquivo oficial: **14 testes de serviços aprovados; 28 testes de navegador aprovados; nenhum teste ignorado ou falho.** A compilação TypeScript/Vite também passou.

Testes de serviços: centavos e formatos monetários, overflow, datas civis, leitura de Excel, campos originais, YTD, filtros, agrupamentos, faixas de atraso, séries mensais, arquivos inválidos, mapeamento reordenado, campos ausentes, cache de fórmulas e conciliação integral da base oficial.

Testes de navegador: interface sem dados, importação e confirmação, quatro KPIs, seis gráficos, filtros, ranking, representantes, detalhamento de títulos e células originais, justificativas locais, IndexedDB, recarga, remoção, arquivo corrompido, erro bloqueante e substituição válida. A importação oficial é executada em desktop (1920 × 1080), notebook (1440 × 1000), tablet (834 × 1112) e mobile (390 × 844), com os totais históricos e as advertências conferidos no DOM. Os testes monitoram erros JavaScript e requisições externas durante o fluxo com a planilha real.

A suíte de navegador usa o build de produção servido localmente; isso evita que a otimização de dependências do servidor de desenvolvimento recarregue a página na primeira importação. O desenvolvimento também declara explicitamente as dependências do worker para pré-otimização.

## Atualização visual e controles da base

Os três botões foram conferidos no navegador nas quatro resoluções. Em desktop, notebook e tablet, as posições, larguras e alturas são verificadas para garantir alinhamento horizontal e dimensões uniformes. No celular, ficam empilhados, com alvos de toque preservados.

O teste de **Baixar Modelo da Base** aguarda o evento de download, salva o arquivo e o abre com ExcelJS. Verifica as três abas, os cabeçalhos financeiros e a ausência de registros. Um teste de serviço preenche o modelo com registros identificados de teste e os importa pelo mesmo normalizador, conciliando os valores esperados sem usar o nominal.

**Selecionar Nova Base** é testado pelo evento real de seleção de arquivo do navegador. A prévia é gerada automaticamente. **Atualizar Dashboard** é testado nos estados sem arquivo, validado mas não confirmado, confirmado, invalidado por alteração de referência e aplicado. Os fluxos de erro, substituição e persistência anteriores continuam passando.

O teste do cabeçalho usa um relógio controlado: a base é lida em um horário e aplicada em outro. Confere que a última atualização registra o horário da aplicação em America/Sao_Paulo, além dos registros e do status. O FY responde ao filtro de ano. Nenhum desses horários controlados alimenta o produto.

As capturas em `docs/preview-*.png` usam somente o arquivo sintético `ARQUIVO_DE_TESTE_VISUAL.xlsx`. Não contêm a planilha oficial, pacientes ou dados financeiros reais. A validação da **nova planilha atualizada** continua pendente de seu fornecimento; os resultados reais já conferidos são apenas os da base histórica de 19/10/2026.

## Limites da evidência

Esses testes demonstram funcionamento no navegador automatizado da máquina de desenvolvimento. Não comprovam implantação na Vercel ou a aprovação visual e funcional do usuário no próprio dispositivo. A atualização da Vercel será feita pelo responsável após revisão da PR. Não houve conexão ao Neon, migrations, autenticação administrativa ou publicação da base financeira.
