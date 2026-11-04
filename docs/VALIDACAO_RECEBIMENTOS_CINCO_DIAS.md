# Recebimentos: cinco dias corridos e rodapés

Implementação em branch a partir de `main` (`431efac`), em 04/11/2026. Nenhum merge, deploy, alteração de banco ou migração executado.

## Regra e escopo

A diferença entre recebimento efetivo e vencimento usa dias civis UTC:

- Menor que zero: Antecipado.
- De zero a cinco, inclusive: Em dia.
- Seis dias ou mais: Pós-inadimplência.
- Sem datas confiáveis: Prazo indeterminado, preservado na conciliação e indicado na auditoria existente.

Sábados, domingos e feriados contam como dias corridos. Nenhuma categoria de tolerância foi criada. A mudança fica na análise gerencial de recebimentos; não reclassifica categorias originais, títulos ainda em aberto ou regras da análise de crédito. Gráficos mensais, trimestrais, participação, consulta e relatórios recebem as mesmas classificações de `receiptRows`.

Os cards estão na ordem Recebido Total, Antecipadamente, em Dia, Pós-Inadimplência e de Títulos Ajuizados. Cada participação usa o valor do card dividido pelo total filtrado, com duas casas decimais brasileiras. Total zero exibe `—`; ajuizamento desconhecido exibe Dados indisponíveis e Participação indisponível. Ajuizados são subconjunto complementar e não entram novamente na soma.

No rodapé de Recebido em Dia, abaixo do percentual, foi incluído o texto exato:

> Considera pagamentos recebidos até 5 dias corridos após o vencimento.

Os rodapés reservam espaço uniforme para contagem, participação e nota. O texto usa 11 px, entrelinha 1,5 e cinza `#627087` sobre branco (contraste aproximado de 5:1). Cards brancos, bordas, ícones e tipografia seguem o painel. A grade usa cinco colunas em telas largas, três em intermediárias, duas em tablet e uma em celular.

## Conciliação com a fonte disponibilizada

Arquivo privado `Modelo_Base_Limite_Global_Biosaude (2).xlsx`, referência 04/11/2026. A leitura independente usa openpyxl/Decimal, separada do normalizador TypeScript. Este arquivo é a fonte disponibilizada na sessão; os resultados não comprovam o estado atual do banco ou do navegador de produção.

| Card | Antes da regra | Depois | Participação depois |
|---|---:|---:|---:|
| Recebido Total | R$ 87.937.753,47 | R$ 87.937.753,47 | 100,00% |
| Antecipadamente | R$ 30.664.455,20 | R$ 30.664.455,20 | 34,87% |
| Em Dia | R$ 11.537.906,04 (na categoria anterior) | R$ 37.045.859,91 | 42,13% |
| Pós-Inadimplência | R$ 45.735.392,23 | R$ 20.227.438,36 | 23,00% |
| Títulos Ajuizados | Dados indisponíveis | Dados indisponíveis | Participação indisponível |

Os 4.988 lançamentos recebidos continuam preservados: 1.679 antecipados, 2.070 em dia e 1.239 pós-inadimplência. Os 1.467 lançamentos recebidos de um a cinco dias após o vencimento mudam somente de grupo gerencial, transferindo R$ 25.507.953,87 para Em dia. A soma das categorias, incluindo indeterminados quando existirem, continua igual ao total recebido. Pagamentos parciais não são removidos ou considerados quitação integral.

A Vencer (R$ 25.903.933,68), Vencidos (R$ 0,00 nessa fonte), Exposição (R$ 25.903.933,68) e Recebido YTD (R$ 87.937.753,47) permanecem iguais. A aplicação não altera nenhuma célula, registro financeiro ou dado persistido para aplicar a regra.

## Testes

Os testes de serviços incluem limites de -1, 0, 1, 5 e 6 dias, mudança de mês/ano, feriados de 02/11 e 01/01, fins de semana, ano bissexto, pagamentos parciais, datas inválidas, valores negativos, classificação desconhecida, filtros combinados, séries mensais/trimestrais, exportações e imutabilidade do dataset original.

Os testes de navegador verificam ordem e valores dos cinco cards, percentuais e denominador zero, ausência de informação judicial, nota abaixo da participação e dentro do card, rodapés alinhados, alturas iguais por linha, largura sem rolagem horizontal e funcionamento das demais seções. A fonte real é conciliada com Python e os KPIs da Visão geral são conferidos após a análise de recebimentos.

Resultado: **104 testes de serviços e 92 de navegador aprovados**, sem falhas; **8 serviços e 24 navegador históricos ignorados** por falta das respectivas extrações antigas. Os testes da extração de 04/11 executaram e passaram. Build, tipos de frontend/servidor e inspeção do bundle passaram. O aviso preexistente sobre chunks acima de 500 kB continua sem erro de build. A inspeção visual usa 1920, 1440, 834 e 390 px; a grade intermediária de três colunas também é verificada em 1200 px. Após uniformizar a cor dos percentuais, o build e os quatro cenários visuais dos cards foram repetidos; reexecuções não são somadas aos totais acima.

Comandos, no diretório do repositório:

```bash
npm ci
export BIOSAUDE_CURRENT_WORKBOOK='/caminho/privado/Modelo_Base_Limite_Global_Biosaude (2).xlsx'
npm run test:unit
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm exec -- playwright test
```

As variáveis BIOSAUDE_TEST_WORKBOOK e BIOSAUDE_UPDATED_WORKBOOK continuam reservadas às extrações históricas de 19/10 e 23/10. Não usar a extração de 04/11 nesses testes. Os testes reais são ignorados quando seu arquivo não está disponível. Não versionar planilhas, dados pessoais ou capturas com registros reais.

## Capturas e arquivos

As capturas usam somente a fixture identificada como sintética: total R$ 1.100,00, antecipado R$ 200,00 (18,18%), em dia R$ 500,00 (45,45%), pós-inadimplência R$ 400,00 (36,36%) e ajuizado R$ 600,00 (54,55%, complementar).

- [Cards desktop](preview-receipts-five-day-desktop.png).
- [Cards mobile](preview-receipts-five-day-mobile.png).

Arquivos funcionais: `src/recebimentos/analysis.ts`, `src/recebimentos/ReceiptsModule.tsx`, `src/styles.css`. Verificação independente: `scripts/validate_receipts_reference.py`. Testes: `tests/receipts.test.ts` e `tests/receipts.spec.ts`. Documentação: README, metodologia do painel, este relatório e as capturas sintéticas.

Nenhuma declaração de dependência, lockfile, filtro ou regra de saldos foi alterada. O banco não é necessário para aplicar a classificação gerencial à base já importada. Não houve conexão ou escrita remota no Neon.
