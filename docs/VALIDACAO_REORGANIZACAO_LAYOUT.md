# Ajustes de layout da Visão Geral

## Alterações

- Removidos somente os textos de fórmulas nos cinco KPIs superiores. Títulos, valores, descrições, ícones, cores, registros, percentuais e data-base foram mantidos. A grade conserva cinco colunas no desktop e alturas uniformes, com menor espaço interno após a retirada das fórmulas.
- Removida a seção Ranking de Clientes, incluindo seu componente exclusivo, estado de pesquisa, ordenação, paginação e estilos exclusivos. `groupBy`, os dados dos clientes e os estilos compartilhados com Análise de Crédito continuam disponíveis.
- Movida a Consulta de Títulos e Pendências Financeiras para depois dos seis gráficos, imediatamente antes do rodapé institucional. O componente, estado, filtros, detalhamento, paginação e geradores de relatórios não foram modificados.

A navegação permanece: Visão geral → Análise de Crédito → Auditoria → Gerenciar Base.

## Arquivos

| Arquivo | Alteração |
|---|---|
| `src/App.tsx` | Ordem das seções e retirada da interface e estado exclusivo do ranking |
| `src/components/FinancialKpis.tsx` | Retirada dos textos de fórmulas, sem mudar expressões de cálculo |
| `src/components/Ranking.tsx` | Componente exclusivo removido |
| `src/components/FinancialCharts.tsx` | Retirada da legenda que direcionava ao ranking removido, preservando o gráfico existente |
| `src/styles.css` | Espaçamento compacto dos KPIs e limpeza de estilos exclusivos do ranking |
| `tests/days-formula.spec.ts` | Rastreabilidade da fórmula pelo título na consulta preservada |
| `tests/interface.spec.ts` | Detalhamento pela consulta preservada e verificações de ausência de fórmulas/ranking |
| `tests/kpi-navigation.spec.ts` | Geometria, ordem final da consulta, filtros, módulos e capturas |
| `README.md`, `VALIDACAO.md`, este documento | Descrição e evidências atualizadas |

## Valores financeiros preservados

Planilha nova fornecida pelo usuário, posição de 23/10/2026, 5.212 registros:

| Indicador | Valor |
|---|---:|
| Exposição Financeira Total | R$ 36.056.572,20 |
| A Vencer | R$ 24.950.832,48 |
| Vencidos (inadimplência) | R$ 11.105.739,72 |
| Recebido YTD | R$ 57.902.017,98 |
| Participação A Vencer | 69,2% |
| Inadimplência | 30,8% |
| Aging ponderado | 401,31 dias |

A seleção de cobrança das faixas 91–180 e acima de 180 dias continua com 621 registros e R$ 8.860.895,37 em aberto. Os testes abrem o Excel exportado e conferem linhas e total; os fluxos sintéticos abrem Excel e PDF para conferir seleção, valores e ausência de dados de pacientes. A leitura independente com Python/openpyxl faz parte dos testes financeiros executados com as planilhas reais.

Nenhum arquivo do domínio financeiro, consulta, importação, exportação, persistência ou crédito foi alterado. As 11 advertências legítimas da planilha nova permanecem preservadas.

## Execução

Resultado final: **50 testes de serviços e 96 testes de navegador aprovados (146 no total), sem falhas ou testes ignorados. TypeScript e build Vite aprovados.** Os serviços foram executados com `npm test`; após adaptar as duas verificações antigas, o build e os 96 testes de navegador foram executados novamente com `npm run test:e2e`.

Permanece o aviso de tamanho do chunk de exportação Excel já existente; nenhuma dependência foi adicionada.

Na primeira execução, duas verificações antigas ainda dependiam do ranking removido (oito falhas, uma por resolução para cada verificação). Foram atualizadas para conferir rastreabilidade e rótulos na Consulta de Títulos. A suíte de navegador foi executada novamente após esses ajustes e a correção da legenda do gráfico.

A suíte verifica interface sem dados e com base, ausência de fórmulas nos KPIs e do ranking, valores/percentuais, cinco cards alinhados no desktop, consulta como última seção, filtros globais e de cobrança, múltiplas faixas, exportação Excel/PDF, detalhamento, auditoria, crédito e importação. Navegador Chromium, build de produção local, resoluções 1920×1080, 1440×1000, 834×1112 e 390×844. Os fluxos monitoram erros JavaScript; as verificações de layout também impedem overflow horizontal da página.

Para reproduzir, informe os caminhos privados das planilhas e execute:

```bash
BIOSAUDE_TEST_WORKBOOK='/caminho/Faturamento A Vencer, Vencido e Faturado.xlsx' \
BIOSAUDE_UPDATED_WORKBOOK='/caminho/Modelo_Base_Limite_Global_Biosaude.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
BIOSAUDE_CAPTURE_LAYOUT_CLEANUP=1 npm test
```

## Capturas

Capturas feitas com dados sintéticos identificados de teste, sem dados financeiros reais:

- [Cinco KPIs sem fórmulas — desktop](preview-clean-kpis-desktop.png)
- [KPIs responsivos — celular](preview-clean-kpis-mobile.png)
- [Visão Geral completa e nova ordem](preview-dashboard-order.png)
- [Consulta na última posição](preview-final-consultation.png)

## Visualização

Execute `npm run dev -- --port 5173` e abra http://127.0.0.1:5173/. Em Gerenciar Base, selecione a planilha, confira a referência, valide e ative a base. A Visão Geral mostra a nova ordem; a consulta e os botões de exportação ficam no final.

Não houve deploy, migração, conexão ao Neon nem alteração de autenticação ou permissões. A validação local não comprova publicação na Vercel.
