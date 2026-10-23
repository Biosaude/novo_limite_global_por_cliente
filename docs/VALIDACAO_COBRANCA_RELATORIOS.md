# Filtros, aging interativo e relatórios de cobrança

## Fluxo e contextos

A Visão geral mantém os cinco KPIs, seis gráficos, menu, fórmulas e filtros principais. Cliente e representante são aplicados simultaneamente; categoria limita os componentes pertinentes. Ano/mês delimitam recebimentos YTD e **não reconstroem saldos de outra posição**. A referência financeira sempre é a da base ativa.

Cards e barras das cinco faixas permitem seleção múltipla por mouse ou teclado. O estado é compartilhado com as caixas de seleção da consulta, com destaque, `aria-pressed`, chips removíveis e opção de limpar faixas. Os demais cards continuam visíveis. **Os valores e percentuais das faixas usam o contexto geral**, antes de aplicar a seleção de cobrança: selecionar uma faixa não transforma sua participação em 100%.

A consulta de cobrança é um contexto separado: as faixas selecionadas restringem somente seus registros, resumo e relatórios. Não redefinem Exposição Financeira Total, A Vencer ou Recebido YTD. O filtro e as pesquisas permanecem na sessão ao navegar entre módulos; Limpar filtros restaura também a consulta. Ao ativar/restaurar outra base, a seleção é reiniciada para não carregar contexto de outra posição.

A Análise de Crédito conserva seu comportamento documentado: os filtros selecionam clientes, e a exposição individual usa a posição completa para não ocultar dívida por representante/categoria. Essa limitação continua explícita no próprio módulo. As faixas de cobrança não alteram critérios ou limites de crédito.

## Consulta e rastreabilidade

A nova seção **Consulta de Títulos e Pendências Financeiras**, após a distribuição de aging, apresenta os títulos **em aberto** que atendem aos filtros principais, faixas e pesquisas. Recebimentos não são pendências: escolher exclusivamente Recebido deixa essa consulta sem resultados, com explicação, mantendo os KPIs do contexto principal.

Colunas: cliente, representante, duplicata, parcela, título completo, emissão, vencimento, dias vencidos, faixa, nominal, desconto, saldo em aberto, categoria original, hospital, plano e origem (aba/linha), além de observações de integridade quando pertinentes. Nome/identificadores originais são preservados; nomes semelhantes não são unidos por aproximação. Campos auxiliares ausentes ficam não informados; valores inválidos não viram zero.

Nominal e desconto vêm de seus cabeçalhos reais. O saldo continua exclusivamente em `Vr.aberto`. Os dados auxiliares são projetados da origem em memória; não há alteração no modelo de importação ou migração. Não é necessário reimportar uma base salva para disponibilizar esses campos.

Há pesquisas por cliente e duplicata/título, ordenação por vencimento/saldo/dias/cliente/duplicata e paginação de 20 registros. O título abre o detalhamento original já existente. Todos os resultados, não apenas a página visível, compõem as totalizações e exportações.

O resumo mostra quantidade de lançamentos, títulos identificados, clientes, saldo selecionado, aging ponderado, maior atraso da categoria Vencidos e data-base. Títulos são identificados por cliente + duplicata + parcela, com título completo ou ID da linha como fallback. A contagem distinta não elimina lançamentos nem saldos. Clientes são agrupados apenas por espaços/capitalização para os resumos; não há aproximação de nomes.

Os dias derivam do vencimento e da referência. A classificação original é mantida, inclusive divergências já auditadas; vencimento hoje tem zero dias e não é atraso. O aging usa a função financeira existente de ponderação por saldo dos registros vencidos. Dados incompatíveis suspendem uma média parcial e exibem a limitação. As duas faixas diagnósticas existentes continuam aparecendo quando necessárias, sem virar filtros de atraso válidos.

## Uma fonte para os resultados

`buildCollectionView` produz uma única seleção completa e ordenada com registros, resumo, grupos, faixas e contexto. A tabela, o resumo, o Excel e o PDF recebem essa mesma seleção. Exportadores não refazem a filtragem e não recebem a fatia da paginação.

Ao exportar, a seleção e a data de emissão são capturadas. Se a seleção mudar durante a geração, o download antigo é descartado e a interface solicita nova exportação. Sem resultados ou com saldo inválido, os botões ficam indisponíveis. Não são gerados relatórios vazios enganosos.

## Excel

Arquivo `.xlsx` editável, com quatro abas:

1. **Resumo Financeiro**: empresa, emissão em horário brasileiro, posição, arquivo de origem, filtros principais, faixas, pesquisas, ordenação, contagens, saldos, aging, maior atraso, metodologia e distribuição por faixa.
2. **Duplicatas Detalhadas**: todos os registros selecionados, campos da consulta, origem e observações. Cabeçalhos congelados, filtros, datas brasileiras, números monetários e totalizador `SUM` com resultado armazenado.
3. **Resumo por Cliente**: registros/títulos, aberto, vencido, aging, maior atraso e participação no saldo selecionado.
4. **Resumo por Representante**: clientes, registros/títulos, aberto, vencido e participação no saldo selecionado.

Saldos são calculados em centavos inteiros e convertidos para células numéricas apenas na saída. Não há arredondamento antes das totalizações. Valores recebidos/nominais não são usados como aberto. Textos são células de texto, sem execução de fórmulas vindas dos nomes. O único totalizador inserido pelo sistema soma o intervalo financeiro explícito.

## PDF

PDF A4 paisagem, fonte Unicode local DejaVu Sans incorporada, cabeçalho com empresa/título/emissão/referência em todas as páginas, filtros completos, resumo executivo, distribuição por faixa, tabela de todas as pendências, total final, paginação e rodapés. As linhas quebram automaticamente e os cabeçalhos de tabela se repetem. Não usa impressão do navegador nem depende de serviço externo.

A fonte e sua licença estão em `src/relatorios/assets`. A carga da biblioteca e da fonte ocorre somente quando o PDF é solicitado; o Excel também é carregado sob demanda. O build pode informar o tamanho elevado do pacote ExcelJS de exportação, carregado apenas no download; isso não bloqueia a compilação.

## Privacidade e acesso

A aplicação mantém o fluxo existente de arquivo importado localmente e armazenamento opcional no próprio navegador. Não foram adicionados endpoints de leitura de dados, URLs públicas de relatórios, compartilhamento automático, mudanças de autenticação ou novos perfis de acesso. Uma sessão sem base local não apresenta registros nem permite exportar relatórios financeiros.

Nenhum relatório é enviado ou armazenado em serviço externo. O navegador gera um download explícito a partir da base disponível naquela sessão; a URL temporária é revogada. Os dados reais e os exemplos reais gerados **não entram no Git nem nos assets públicos**.

**Pacientes são omitidos da consulta e de ambos os relatórios.** Hospital e plano são incluídos quando existentes. Não foi criado um caminho para exportar pacientes sem autorização autenticada adequada. O detalhamento original permanece com o comportamento anterior para a base local importada; não é reexportado automaticamente.

## Conferência financeira real

Base nova: `Modelo_Base_Limite_Global_Biosaude.xlsx`, **23/10/2026**, 5.212 registros. Consulta demonstrada: **91–180 dias + Acima de 180 dias**, demais filtros sem restrição.

| Indicador da seleção | Consulta, Excel, PDF e leitura independente |
|---|---:|
| Registros / títulos | **621 / 621** |
| Clientes | **27** |
| Saldo selecionado | **R$ 8.860.895,37** |
| Aging da seleção | **495,78 dias** |
| Maior atraso | **1.025 dias** |
| Saldo 91–180 dias | R$ 1.798.315,50 |
| Saldo acima de 180 dias | R$ 7.062.579,87 |
| PDF de exemplo | **33 páginas A4 paisagem** |

A leitura independente usa openpyxl/Decimal, vencimento anterior em mais de 90 dias e `Vr.aberto`. Confirma 621 registros, 27 clientes e R$ 8.860.895,37; o aging não formatado é **495,7769373785078335712252068 dias**. O texto do PDF real foi extraído e suas posições conferidas: nenhum texto fora dos limites das 33 páginas. A revisão visual conferiu cabeçalhos, contrastes e formatação.

O contexto geral da mesma base permanece com exposição **R$ 36.056.572,20**, A Vencer **R$ 24.950.832,48**, Vencidos **R$ 11.105.739,72**, Recebido YTD **R$ 57.902.017,98** e aging **401,31 dias**. As 11 advertências legítimas da planilha continuam na Auditoria. A base histórica anterior também é testada separadamente.

## Arquivos e validação

- `src/domain/agingBands.ts`: limites existentes centralizados e compartilhados, sem alteração de faixas; `finance.ts` usa o mesmo classificador.
- `src/cobranca/query.ts`: projeção, filtros/pesquisas, ordenação, contagens, resumos e seleção única para relatórios.
- `src/components/CollectionPanel.tsx`: consulta, paginação, origem, resumo e downloads.
- `src/components/InadimplenciaDistribution.tsx` e `src/App.tsx`: seleção compartilhada de faixas e integração com os filtros existentes.
- `src/relatorios`: geradores Excel/PDF e download local; fonte e licença.
- `src/styles.css`: interação acessível, controles e seção nova responsiva.
- `package.json` / lock: jsPDF e autoTable; ExcelJS já existia.
- `tests/collection*`: cenários sintéticos, integridade de arquivos e navegador; `scripts/export_collection_sample.ts`: reprodução local dos exemplos reais.

Para executar as verificações, além do Node/Chromium e Python/openpyxl já utilizados, os testes de PDF requerem `pdftotext` e `pdfinfo` (Poppler):

```sh
BIOSAUDE_TEST_WORKBOOK='/caminho/privado/Faturamento A Vencer, Vencido e Faturado.xlsx' \
BIOSAUDE_UPDATED_WORKBOOK='/caminho/privado/Modelo_Base_Limite_Global_Biosaude.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

As verificações cobrem filtros individuais/combinados, categoria, vazio, pesquisas, ordenação, cada faixa e união sem duplicação, sincronização card/barra/checkbox/chip, limpeza e navegação, preservação dos KPIs e percentuais, exportação de todos os resultados em filtros individuais e múltiplos, tipos/abas/fórmulas do Excel, PDF multipágina com referência/cabeçalhos/totais, ausência de pacientes, responsividade, erros JavaScript e requisições externas. Os testes anteriores de importação, histórico, auditoria e crédito são mantidos.

## Resultado dos testes

**50 testes de serviços/arquivos e 96 testes de navegador aprovados**, sem falhas ou testes ignorados, com as duas planilhas reais disponíveis. Total: **146 testes distintos**. TypeScript e build Vite aprovados. Os cenários de navegador foram executados em desktop 1920 px, notebook 1440 px, tablet 834 px e celular 390 px. Downloads reais de Excel/PDF com filtro individual e múltiplos filtros foram abertos e conferidos; a nova base real também foi exportada e conciliada no navegador.

## Demonstração e exemplos

1. Execute `npm ci`, `npm run dev` e abra o endereço informado pelo Vite.
2. Importe a planilha em Gerenciar Base com referência 23/10/2026, valide e confirme Atualizar Dashboard.
3. Na Visão geral, escolha cliente/representante. Clique em 91–180 e Acima de 180: card, barra, checkbox e chips devem refletir a mesma seleção. Os cinco KPIs gerais permanecem no contexto principal.
4. Confira o resumo da cobrança, pesquise duplicatas e avance as páginas; abra um título para consultar a origem.
5. Clique em Exportar Excel e Exportar PDF. Os arquivos devem ter todos os resultados e o mesmo total do resumo. Limpar faixas mantém filtros principais; Limpar filtros restaura ambos os contextos.

Exemplos reais foram gerados em pasta privada do ambiente e entregues separadamente da PR. Para reproduzi-los localmente, usando a mesma fonte da consulta:

```sh
node --import tsx scripts/export_collection_sample.ts \
  '/caminho/privado/Modelo_Base_Limite_Global_Biosaude.xlsx' \
  2026-10-23 '/pasta/privada/relatorios'
```

O exemplo aplica as duas faixas acima e escreve Excel/PDF sem enviar dados à rede. As capturas abaixo usam somente registros sintéticos:

- [Consulta e seleção no desktop](preview-collection-desktop.png)
- [Consulta no celular](preview-collection-mobile.png)

Sem deploy, mudanças no Neon, migrações, alteração de autenticação/permissões ou exclusão de dados.
