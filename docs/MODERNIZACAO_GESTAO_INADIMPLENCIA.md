# Modernização visual e Gestão da Inadimplência

## Fase 1 — Modernização

A interface mantém as cores Biosaúde e os componentes existentes. Inter variável foi incluída localmente, com licença SIL OFL em `public/fonts`, sem buscar fontes na navegação. A tipografia passa a usar título de 26–28 px, seções de 18–19 px, KPIs de 26–32 px e textos descritivos de 12 px, com adaptação responsiva.

Os cinco KPIs da Visão Geral preservam todos os valores e percentuais, com altura uniforme, cantos arredondados e detalhes superiores corporativos. As barras de participação só aparecem para proporções matematicamente válidas. Roscas financeiras exibem o total no centro e mantêm legendas/valores/tooltips. O gráfico mensal destaca em vermelho o mês de referência quando há um ponto real correspondente, sem fabricar dados para meses ausentes. Chips dos filtros globais removem uma dimensão mantendo as demais; ano e mês retornam ao padrão da posição, sem criar saldos históricos. Aging mantém multisseleção, gráficos, consultas e exportações. A Consulta de Títulos permanece como última seção; o Ranking removido não foi restaurado.

O padrão visual também alcança Recebimentos, Crédito, Auditoria e Gerenciar Base. Não foram alterados fórmulas, saldos, recebimentos, classificação financeira ou data-base.

Validação da fase visual: **58 testes de serviços, 108 testes de navegador existentes e quatro verificações visuais específicas aprovados**, incluindo alinhamento, fonte local, chips, proporções e tooltip. TypeScript/build aprovados. A primeira execução do teste novo posicionava o cursor no vazio da rosca; o teste foi corrigido e repetido nas quatro resoluções antes de iniciar a fase operacional.

[Desktop](preview-modern-desktop.png) · [Celular](preview-modern-mobile.png) · [Cinco KPIs](preview-modern-kpis.png).

## Premissas operacionais

A base atual possui saldos e recebimentos, mas não contém uma relação judicial comprovada nem histórico operacional de contatos e acordos. Nenhum processo, responsável ou tratamento será pré-cadastrado no produto.

O armazenamento existente usa IndexedDB opt-in para bases e propostas, sem autenticação de servidor ou cifragem própria. Não foi criada nova persistência automática de informações de cobrança. O acompanhamento operacional é mantido em memória, com histórico e backup/reimportação explícitos. Fechar ou recarregar a página perde esse estado; exportações devem permanecer sob controle do responsável, em local autorizado. Este fluxo não comprova a identidade do responsável declarado e não substitui autenticação administrativa.

Sem Neon, migração, deploy, integração judicial externa ou alteração de permissões.

## Fase 2 — Gestão da Inadimplência

Navegação final: **Visão geral → Análise de Recebimentos → Gestão da Inadimplência → Análise de Crédito → Auditoria → Gerenciar Base**. O novo módulo usa a base ativa; não duplica Recebimentos, não muda rotas de servidor e não cria autenticação ou permissões administrativas simuladas.

### Indicadores e temporalidade

- **Total Vencido:** soma de `Vr.aberto` dos lançamentos da aba Vencidos, na posição importada, depois dos filtros aplicáveis. Ano/mês dos recebimentos não alteram o saldo de posição.
- **Cobrança administrativa / negociação:** saldo dos títulos com a respectiva etapa principal declarada. Se não há classificação suficiente, mostra Não disponível. Zero após classificação refere-se somente à cobertura conhecida, indicada como parcial.
- **Judicializado:** união dos títulos com vínculos documentais confirmados a processos de natureza judicial, com número, órgão e fonte informados. Cada lançamento é contado uma vez no consolidado, mesmo quando associado a vários processos. Procedimentos administrativos ficam separados. Sem informação, mostra Não disponível, e não zero.
- **Valor Recuperado:** fluxo líquido de recebimentos efetivos posteriores ao vencimento, limitado à posição, ano/mês e cliente/representante. É evidência de recebimento após inadimplência, não comprovação de recuperação da mesma carteira de abertura. Não reduz o saldo importado. Sem dados de pontualidade suficientes, fica indisponível; registros insuficientes são sinalizados.
- Quando há filtros operacionais (etapa, responsável, aging, ajuizamento ou pesquisa), o fluxo recebido é restrito aos títulos identificáveis na carteira selecionada por cliente + duplicata + parcela, ou título completo quando necessário. Recebimentos sem correspondência exata ficam fora desse recorte. Sem filtros operacionais, inclui todos os recebimentos pós-vencimento do cliente/representante no período, inclusive títulos já liquidados que não estão no estoque atual.
- **Taxa de Recuperação:** permanece **Não disponível**, com denominador explicitamente ausente. A base não oferece carteira elegível de abertura e conciliação por coorte suficiente para uma taxa válida. Não se divide pelo saldo vencido atual e não se soma recebido ao estoque para fabricar denominador.

A base nova, posição **23/10/2026**, mantém:

| Indicador | Resultado |
|---|---:|
| Exposição total da Visão Geral | R$ 36.056.572,20 |
| A Vencer | R$ 24.950.832,48 |
| Total Vencido | R$ 11.105.739,72 |
| Recebido YTD | R$ 57.902.017,98 |
| Aging médio ponderado | 401,31 dias |
| Recebimentos pós-vencimento no período | R$ 27.815.746,35 |
| Classificações operacionais fornecidas | Nenhuma |
| Relação judicial fornecida e conciliada | Nenhuma |
| Taxa de recuperação por carteira elegível | Não disponível |

O produto inicia sem contatos, acordos ou processos fictícios. Como não foi fornecida uma relação judicial estruturada nesta solicitação, nenhum ajuizamento foi transcrito ou inferido de imagens, nomes ou atraso. O modelo e o fluxo de importação estão preparados para dados fornecidos pelo responsável.

### Títulos, tratamentos e acordos

Um título é identificado pelo cliente normalizado (somente espaços e capitalização) + duplicata + parcela; na ausência, título completo ou linha de origem. Lançamentos parciais coincidentes são preservados e somados, sem eliminação automática. Como não há CNPJ único, coincidências exatas ainda podem exigir conferência documental; nomes semelhantes nunca geram vinculação automática.

As dez etapas solicitadas são disponíveis. Sem ação explícita, o título permanece **Pendente de classificação**, sem assumir Não iniciado. Cada nova ação acrescenta uma revisão com responsável declarado, data do contato, ação, resultado, próxima providência/data, observações e referência/valor de acordo opcionais. A etapa mais recente é a principal; revisões anteriores permanecem no histórico do título e no backup JSON. Valor de acordo não altera dívida. Marcar Recuperado ou Encerrado também não baixa saldo nem comprova quitação na planilha; a conciliação financeira continua necessária.

A etapa Judicializado exige um processo judicial documentalmente vinculado. Não é possível registrar essa etapa só por atraso. As ações não representam concessão de crédito, despacho judicial ou aprovação administrativa autenticada.

### Processos e conciliação

O formulário registra número, partes, natureza judicial/administrativa, tipo de ação, órgão, valor da causa, status informado, responsável, próxima providência e fonte documental. A seleção de títulos mostra cliente, duplicata/parcela e exige confirmação explícita. Um processo pode ligar múltiplos títulos e um cliente pode ter múltiplos processos. Revisões de processos são acrescentadas ao histórico completo, preservado no backup JSON; a tabela mostra a revisão e situação atuais.

Valor da causa é apenas informativo. Saldo conciliado vem da soma dos saldos importados dos títulos selecionados, respeitando os filtros. O recebido vinculado usa a identificação financeira exata dos lançamentos pós-vencimento, sem tratar uma linha como quitação integral. Processos sem vínculos mostram **Não conciliado**, sem inventar saldo zero. Valores individuais de processos com títulos compartilhados não devem ser somados; o KPI e o gráfico judicial utilizam a união dos títulos.

### Importação de processos

**Baixar modelo de processos** gera JSON vazio, sem exemplos fictícios no produto:

```json
{"format":"biosaude-process-list","version":1,"processes":[]}
```

Cada item de `processes` deve conter os campos abaixo, sem campos extras. Textos sem informação podem ser vazios; o sistema não inventa status.

| Campo | Tipo e significado |
|---|---|
| `number` | Texto obrigatório: número do procedimento/processo |
| `interested`, `opponent` | Textos: partes informadas |
| `kind` | `judicial` ou `administrative`, explicitamente informado |
| `actionType`, `court` | Textos: ação e órgão |
| `claimCents` | Centavos inteiros não negativos ou `null`; nunca saldo devedor |
| `status`, `responsible`, `nextStep` | Textos declarados pela fonte |

Arquivo máximo: 2 MB e 1.000 processos por relação. A importação mostra uma prévia e exige confirmação. Todos os processos entram sem títulos vinculados; a conciliação ocorre posteriormente pelo formulário. Não há consulta a sistemas judiciais externos. Os vínculos confirmados exigem também órgão e fonte documental.

### Memória, histórico e reimportação

O estado operacional fica em memória na aplicação, separado por identificador da base e data de referência. Navegar entre módulos mantém o acompanhamento da mesma sessão, sem misturar versões. Fechar/recarregar perde o estado operacional. Nenhuma tabela IndexedDB nova, localStorage, cookie, migração ou escrita em servidor foi criada.

**Exportar histórico JSON** inclui todas as ações e revisões de processos da posição, não apenas o filtro visível, com versão, referência e assinatura SHA-256 dos dados financeiros normalizados. O arquivo não contém a planilha original ou campos de pacientes, mas contém dados financeiros e operacionais sensíveis em texto claro: deve ser guardado somente em local autorizado. O fluxo não é uma garantia de armazenamento seguro ou autenticação de autoria.

**Reimportar histórico** aceita até 4 MB, valida esquema/campos/valores, exige a mesma assinatura da posição financeira e mostra prévia antes de confirmação. A reimportação de uma cópia idêntica da base, com novo identificador da sessão, é permitida. Mudança de referência ou valores rejeita o arquivo. Histórico idêntico não duplica registros; identificadores divergentes, sequências conflitantes/incompletas ou vínculos inválidos são rejeitados. Novos registros são mesclados, sem apagar atualizações anteriores. Se o estado mudar depois da prévia, ela é descartada para evitar sobrescrita com uma cópia antiga.

### Relatórios

A consulta da carteira e os indicadores respondem aos filtros aplicáveis. Todos os resultados são exportados, sem limitar à página visível e sem campos de pacientes:

- **Pendências Financeiras:** metadados, filtros, posição, totais e lançamentos detalhados.
- **Tratamento de Inadimplência:** os mesmos dados, mais o histórico de ações dos títulos selecionados.
- **Processos Ajuizados:** processos judiciais selecionados, suas causas informativas, conciliação, fonte e duplicatas com vínculo judicial confirmado. Os detalhes financeiros são a união desses títulos, sem dupla contagem; não incluem procedimentos administrativos como se fossem judiciais.

Excel mantém valores monetários numéricos; PDF usa fonte local, A4 paisagem e paginação. Ambos registram data-base, filtros, cliente, duplicata/parcela, vencimento, dias, saldo, etapa, responsável, última ação, próxima providência e processo quando disponível. O resumo distingue saldo total da consulta e saldo detalhado do relatório judicial. Valores inválidos bloqueiam os relatórios. Os downloads são gerados localmente; não enviam arquivos para serviços externos.

## Validação final

**Resultado final: 68 testes de serviços e 128 testes de navegador aprovados (196 testes distintos), sem falhas ou testes ignorados. TypeScript e build Vite aprovados.** A fase visual foi validada antes do início da implementação operacional, no commit `010853b`. Após o refinamento do destaque do mês, das datas operacionais brasileiras e da prévia de importação, foram repetidos os dez testes de serviços do novo módulo e 20 fluxos visuais/operacionais de navegador, todos aprovados. Os quatro fluxos de conciliação/relatórios também foram repetidos após a inclusão dos percentuais da participação judicial e passaram. O aviso de tamanho do chunk ExcelJS já existente permanece; não foram adicionadas dependências.

Também foi gerado e reaberto o Excel completo da carteira real: **793 registros/títulos, R$ 11.105.739,72**, sem tratamentos ou processos presumidos. O PDF correspondente tem 48 páginas A4 paisagem, total conciliado e zero palavras fora dos limites das páginas na verificação de coordenadas com Poppler. Os relatórios reais ficam privados no ambiente e fora do repositório.

Os testes novos cobrem posição e recebimentos separados, ausência de classificação, histórico imutável, etapas exclusivas, múltiplos processos e títulos compartilhados, vínculo administrativo versus judicial, falta de documentação, revisões, conflitos, assinatura da base, filtros, recuperação sem denominador, importação sem vínculos presumidos e os três relatórios Excel/PDF. No navegador, também conferem navegação, memória após recarga, backup/reimportação, base real, responsividade e erros JavaScript/console. As permissões existentes foram mantidas; não há teste de identidade administrativa porque esse mecanismo não existe nem foi simulado.

```bash
BIOSAUDE_TEST_WORKBOOK='/caminho/Faturamento A Vencer, Vencido e Faturado.xlsx' \
BIOSAUDE_UPDATED_WORKBOOK='/caminho/Modelo_Base_Limite_Global_Biosaude.xlsx' \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
BIOSAUDE_CAPTURE_MODERN=1 BIOSAUDE_CAPTURE_MANAGEMENT=1 npm test
```

## Arquivos e capturas

- `src/components/DonutTotal.tsx`, `FinancialKpis.tsx`, `FinancialCharts.tsx`, `InadimplenciaDistribution.tsx`, `src/recebimentos/ReceiptCharts.tsx`, `src/styles.css`, `public/fonts/*`: modernização visual.
- `src/App.tsx`: menu, chips e estado operacional em memória por base/referência.
- `src/inadimplencia/model.ts`: histórico, validação, filtros, conciliação, assinatura e importações.
- `src/inadimplencia/ManagementModule.tsx`, `ManagementCharts.tsx`: painel operacional e gráficos.
- `src/inadimplencia/reports.ts`, `reportConfig.ts`: relatórios locais.
- `tests/modern-visual.spec.ts`, `tests/management*.ts`: testes novos; testes existentes do menu atualizados para seis módulos.
- `README.md`, `VALIDACAO.md` e este relatório: instruções e evidências.

[Cards modernizados](preview-modern-kpis.png) · [Visão Geral desktop](preview-modern-desktop.png) · [Visão Geral celular](preview-modern-mobile.png) · [Gestão desktop](preview-management-desktop.png) · [Gestão celular](preview-management-mobile.png) · [Demonstração de vínculos com processos sintéticos](preview-management-processes.png).

Capturas usam apenas dados sintéticos identificados de teste; nenhuma relação judicial fictícia é embutida no produto. Os arquivos financeiros reais permanecem fora do Git.

## Visualização

Execute `npm run dev -- --port 5173` e abra http://127.0.0.1:5173/. Em Gerenciar Base, importe/valide/ative a planilha e confira a referência. Abra Gestão da Inadimplência. Para acompanhar um título, selecione a duplicata no Controle de cobranças, preencha a ação e registre. Para processos, cadastre ou importe a relação, confira a documentação, selecione os títulos e confirme os vínculos. Exporte o histórico antes de encerrar a sessão; reimporte-o explicitamente ao retomar a mesma posição financeira.

Nenhum deploy foi executado. A atualização da Vercel permanece sob responsabilidade do usuário após revisão da PR.
