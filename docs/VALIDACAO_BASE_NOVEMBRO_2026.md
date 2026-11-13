# Resultado da validacao da planilha mais recente (13/11/2026)

Esta ficha registra apenas **agregados nao sensiveis** obtidos da copia local enviada pelo usuario: `A RECEBER - RECEBIDOS 2026 (1)(1).xlsx`. O arquivo Excel contem dados pessoais e **nao deve ser commitado ao GitHub**.

## Resultado independente (openpyxl read_only/data_only)
| Aba | Registros | Coluna financeira | Valor (R$) |
|---|---:|---|---:|
| VENCIDO | 882 | Vr.aberto (V) | 11.738.096,38 |
| A VENCER | 1.551 | Vr.aberto (V) | 24.010.172,55 |
| RECEBIDO | 5.112 | Vr.recebido (W) | 90.070.393,61 |
| TOTAL | 7.545 | Movimentacao (saldos + recebido) | 125.818.662,54 |

Total em aberto: **R$ 35.748.268,93**. Totais obtidos por soma com `Decimal`, sem arredondamento intermediario.
Os tres relatorios usam cabecalho na linha 2, dados a partir da linha 3, 41 colunas. A VENCER/VENCIDO exibem `VA0529`; RECEBIDO exibe `VA0527`.
Períodos do próprio arquivo: VENCIDO ate 09/11/2026, A VENCER a partir de 10/11/2026, RECEBIDO entre 01/01/2026 e 11/11/2026. **A data de posicao unica 11/11/2026 nao pode ser presumida** porque o corte de vencimento difere do corte de recebidos.

## Achados de controle antes da ativacao
1. Na aba RECEBIDO, foi encontrada **uma repeticao de chave** `Duplicata + Parcela + Numero do titulo completo` nas linhas Excel **2849 e 2888**, mesmo cliente e mesmo valor R$ 65.000,00, mas datas de recebimento distintas (10/07/2026 e 14/07/2026). **Nao eliminar automaticamente**: pode ser recebimento parcial, estorno, novo pagamento ou duplicidade de extracao. Confirmar situacao financeira e como o novo importador gera IDs exclusivos. Se forem recebimentos distintos, ambos devem continuar contados, sem unificar apenas pelo titulo.
2. A coluna de dias da aba A VENCER tem 19 valores negativos, 12 zeros e 1.520 positivos. Dias devem ser recalculados pelo criterio do novo aplicativo (data de referencia), sem mudar categorias ou saldos por mera heuristica.
3. A base historica de 19/10/2026 deve ser preservada separadamente; a planilha de novembro e apenas candidata a base ativa ate testes.
4. Este diagnostico **nao** reproduziu o importador TypeScript, as 2.376 auditorias antigas, a autenticacao Neon Auth, os testes de runtime e o esquema de banco em Production. Portanto **nao e autorizacao para publicar**.

## Caminho minimo ate producao
- Implementar/validar importacao integral da planilha recente no fluxo do repositorio (preservar `source.sheets` e `mappings`; conferir valores e contagens exatamente por categoria; avaliar registro repetido e 19 dias negativos).
- Homologar na branch Neon `homologacao-migracao-limite-global-20261113`, incluindo workspace de teste, autorizacao e RLS, sem tocar em Production. Nao importar dados reais no Git.
- Reconciliar base historica, garantindo versoes e trilha de auditoria se o historico for migrado. Nao confundir substituicao de base ativa com perda/reescrita de historico.
- Preparar migracoes versionadas, checksums e roles minimas em Production apos prova de rollback; configurar Auth e ambiente com gates inicialmente desligados. Testar depois fazer go/no-go.
- Nao usar `biosaude_api_prod` administrativo como role runtime; proteger PII nas exportacoes e nos logs.

## Bloqueios
Nenhuma credencial de Neon ou Vercel com capacidade de executar transacoes/deploy foi conectada neste ambiente. GitHub/PR por si nao efetua alteracoes do banco. Nao alegar que houve migracao, ativacao, merge ou deployment em Production.
