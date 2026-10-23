# Reorganização visual dos KPIs e do menu

## Resultado

Os cinco indicadores da Visão geral pertencem à mesma grade, nesta ordem: **Exposição Financeira Total, A Vencer, Vencidos (inadimplência), Recebido YTD e Aging Médio dos Vencidos**. O card de aging deixou de ocupar uma seção isolada abaixo dos outros quatro.

A partir de **1.400 px de viewport**, a grade tem cinco colunas proporcionais, alturas iguais, valores alinhados e espaçamento uniforme. De 1.001 a 1.399 px são três colunas; de 561 a 1.000 px, duas; até 560 px, uma. As regras se aplicam somente à grade financeira, sem alterar o layout dos cards de Análise de Crédito.

Fórmulas continuam permanentemente visíveis. Os rodapés mantêm separador, contagem, participação/inadimplência e referência. Tipografia, ícones, bordas e cores são preservados, com dimensionamento local dos valores para acomodar cinco colunas sem cortes.

A navegação tem exclusivamente **Visão geral → Análise de Crédito → Auditoria → Gerenciar Base**. Foram removidas as duas apresentações redundantes de Clientes e Representantes, mantendo seus dados, os filtros, os gráficos e o detalhamento dos registros na Visão geral. O componente compartilhado de ranking e as funções de agrupamento não foram excluídos. A legenda do gráfico por representante agora aponta ao filtro existente, em vez de citar a página removida.

O projeto usa estado React para a navegação, sem rotas ou URLs específicas para essas duas páginas e sem gravar a página selecionada no armazenamento. Uma abertura/reabertura inicia em Visão geral; não há links de rotas antigas a migrar.

## Arquivos modificados

- `src/App.tsx`: quatro entradas na ordem solicitada e retirada das apresentações redundantes; filtros e ciclo de importação/persistência permanecem iguais.
- `src/components/FinancialKpis.tsx`: realocação do JSX existente do aging para a grade; nenhuma fórmula ou formatação monetária foi substituída.
- `src/styles.css`: grade restrita a `.financial-kpis`, pontos de quebra, dimensões uniformes e legendas sem truncamento.
- `src/components/FinancialCharts.tsx`: apenas a legenda que mencionava a página Representantes; nenhuma mudança nos dados ou gráficos.
- `tests/interface.spec.ts`: expectativas atualizadas para a nova organização e consulta do representante pelo filtro/detalhamento.
- `tests/kpi-navigation.spec.ts`: geometria dos cards com valores monetários longos, ordem/estado ativo do menu, filtros e preservação da base durante a navegação.
- README, relatório e capturas de revisão.

## Valores antes e depois

Nova base real `Modelo_Base_Limite_Global_Biosaude.xlsx`, **23/10/2026**, **5.212 registros**:

| KPI | Antes | Depois |
|---|---:|---:|
| Exposição Financeira Total | R$ 36.056.572,20 | R$ 36.056.572,20 |
| A Vencer | R$ 24.950.832,48 | R$ 24.950.832,48 |
| Vencidos (inadimplência) | R$ 11.105.739,72 | R$ 11.105.739,72 |
| Recebido YTD | R$ 57.902.017,98 | R$ 57.902.017,98 |
| Aging Médio dos Vencidos | 401,31 dias | 401,31 dias |

Os resultados anteriores estão conciliados em [Validação das fórmulas de vencimento](VALIDACAO_FORMULAS_VENCIMENTO.md). A suíte volta a importar a planilha real e confere os mesmos cinco valores, a referência e as 11 advertências legítimas de fórmulas com `+1`. Também testa a base anterior de 19/10/2026 isoladamente. Valores de referência são expectativas dos testes, não constantes no código da aplicação.

Nenhum arquivo de cálculo financeiro, auditoria, interpretação de datas, importação ou persistência foi alterado. O código dos módulos Análise de Crédito, Auditoria e Gerenciar Base permanece igual, além da nova posição de suas entradas de navegação. Não há alterações no Neon, migrações, autenticação, permissões ou deploy.

## Resultados dos testes

**42 testes de serviços e 80 testes de navegador aprovados**, sem falhas ou testes ignorados, com as duas planilhas reais fornecidas. Total: **122 testes distintos**. A validação TypeScript e o build Vite passaram. Os arquivos de cálculo financeiro, auditoria, importação, datas, persistência e análise de crédito permanecem sem alterações nesta entrega.

## Validação executável

```sh
BIOSAUDE_TEST_WORKBOOK='/caminho/privado/Faturamento A Vencer, Vencido e Faturado.xlsx' \
BIOSAUDE_UPDATED_WORKBOOK='/caminho/privado/Modelo_Base_Limite_Global_Biosaude.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

A verificação de geometria usa valores sintéticos de dezenas de milhões de reais. Confere cinco cards na mesma linha em 1920 × 1080 e 1440 × 1000; em tablet 834 × 1112 e celular 390 × 844, confere a distribuição em mais linhas, alturas uniformes, fórmulas/valores/rodapés visíveis sem cortes e ausência de rolagem horizontal na página. Verifica também alturas dos valores e separadores, espaçamento, ordem dos cards e permanência dos seis gráficos.

A verificação de navegação abre os quatro módulos, confere o destaque vermelho e `aria-current`, preserva ano/mês/cliente/representante/categoria e a base da sessão, abre o detalhamento com o representante e restaura os totais após limpar os filtros. A suíte existente mantém os testes de importação, histórico, auditoria, crédito e cálculos independentes. Erros JavaScript são monitorados nos fluxos de navegador.

## Capturas

As capturas usam **somente dados sintéticos**, sem publicar nomes ou documentos da planilha real:

- [Cinco KPIs no desktop](preview-kpi-row-desktop.png)
- [Novo menu com quatro itens](preview-navigation-four-items.png)
- [KPIs empilhados no celular](preview-kpi-row-mobile.png)

## Como visualizar

Execute `npm ci` e `npm run dev`, e abra o endereço informado pelo Vite. Em Gerenciar Base, importe a planilha e confirme sua referência (23/10/2026 para a base nova fornecida), valide e clique em Atualizar Dashboard após confirmar o uso. Na Visão geral, confira os cinco KPIs, teste os filtros de cliente/representante e navegue pelos quatro itens do menu. Nenhuma atualização de produção foi realizada.
