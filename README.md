# BIOSAÚDE — Limite Global por Cliente

Dashboard financeiro em React, TypeScript e Vite. A primeira etapa funciona integralmente no navegador: importação Excel, conferência, indicadores, gráficos, rankings, filtros, detalhamento e auditoria. Não há conexão ao Neon, autenticação administrativa ou backend de dados.

## Utilização

1. Abra o site disponibilizado pelo responsável pelo projeto. Nesta entrega, o código segue em branch para revisão via PR; atualizar a aplicação na Vercel é uma ação separada do responsável.
2. Acesse **Gerenciar Base** e selecione o arquivo `.xlsx`.
3. Informe a data da extração. `19/10/2026` é a referência histórica inicial, não a data atual automática.
4. Confira todas as abas, a linha do cabeçalho e as colunas. Para A Vencer e Vencido, mapeie **saldo em aberto**; para Recebido, **valor efetivamente recebido** e **data de recebimento**. Não use o valor nominal da duplicata.
5. Clique em **Validar estrutura e calcular totais**. Confira quantidade de registros, valores e ocorrências.
6. Confirme a utilização da base ou a substituição da base anterior. Erros de valores ou de datas essenciais de recebimento bloqueiam a confirmação. Advertências não excluem registros nem bloqueiam o dashboard.
7. Use Visão geral, Clientes, Representantes e Auditoria. Clique no nome de um grupo para abrir os títulos e consultar todas as células originais de um registro.

A base anterior permanece ativa enquanto um novo arquivo é processado, se houver erros ou enquanto não houver confirmação explícita da substituição. Abas desconhecidas exigem categoria definida; não são ignoradas automaticamente. Cabeçalhos repetidos continuam distinguíveis pelo número da coluna. Linhas vazias e conteúdo anterior ao cabeçalho ficam preservados na origem, com suas contagens na conferência, sem entrar como títulos financeiros.

O sistema aceita `.xlsx` sem senha, até 20 MB, até 100.000 linhas de dados e 256 colunas por aba, 2 milhões de células no total e 150 MB descompactados. Arquivos ilegíveis, sem registros ou acima dos limites são rejeitados; não há truncamento silencioso. Não há execução nem recálculo de fórmulas: utiliza-se o resultado salvo no Excel. Resultados zero de fórmulas compartilhadas são recuperados do OOXML original para contornar uma omissão do ExcelJS.

## Regras financeiras

- **A Vencer:** soma de `Vr.aberto` na categoria A Vencer.
- **Vencido:** soma de `Vr.aberto` na categoria Vencido.
- **Recebido YTD:** soma de `Vr.recebido` com `Dt.recebimento` entre 1º de janeiro do ano escolhido e o menor valor entre o fim do mês selecionado e a data de referência.
- **Limite Global:** soma dos três componentes acima. Não é um crédito contratual concedido.

Valores são convertidos com Decimal.js para centavos inteiros, somados dentro da faixa segura de inteiros e formatados em reais somente na interface. Valores inválidos, com precisão superior a centavos ou com overflow são bloqueantes. Valores negativos são preservados e advertidos. Datas civis e diferenças de dias usam UTC para evitar variações de fuso horário.

**Saldos de posição não são séries históricas.** Os filtros de ano e mês alteram o período dos recebimentos; os saldos A Vencer e Vencido continuam sendo os da extração importada. A interface informa explicitamente a data da posição e o intervalo YTD. Não se reclassificam títulos automaticamente com a data de hoje.

Os filtros globais de cliente, representante e categoria atualizam cards, gráficos, rankings e auditoria. A pesquisa e a ordenação dentro da tabela atuam somente no ranking exibido. Valores recebidos fora do YTD são preservados na origem e voltam a compor as consultas quando seu período é selecionado. Os gráficos mensais incluem apenas meses presentes na seleção. Composição percentual não é desenhada para saldos negativos, pois um gráfico de setores seria enganoso; o comparativo continua disponível.

## Auditoria

São verificadas ausências de cliente/título/representante/vencimento, valores negativos ou inválidos, inconsistências de categoria e vencimento, diferenças dos dias informados e possíveis repetições ou sobreposições por cliente e título. A definição de dias calculados é `data de referência − vencimento`, com valores negativos para vencimentos futuros.

Uma sobreposição entre A Vencer e Recebido pode representar pagamento parcial. Nenhum registro é deduplicado ou excluído automaticamente. Cada ocorrência mostra origem e linha. É possível registrar uma justificativa de conferência **local**; isso não simula autenticação, autorização ou assinatura administrativa. As ocorrências permanecem visíveis depois da justificativa.

## Privacidade e persistência

A planilha é lida em um Web Worker no próprio navegador. Não há upload, telemetria, fontes remotas, API de dados ou envio dos registros para a Vercel. A configuração de hospedagem inclui política de conteúdo que restringe conexões à origem do site.

Por padrão, os dados ficam somente na memória da aba e desaparecem ao recarregar/fechar. A opção **Lembrar a nova base neste navegador** usa IndexedDB no mesmo dispositivo. Justificativas seguem a mesma opção de persistência. Não há sincronização ou backup: limpar os dados do site remove a base. Outros usuários do mesmo perfil do navegador podem acessá-la; use dispositivo confiável. **Remover base deste navegador** apaga a base ativa local. Uma falha ao salvar não confirma a substituição; a interface mostra a mensagem e mantém a base anterior.

Não incluir planilhas, registros, credenciais, screenshots com dados reais ou bancos locais no Git. A planilha oficial foi usada externamente nos testes e não faz parte do repositório. Os valores históricos nos testes são referências de conciliação; nenhum desses valores alimenta componentes ou indicadores da aplicação.

## Executar no próprio computador

Requer Node.js 22.12 ou superior, necessário para Vite e TypeScript.

```sh
git clone https://github.com/Biosaude/novo_limite_global_por_cliente.git
cd novo_limite_global_por_cliente
npm ci
npm run dev
```

Abra no **mesmo computador** o endereço informado pelo Vite. Endereços locais de uma máquina remota não são links de acesso público.

```sh
npm run build
npm run preview
```

O build gera `dist/`. Na Vercel, o projeto usa o preset Vite, `npm run build` e saída `dist`. Não configure variáveis do Neon nem credenciais para esta etapa. Depois da atualização na Vercel, importe o Excel no seu próprio navegador; a aplicação publicada começa sem uma base financeira embutida.

## Testes

```sh
npm ci
npx playwright install chromium
npm test
```

Os testes de navegador compilam a aplicação e executam sobre o build de produção, em desktop e mobile. Se já houver Chromium no sistema:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

Para incluir a planilha oficial na conciliação de serviços e nos testes de navegador, indique seu arquivo **fora do checkout**:

```sh
BIOSAUDE_TEST_WORKBOOK="/caminho/privado/planilha.xlsx" npm test
```

Sem essa variável, os testes com o arquivo oficial são marcados como ignorados, não aprovados. Os demais casos usam fixtures sintéticas criadas apenas nos testes; não há dados de demonstração no produto. Consulte `VALIDACAO.md` para as evidências da execução com o arquivo fornecido.

## Estrutura

- `src/importacao`: leitura Excel em worker, cache OOXML de fórmulas, sugestão de mapeamento e normalização.
- `src/domain`: contratos, datas, precisão monetária, filtros e agregações.
- `src/auditoria`: regras de conferência independentes da interface.
- `src/persistencia`: contrato de repositório e implementação IndexedDB, substituível futuramente por integração autorizada.
- `src/components`: gerenciamento, gráficos, rankings, auditoria e detalhamento.
- `tests`: testes de serviços e fluxos completos em navegador.

A integração ao Neon, a administração autenticada e a publicação de bases para visitantes pertencem às etapas seguintes e exigem autorização própria. Esta aplicação não oferece segurança de acesso baseada em controles do frontend.
