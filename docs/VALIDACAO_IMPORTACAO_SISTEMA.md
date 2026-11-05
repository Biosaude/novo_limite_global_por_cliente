# Importação direta do sistema por código e boleto

Implementação em `feat/system-workbook-client-identifiers`, a partir de `main` (`c87b375`), em 05/11/2026. As alterações anteriores de recebimentos de até cinco dias estão preservadas.

## Fonte e mapeamento

Arquivo fornecido: `A RECEBER - RECEBIDOS 2026.xlsx`, mantido fora do Git. SHA-256: `e3175748343ae80d2bac862eb6dfeea8d4cc2d45447b20ae05c027c14f82b9fd`. Referência usada na conciliação: 04/11/2026, compatível com a extração recebida. A data da posição continua sendo confirmada pelo operador, não fixada no produto.

As três abas têm 41 colunas. A linha 1 contém identificação do relatório/período; a linha 2 contém o cabeçalho e os registros começam na linha 3. A detecção é pelos cabeçalhos, sem depender de renomear o arquivo ou de posições fixas dos demais campos.

| Informação | Coluna original | Tratamento |
|---|---|---|
| Código do Cliente | A / Codigo | Identidade do cliente, preservada como texto |
| Nome | B / Nome cliente | Exibição e pesquisa; variantes preservadas |
| Saldo aberto | V / Vr.aberto | A Vencer e Vencidos, sem nominal como fallback |
| Recebido efetivo | W / Vr.recebido | Recebido, com a regra gerencial existente |
| Representante primário | AF / Nome representante | Associado a Cod.representante 1, em AE |
| Boleto | AN / Nr.boleto | Texto; não usa Number/parseInt/parseFloat |
| Título completo | AO | Preservado |

O segundo Nome representante (AH), as descrições/observações repetidas e todas as demais células permanecem no workbook de origem. A seleção automática do representante só resolve a duplicidade quando há associação inequívoca com Cod.representante 1.

## Identidade e integridade

Novas importações gravam `clientCode`, `boleto` e `companyCode` no registro normalizado; código e boleto são exigidos no mapeamento do esquema do sistema. Código ausente é erro bloqueante, sem remover a linha. Boleto ausente é válido e é representado por string vazia, com exibição Boleto não informado.

Os campos são opcionais no contrato TypeScript de versões antigas para manter a leitura das bases legadas. A restauração local recupera os identificadores a partir da origem quando ainda não estavam persistidos, sem recalcular ou escrever saldos. O payload JSON do servidor preserva os novos campos; o validador aceita versões antigas e valida os tipos dos campos presentes. Não é necessária alteração de esquema SQL.

A identidade usa código + contexto de empresa, dentro da posição selecionada. Mesmo código na mesma empresa consolida nomes diferentes; códigos distintos não se fundem por terem nomes iguais. Quando há coluna de empresa, ela é reconhecida ou pode ser mapeada explicitamente. O arquivo fornecido não tem empresa: os códigos são utilizados no escopo dessa exportação/posição, sem misturar versões ou outros arquivos. Empresas diferentes dentro de um mesmo arquivo precisam estar identificadas para poderem ser distinguidas; o sistema não inventa esse contexto.

No arquivo real foram encontrados 249 códigos de cliente e nenhuma variante de nome por código. A consolidação de variantes, separação de homônimos e colisões de código entre empresas foi validada com uma fixture exclusivamente sintética.

Filtros principais e de recebimentos, gráficos/rankings, contagens, identificação de títulos, cobrança e crédito usam o código/contexto. Os nomes originais continuam visíveis no detalhamento e pesquisáveis. Bases legadas sem código mantêm a regra anterior por nome. A classificação financeira, centavos, datas, cinco dias gerenciais e limites de aging não mudaram.

## Boletos

O exportador preenche o boleto com apóstrofo inicial e espaços de alinhamento. O importador remove somente esse prefixo e o preenchimento externo. Zeros à esquerda, dígitos longos, pontuação e apóstrofos internos são preservados. Identificadores numéricos fora da precisão segura são bloqueados com orientação para exportar como texto; não são arredondados silenciosamente.

| Aba | Registros | Boleto preenchido | Não informado |
|---|---:|---:|---:|
| VENCIDO | 869 | 168 | 701 |
| A VENCER | 1.585 | 649 | 936 |
| RECEBIDO | 4.988 | 677 | 4.311 |
| Total | 7.442 | 1.494 | 5.948 |

O boleto preenchido com zero à esquerda da aba A Vencer foi preservado. A fixture sintética também verifica identificadores de 23 dígitos, superior à precisão de Number, além de boleto vazio, espaços e apóstrofo seguido apenas de espaços.

Código e boleto foram incluídos nos detalhamentos geral, de cobrança, recebimentos e crédito e nos relatórios Excel/PDF. As pesquisas de consultas aceitam código, nome e boleto. As exportações Excel gravam esses campos como strings com formato `@`; o PDF de cobrança foi ajustado à largura A4 para comportar as novas colunas.

## Conciliação independente

Python/openpyxl/Decimal, independente do leitor ExcelJS e normalizador TypeScript, verificou todas as 7.442 linhas por aba/linha, valor financeiro e hash de código + boleto. As partições por cada código também conciliam com a leitura independente. Nenhuma linha foi excluída ou deduplicada.

| Indicador | Fonte independente | Dashboard local |
|---|---:|---:|
| A Vencer | R$ 25.267.506,75 | R$ 25.267.506,75 |
| Vencidos | R$ 11.205.830,68 | R$ 11.205.830,68 |
| Exposição | R$ 36.473.337,43 | R$ 36.473.337,43 |
| Recebido YTD | R$ 87.937.753,47 | R$ 87.937.753,47 |

Esses são os valores deste original, sem substituir seus saldos pelos de outra extração. A classificação por código não altera as somas globais; altera somente a chave de consolidação e seleção dos clientes.

## Modelo e compatibilidade

O modelo baixável reproduz exatamente os 41 cabeçalhos, sua ordem e os nomes das três abas originais, com cabeçalho na linha 2, colunas A e AN em formato de texto e nenhuma linha financeira artificial. A equivalência dos cabeçalhos com o original foi testada automaticamente.

As fixtures de regressão da estrutura anterior ficaram em `tests/legacy-template.ts`, para continuarem exercitando as bases antigas e fórmulas históricas sem depender do novo modelo baixável. Não há código legado adicional no bundle do produto por causa dessa fixture.

## Validação executada

- Serviços: 107 aprovados; 9 verificações de outras extrações não habilitadas nesta rodada.
- Navegador: 96 aprovados; 28 verificações de extrações diferentes ignoradas. Inclui o original do sistema e persistência/releitura local em desktop, notebook, tablet e celular.
- Build, tipos de frontend/servidor e inspeção do bundle aprovados. O aviso preexistente de chunks acima de 500 kB permanece sem erro de build.
- Testes de agrupamento, empresas distintas, homônimos, nomes variantes, pesquisa por identificador, payload JSON, exportação textual e compatibilidade antiga passaram.
- Após ajustes finais nos detalhes e relatórios, repetidas 16 verificações de navegador afetadas, todas aprovadas; reexecuções não são somadas aos totais acima. PDFs sintéticos de cobrança e recebimentos também foram extraídos com pdftotext, confirmando boleto completo com zeros à esquerda.

Reprodução no diretório do repositório:

```bash
npm ci
export BIOSAUDE_SYSTEM_WORKBOOK='/caminho/privado/A RECEBER - RECEBIDOS 2026.xlsx'
npm run test:unit
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm exec -- playwright test
```

O arquivo real, registros pessoais e screenshots reais não devem ser versionados. As capturas de testes usam somente fixtures sintéticas. Sem BIOSAUDE_SYSTEM_WORKBOOK, os cenários que exigem esse original são ignorados, não considerados aprovados.

## Arquivos e limites

- Identidade/importação: `src/domain/clients.ts`, `types.ts`, `finance.ts`; `src/importacao/mapping.ts`, `normalize.ts`, `identifiers.ts`, `template.ts`.
- Aplicação: filtros em App, identificação em auditoria, cobrança, recebimentos e crédito; campos nos componentes de detalhes e relatórios.
- Compatibilidade: repositório local, validador de entrada e codec JSON do servidor; nenhum arquivo de migração alterado.
- Verificação: `scripts/validate_system_reference.py`, `tests/system-workbook*`, regressões do modelo e fixtures legadas.

Não houve consulta/escrita em banco remoto, alteração dos dados do arquivo, merge ou deploy. A restauração local foi validada no navegador de testes; não é inspeção do IndexedDB do usuário em produção.
