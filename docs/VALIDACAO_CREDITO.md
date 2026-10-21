# Validação financeira — Análise de Crédito

Arquivo real fornecido pelo usuário, mantido fora do repositório. Referência **19/10/2026**. Leitura inicial de abas, cabeçalhos e tipos realizada antes da implementação. Não foram criados indicadores a partir de constantes históricas.

## Conciliação da posição

| Métrica | Resultado |
|---|---:|
| Registros financeiros | 5.099 |
| Clientes por nome normalizado | 169 |
| A Vencer | R$ 25.711.247,24 |
| Vencidos (inadimplência) | R$ 10.575.015,21 |
| Exposição atual (sem recebido) | R$ 36.286.262,45 |
| Recebido YTD | R$ 56.999.819,30 |
| Recebimentos até o vencimento | 1.477 lançamentos |
| Recebimentos tardios | 1.274 lançamentos |
| Pontualidade por lançamento | 53,68956743% |
| Atraso médio tardio ponderado | 16,81619248 dias |
| Prazo emissão → recebimento ponderado | 77,49948863 dias |

O arquivo possui 2.751 lançamentos e 2.751 chaves de título distintas na aba Recebido; não há título com múltiplos recebimentos nesta amostra. O tratamento de pagamentos parciais foi testado com arquivo sintético específico, incluindo dois pagamentos de um mesmo título em meses diferentes. A presença em categorias diferentes, como o título histórico conferido, continua preservada.

A janela comum de recebimentos é de 02/01/2026 até 19/10/2026: **9,58064516 meses equivalentes** de calendário. Isso descreve a extração, sem provar que todas as operações de compra foram cobertas.

## Resultado da proposta (não aprovado)

Com os critérios iniciais propostos, há 45 clientes com limite-base provisório calculável. O restante tem limitações de amostra ou de operações a prazo identificáveis. As categorias observadas na **prévia da proposta**, sem aprovação administrativa, são: 8 Baixo, 11 Moderado, 9 Alto, 23 Crítico e 118 Dados insuficientes. Os parâmetros são editáveis e essa distribuição não é uma classificação oficial de crédito.

Todas as recomendações finais permanecem **Pendente de política de crédito**. Nenhum cliente recebeu limite aprovado ou crédito disponível autorizado na aplicação.

## Leitura independente

`scripts/validate_credit_reference.py` abre diretamente a planilha com openpyxl, usa Decimal e calendário Python e agrupa pelos cabeçalhos. Não chama o serviço TypeScript. A comparação abrange **todos os 169 clientes**, por hashes dos nomes, incluindo saldos, exposição, recebimentos, inadimplência, contagem de lançamentos e títulos, pontualidade, médias de atraso/pagamento, faixas, janela, mediana do prazo contratual, base provisória e prévia de risco.

Não são publicados nomes, títulos ou pacientes no relatório independente. Os resultados detalhados só são processados durante o teste. O script não é uma dependência do produto: ele serve para validação de desenvolvimento, com Python/openpyxl. O dashboard funciona no navegador sem instalar esses componentes.

## Testes e limites

**22 testes de serviços e 52 testes de navegador aprovados**, sem falhas ou testes ignorados na execução com a planilha oficial. A compilação TypeScript/Vite passou. O novo módulo também foi verificado sob a política de conteúdo configurada, sem requisições externas durante a importação e análise.

Os testes de serviço verificam normalização exata (sem aproximação), exposição sem recebimentos, divisão por zero, atraso antecipado/pontual/tardio, recebimentos parciais, médias por lançamento/título, ponderação por valor, calendário real, fórmula de base, risco observado, insuficiência, dados negativos, migração dos campos pela origem e governança pendente. O contrato futuro de política/limite aprovado é exercitado apenas em testes identificados, inclusive disponibilidade negativa com operação zero e excedente separado.

Os testes de navegador exercitam a importação e seleção de cliente, cinco gráficos, métricas individuais e origem, propostas versionadas sem aprovação, recarga local, substituição/reativação de bases e migração de IndexedDB v1. A conciliação da planilha real também é verificada no navegador em desktop, notebook, tablet e celular.

As capturas de crédito em `docs/preview-credito-*.png` usam **ARQUIVO_DE_TESTE_CREDITO.xlsx**, exclusivamente sintético, sem nomes ou valores oficiais. Testes e capturas locais não comprovam deploy, aprovação visual do administrador ou aprovação da política. Não houve deploy, acesso ao Neon, alteração de produção ou aprovação automática de crédito.
