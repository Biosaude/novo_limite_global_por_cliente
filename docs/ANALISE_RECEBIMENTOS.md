# Análise de Recebimentos — Biosaúde

## Funcionamento

Novo painel do projeto existente, acessível em **Visão geral → Análise de Recebimentos → Análise de Crédito → Auditoria → Gerenciar Base**. Importação, Visão Geral, aging, Auditoria, crédito e armazenamento local permanecem com as mesmas regras. Não houve conexão ao Neon, migração, deploy ou mudança de autenticação/permissões.

O HTML `Q3 FY26 · Recebimentos · New Cardio Medical (5).html` não estava no ambiente. O painel segue o estilo executivo Biosaúde existente: fundo cinza-claro, cards brancos, títulos azul-marinho, vermelho corporativo e gráficos responsivos. Nenhum projeto de referência foi modificado.

## Metodologia e integridade

- Universo: lançamentos normalizados da aba Recebido. Valor financeiro: exclusivamente `Vr.recebido`, nunca o nominal `Vr.duplicata`.
- Data temporal: `Dt.recebimento`, não emissão, vencimento ou crédito bancário. Registros sem data válida ou posteriores à posição importada ficam fora da análise temporal e são contados explicitamente.
- Dias: recebimento menos vencimento em dias civis. Negativo = antecipado; zero = em dia; positivo = pós-inadimplência. São categorias exclusivas, cuja soma reconcilia o total.
- Sem vencimento válido, o lançamento permanece como **Prazo indeterminado**, em categoria de diagnóstico visível, sem inventar pontualidade ou perder o valor na conciliação.
- Valores monetários são agregados em centavos inteiros com checagem de precisão. Valores inválidos são sinalizados como total parcial e bloqueiam exportação. Valores negativos são preservados; a rosca percentual fica indisponível quando há negativos.
- Cada lançamento é preservado, inclusive pagamentos parciais coincidentes. A contagem de títulos usa cliente normalizado + duplicata + parcela; na ausência, título completo ou identificador da linha. Uma linha não comprova quitação integral. Não há deduplicação por valor.
- Nomes são correspondidos somente após normalização de espaços e capitalização, sem aproximação de clientes diferentes.
- Filtros exclusivos do painel: ano, mês, trimestre, cliente, representante, condição, ajuizamento e pesquisa. Mês e trimestre são interseções exatas sobre a data de recebimento, sem a semântica YTD dos saldos existentes. Ano “Todos” mantém cada ano separado nas séries. Ordenação não altera totais.
- As séries mostram os meses/trimestres com lançamentos selecionados. Ausência de período não é preenchida com dados simulados. O trimestre da posição pode ser parcial. Variações comparam o trimestre disponível anterior, dentro dos filtros; sem anterior ou com base anterior zero/negativa, apresentam Não aplicável. Não há metas inventadas ou projeções.

## Ajuizamento

Ajuizamento é um atributo complementar às categorias de prazo. O valor identificado como ajuizado nunca é somado novamente ao recebido total.

A fonte deve trazer uma coluna inequívoca como `Ajuizado`, `Título ajuizado` ou `Situação de ajuizamento`, associada à mesma linha financeira, duplicata e parcela. Valores explícitos aceitos: sim/não, ajuizado/não ajuizado, true/false ou 1/0. Ausência, conteúdo desconhecido ou múltiplas colunas candidatas resultam em **Dados indisponíveis**. Não se procuram palavras em observações livres, nomes de pacientes ou faixas de atraso.

A tabela preserva a referência da coluna/aba/linha que forneceu a informação. O indicador informa quantos lançamentos têm situação conhecida e quantos não têm; cobertura parcial é advertida. Se não há qualquer situação conhecida, o valor é indisponível, e não zero. Se há situação conhecida e nenhum dos registros conhecidos é ajuizado, zero refere-se apenas à cobertura explicitamente conhecida.

**A planilha oficial atual não possui campo de ajuizamento.** A análise oficial exibe Dados indisponíveis, sem filtro ativo de ajuizamento. Para usar o atributo, o responsável precisa fornecer uma coluna confiável vinculada ao título/parcela, com confirmação administrativa da situação. Para governança completa, recomenda-se também manter número do processo, data de ajuizamento e fonte/responsável em sistema autorizado; o painel não presume nem confirma ações judiciais externas.

## Relatórios

**Exportar Excel** e **Exportar PDF** usam o mesmo resultado filtrado de todos os lançamentos, inclusive os que estão fora da página visível da consulta. São gerados localmente, sem dados de pacientes e sem enviar a base para serviços externos.

O Excel possui oito abas, e o PDF contém as mesmas seções:

1. Resumo Financeiro: origem, posição, emissão em America/Sao_Paulo, filtros, total, lançamentos/títulos/clientes, cobertura de ajuizamento e metodologia.
2. Classificação: valores e lançamentos por categoria.
3. Evolução Mensal.
4. Evolução Trimestral.
5. Comparativo por Categoria, incluindo variações.
6. Resumo por Cliente.
7. Resumo por Representante.
8. Duplicatas Recebidas: identificação, emissão/vencimento/recebimento, dias, valor efetivo, condição, situação/evidência de ajuizamento e aba/linha de origem.

Excel preserva valores monetários numéricos. PDF usa fonte local com acentos, identidade Biosaúde, A4 paisagem e paginação. Nenhuma fonte remota é necessária. Os arquivos são bloqueados se a seleção está vazia ou contém valores inválidos. Se os filtros mudam durante a geração, o download da seleção anterior é descartado.

## Conciliação da planilha nova

Arquivo privado: `Modelo_Base_Limite_Global_Biosaude.xlsx`. Posição: **23/10/2026**. Recebimentos efetivos de 02/01/2026 a 22/10/2026.

| Classificação | Lançamentos | Valor recebido |
|---|---:|---:|
| Antecipados | 1.227 | R$ 24.865.707,80 |
| Em dia | 266 | R$ 5.220.563,83 |
| Pós-inadimplência | 1.294 | R$ 27.815.746,35 |
| Total | 2.787 | R$ 57.902.017,98 |
| Ajuizados — subconjunto complementar | Informação ausente | Dados indisponíveis |

Conferência independente: `scripts/validate_receipts_reference.py` lê o Excel com Python/openpyxl e Decimal, sem usar os cálculos TypeScript. Os testes comparam quantidades, totais por categoria, mês, trimestre, cliente e representante nas duas planilhas reais. Os nomes usados na comparação são convertidos em hashes e não são publicados nos logs.

A base nova continua com 5.212 registros e 11 advertências legítimas de fórmulas. A Visão Geral mantém exposição R$ 36.056.572,20 e aging 401,31 dias; o módulo de recebimentos não altera esses cálculos.

## Testes

Resultado final: **58 testes de serviços e 108 testes de navegador aprovados (166 no total), sem falhas ou testes ignorados. TypeScript e build Vite aprovados.** Após o ajuste final dos rótulos e cabeçalho do novo painel, foram repetidos os oito testes de recebimentos e seus 12 fluxos de navegador, também aprovados. O aviso de tamanho do chunk ExcelJS já existente permanece; não foram adicionadas dependências.

Também foram gerados os relatórios completos da planilha real, fora do Git: Excel com oito abas e 2.787 lançamentos detalhados, cuja soma reaberta é R$ 57.902.017,98; PDF A4 paisagem com 227 páginas, total conciliado e zero palavras fora dos limites das páginas na inspeção de coordenadas com Poppler. A primeira página sintética e uma página real de detalhamento foram revisadas visualmente. Os arquivos reais permanecem privados no ambiente, sem serem enviados ao repositório.

A suíte cobre categorias, totalização, parcialidades, coincidência de valores, dados insuficientes, ajuizamento ausente/ambíguo/positivo, datas inválidas, negativos, filtros e ordenação, gráficos, origem, downloads reais Excel/PDF, exportação além da página visível, privacidade e regressão dos módulos existentes. Navegador Chromium nas resoluções desktop, notebook, tablet e celular, monitorando erros JavaScript e console no novo fluxo sintético.

Para reproduzir:

```bash
BIOSAUDE_TEST_WORKBOOK='/caminho/Faturamento A Vencer, Vencido e Faturado.xlsx' \
BIOSAUDE_UPDATED_WORKBOOK='/caminho/Modelo_Base_Limite_Global_Biosaude.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
BIOSAUDE_CAPTURE_RECEIPTS=1 npm test
```

## Capturas

Somente dados sintéticos identificados, sem pacientes ou dados financeiros reais:

- [Painel completo — desktop](preview-receipts-desktop.png)
- [KPIs de recebimentos](preview-receipts-kpis.png)
- [Painel responsivo — celular](preview-receipts-mobile.png)

## Arquivos e visualização

- `src/recebimentos/analysis.ts`: classificação, filtros, totais, séries, agrupamentos e leitura explícita do atributo judicial.
- `src/recebimentos/ReceiptsModule.tsx`: filtros, KPIs, comparativo trimestral, consulta, paginação e downloads.
- `src/recebimentos/ReceiptCharts.tsx`: evolução mensal/trimestral, participação e análise complementar de ajuizados.
- `src/recebimentos/reports.ts`: relatórios Excel/PDF.
- `src/App.tsx`, `src/styles.css`: integração e estilo do novo painel.
- `index.html`: ícone incorporado para eliminar a requisição 404 preexistente a favicon identificada na verificação do console.
- `tests/receipts*.ts`, `scripts/validate_receipts_reference.py`: testes e leitura independente; duas verificações existentes do menu passam a esperar cinco itens.
- `README.md`, `VALIDACAO.md` e este documento: instruções e evidências.

Execute `npm run dev -- --port 5173` e abra http://127.0.0.1:5173/. Em Gerenciar Base, importe a planilha, confira a referência, confirme e atualize. Abra Análise de Recebimentos; use os filtros e os botões de exportação da consulta. Não é necessário editar código para atualizar a base.
