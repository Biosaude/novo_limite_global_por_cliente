# Modernização visual e Gestão da Inadimplência

## Fase 1 — Modernização

A interface mantém as cores Biosaúde e os componentes existentes. Inter variável foi incluída localmente, com licença SIL OFL em `public/fonts`, sem buscar fontes na navegação. A tipografia passa a usar título de 26–28 px, seções de 18–19 px, KPIs de 26–32 px e textos descritivos de 12 px, com adaptação responsiva.

Os cinco KPIs da Visão Geral preservam todos os valores e percentuais, com altura uniforme, cantos arredondados e detalhes superiores corporativos. As barras de participação só aparecem para proporções matematicamente válidas. Roscas financeiras exibem o total no centro e mantêm legendas/valores/tooltips. Chips dos filtros globais removem uma dimensão mantendo as demais; ano e mês retornam ao padrão da posição, sem criar saldos históricos. Aging mantém multisseleção, gráficos, consultas e exportações. A Consulta de Títulos permanece como última seção; o Ranking removido não foi restaurado.

O padrão visual também alcança Recebimentos, Crédito, Auditoria e Gerenciar Base. Não foram alterados fórmulas, saldos, recebimentos, classificação financeira ou data-base.

Validação da fase visual: **58 testes de serviços, 108 testes de navegador existentes e quatro verificações visuais específicas aprovados**, incluindo alinhamento, fonte local, chips, proporções e tooltip. TypeScript/build aprovados. A primeira execução do teste novo posicionava o cursor no vazio da rosca; o teste foi corrigido e repetido nas quatro resoluções antes de iniciar a fase operacional.

[Desktop](preview-modern-desktop.png) · [Celular](preview-modern-mobile.png) · [Cinco KPIs](preview-modern-kpis.png).

## Premissas operacionais

A base atual possui saldos e recebimentos, mas não contém uma relação judicial comprovada nem histórico operacional de contatos e acordos. Nenhum processo, responsável ou tratamento será pré-cadastrado no produto.

O armazenamento existente usa IndexedDB opt-in para bases e propostas, sem autenticação de servidor ou cifragem própria. Não foi criada nova persistência automática de informações de cobrança. O acompanhamento operacional será mantido em memória, com histórico e backup/reimportação explícitos. Fechar ou recarregar a página perde esse estado; exportações devem permanecer sob controle do responsável, em local autorizado. Este fluxo não comprova a identidade do responsável declarado e não substitui autenticação administrativa.

Sem Neon, migração, deploy, integração judicial externa ou alteração de permissões.
