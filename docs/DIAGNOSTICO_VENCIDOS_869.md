# Diagnóstico dos 869 registros vencidos

Inspeção em 04/11/2026 do checkout `431efaca2a76cf8aa85f1c61979d6ead1469e96f` e da planilha enviada `Modelo_Base_Limite_Global_Biosaude (2).xlsx`. O arquivo real permanece fora do Git. SHA-256: `52f92845ca802c81f70b9696679915d66c8147deaf0edf30ea0c2bdfb9198d47`.

**Causa reproduzida: a coluna `Vr.aberto` da aba Vencidos contém 869 zeros numéricos na origem. Não há saldo positivo, negativo, nulo ou fórmula nessa coluna. O importador e os indicadores preservam esses zeros.** Não foi identificado erro de cálculo que autorize alterar o produto.

A leitura independente com openpyxl/Decimal e a leitura ExcelJS/normalizador concordam. `Vr.aberto` está na coluna N das duas abas de posição; `Vr.recebido` está na coluna O de Recebido. `Vr.duplicata` da aba Vencidos soma R$ 11.365.537,45, mas representa valor nominal: não comprova dívida atual e não substitui saldo aberto. Nenhum fallback para nominal foi introduzido.

## Conciliação

Referência: **04/11/2026**, informada pelo responsável (resposta `04/1102026`, interpretada como 04/11/2026), compatível com os 869 caches de dias vencidos, data de modificação e último recebimento. A constatação dos zeros independe dessa data.

| Medida | Planilha, leitura independente | Registros processados / navegador local |
|---|---:|---:|
| Registros A Vencer | 1.632 | 1.632 |
| Registros Vencidos | 869 | 869 |
| Registros Recebido | 4.988 | 4.988 |
| Total de registros | 7.489 | 7.489 |
| A Vencer | R$ 25.903.933,68 | R$ 25.903.933,68 |
| Vencidos | R$ 0,00 | R$ 0,00 |
| Exposição = A Vencer + Vencidos | R$ 25.903.933,68 | R$ 25.903.933,68 |
| Recebido YTD na referência de teste | R$ 87.937.753,47 | R$ 87.937.753,47 |
| Cada uma das cinco faixas | R$ 0,00 | R$ 0,00 |
| Inadimplência / exposição | 0% | 0% |
| Participações das faixas / vencidos | Indefinidas: denominador zero | `—` |
| Aging médio ponderado | Indefinido: peso total zero | Não aplicável |

Não há valores financeiros “depois” distintos dos originais. Nenhuma correção de saldos foi feita. Os testes não alimentam indicadores com esses valores de referência.

## Diagnóstico solicitado

1. **Saldos dos 869 títulos:** todos zero na fonte e no resultado; nenhum positivo/nulo/negativo.
2. **Coluna financeira:** sugestão automática mapeia `Vr.aberto`, índice 13 (coluna N), nas duas abas de posição. Conferência registro a registro verifica a célula financeira e a categoria originais.
3. **Conversão brasileira:** os saldos deste arquivo são células numéricas, sem erro bloqueante na normalização. Os testes existentes exercitam também `R$ 1.234.567,89`, centavos e rejeição de valores inválidos. Não há indício de conversão zerando esses 869 valores.
4. **Categoria:** normalização preserva o mapeamento da aba. Os 869 registros continuam `overdue`; nenhuma reclassificação ou exclusão.
5. **Filtros:** ano/mês delimitam apenas recebimentos; as posições permanecem. Conciliação independente por cliente e representante verifica somas e que a partição conserva todos os registros. Ano/mês e categoria também são exercitados.
6. **Backend/frontend:** `src/App.tsx` lê `localRepository` (IndexedDB), não a API financeira. `server/financial/handler.ts` mantém APIs financeiras indisponíveis em Production. Não há credencial DATABASE_URL configurada neste ambiente. O teste de navegador importa a fonte, salva e recarrega o IndexedDB local. O IndexedDB do navegador do usuário e a versão efetivamente implantada não foram acessados.
7. **Exposição:** `src/domain/finance.ts` soma somente `upcoming + overdue`; não inclui Recebido YTD.
8. **Faixas:** KPI, distribuição e gráfico recebem os mesmos registros filtrados. `agingBandIndex` usa referência menos vencimento, com limites exclusivos entre 1–30, 31–60, 61–90, 91–180 e >180. Faixas diagnósticas preservam divergências; não são reclassificadas para forçar conciliação. Neste arquivo todas as faixas financeiras somam zero, conciliando com Vencidos.
9. **Aging:** usa Σ(centavos × dias) / Σ centavos; saldos zero não têm peso. O resultado correto para esta fonte é indisponível, não uma média artificial dos dias dos 869 títulos.

Os documentos anteriores tratam de outras extrações (765 e 793 Vencidos); seus totais não são referências para esta base.

## Validação e reprodução

Pré-requisitos: Node >=22.12, dependências do lockfile (`npm ci`), Chromium e Python com openpyxl. O teste independente utiliza o script existente `scripts/validate_aging_reference.py` com a referência explícita. Arquivos privados não devem ser versionados nem anexados ao PR.

```bash
# Aponte para uma cópia privada desta extração fora do checkout.
export BIOSAUDE_INCIDENT_WORKBOOK='/caminho/privado/base.xlsx'
node --import tsx --test tests/overdue-source.test.ts
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  npm exec -- playwright test tests/overdue-source.spec.ts

# Regressões gerais; testes de extrações históricas exigem arquivos separados.
npm run test:unit
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  npm exec -- playwright test
```

A validação geral antes das adições passou com **102 testes de serviços** e **84 de navegador**; **8 + 24 testes históricos foram ignorados** por falta das respectivas planilhas. Build, tipos e inspeção de isolamento do bundle passaram. O aviso já existente sobre chunks maiores que 500 kB permanece.

Os testes adicionais passaram: **2 de serviços** (um sintético e um de conciliação real independente) e **4 de navegador com a planilha real**, nas quatro resoluções, sem falhas ou ignorados. Total das execuções distintas: **104 serviços e 88 navegador aprovados**, com os **32 históricos ignorados** mantidos separados. Uma tentativa inicial de serviços no sandbox terminou sem executar a suíte; a reexecução com permissões de runtime adequadas completou os dois testes. Os resultados de sucesso acima são da execução concluída.

As adições são somente testes e este relatório: nenhuma aplicação, regra financeira, layout, lockfile ou migração foi alterada. O teste sintético protege saldo zero contra substituição por nominal; o teste real compara fonte e processamento com leitura independente. O fluxo real de navegador verifica cinco faixas, percentuais sem denominador, KPIs, contagem, filtros, responsividade e persistência/releitura local em desktop, notebook, tablet e mobile.

## Pendências para corrigir a fonte

- Solicitar ao responsável pela extração os **saldos em aberto corretos**, ou uma explicação financeira de por que `Vr.aberto` está zerado na aba Vencidos. Contagem de títulos não comprova dívida positiva.
- Comparar, se necessário, a posição salva no navegador do usuário com a mesma fonte e seus mapeamentos. A releitura local de testes não equivale a inspeção do navegador de produção.
- O proxy negou o acesso HTTP ao site informado e à API GitHub com 403 no CONNECT. Domínios necessários foram adicionados ao rascunho de rede; salvar o rascunho não aplica a política à instância atual.

Não houve alteração de produção, merge, deploy, migração remota ou mudança da base financeira. Qualquer mudança na coluna de origem/regras exige dados e validação financeira específicos; este diagnóstico não autoriza tratar valor nominal como saldo devido.
