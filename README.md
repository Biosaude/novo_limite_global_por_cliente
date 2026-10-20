# BIOSAÚDE — Limite Global por Cliente

Dashboard financeiro em React, TypeScript e Vite. A primeira etapa funciona integralmente no navegador: importação Excel, conferência, indicadores, gráficos, rankings, filtros, detalhamento e auditoria. Não há conexão ao Neon, autenticação administrativa ou backend de dados.

## Utilização

1. Abra o site disponibilizado pelo responsável pelo projeto. Nesta entrega, o código segue em branch para revisão via PR; atualizar a aplicação na Vercel é uma ação separada do responsável.
2. Acesse **Gerenciar Base**. Use **Baixar Modelo da Base** caso precise da estrutura oficial vazia ou clique em **Selecionar Nova Base** para escolher o arquivo `.xlsx`.
3. Informe a data da extração. `19/10/2026` é a referência histórica inicial, não a data atual automática.
4. Confira todas as abas, a linha do cabeçalho e as colunas. Para A Vencer e Vencidos (inadimplência), mapeie **saldo em aberto**; para Recebido, **valor efetivamente recebido** e **data de recebimento**. Não use o valor nominal da duplicata.
5. A prévia é calculada automaticamente quando as abas e colunas são reconhecidas. Confira quantidade de registros, valores e ocorrências. Se ajustar o mapeamento ou a referência, clique em **Validar estrutura e calcular totais** para gerar uma nova prévia.
6. Marque a confirmação da conferência na prévia e clique em **Atualizar Dashboard**, nos três controles principais. O botão permanece desabilitado sem uma base validada e confirmada. Erros de valores ou de datas essenciais de recebimento bloqueiam a aplicação. Advertências não excluem registros nem bloqueiam o dashboard.
7. Use Visão geral, Clientes, Representantes e Auditoria. Clique no nome de um grupo para abrir os títulos e consultar todas as células originais de um registro.

A base anterior permanece ativa enquanto um novo arquivo é processado, se houver erros ou enquanto não houver confirmação explícita da substituição. Abas desconhecidas exigem categoria definida; não são ignoradas automaticamente. Cabeçalhos repetidos continuam distinguíveis pelo número da coluna. Linhas vazias e conteúdo anterior ao cabeçalho ficam preservados na origem, com suas contagens na conferência, sem entrar como títulos financeiros.

O sistema aceita `.xlsx` sem senha, até 20 MB, até 100.000 linhas de dados e 256 colunas por aba, 2 milhões de células no total e 150 MB descompactados. Arquivos ilegíveis, sem registros ou acima dos limites são rejeitados; não há truncamento silencioso. Não há execução nem recálculo de fórmulas: utiliza-se o resultado salvo no Excel. Resultados zero de fórmulas compartilhadas são recuperados do OOXML original para contornar uma omissão do ExcelJS.

## Interface e modelo Excel

O layout segue as imagens fornecidas: fundo cinza muito claro, cards brancos com borda lateral vermelha ou cinza-azulada, títulos em azul-marinho, destaque vermelho e três controles horizontais alinhados em Gerenciar Base (empilhados no celular). As cinco seções de navegação são preservadas no topo; o menu lateral foi removido. Os filtros ocupam um bloco em grade, os quatro KPIs usam a largura do painel, e a distribuição da inadimplência fica em uma faixa própria de cards. O gráfico mensal ocupa a área principal, com as faixas de atraso ao lado em telas largas.

O rótulo **Vencidos (inadimplência)** é compartilhado entre cards, filtros, rankings, detalhamento, prévia da importação e legendas. Os nomes originais das abas, colunas e arquivos Excel são preservados para rastreabilidade e compatibilidade com a planilha oficial. As faixas de inadimplência usam a mesma regra já existente: 1–30, 31–60, 61–90, 91–180 e acima de 180 dias; valores em faixas de diagnóstico também são preservados.

O cabeçalho exibe o exercício selecionado (**FY**), a data e o horário da última aplicação da base (fuso America/Sao_Paulo), a quantidade total de registros e o status. Essa atualização só é registrada quando **Atualizar Dashboard** termina com sucesso; gerar uma prévia ou registrar uma justificativa não altera a data de atualização da base.

**Baixar Modelo da Base** gera um download real no navegador de `Modelo_Base_Limite_Global_Biosaude.xlsx`, sem dados e sem chamadas externas. São as três abas oficiais, com todos os cabeçalhos e as colunas financeiras distintas, inclusive os cabeçalhos `Descricao` repetidos da origem. Preencha registros reais antes de importar; o modelo vazio não constitui uma base financeira válida. Não há indicadores de demonstração no produto.

As capturas abaixo usam exclusivamente **ARQUIVO_DE_TESTE_VISUAL.xlsx**, gerado pelas fixtures de testes. Os valores e nomes exibidos nelas são sintéticos e **não são resultados oficiais**. As imagens permitem inspeção visual no GitHub antes de atualizar a Vercel; não representam uma aplicação já implantada.

- [Dashboard — arquivo de teste](docs/preview-dashboard-teste.png)
- [Gerenciar Base — três controles](docs/preview-gerenciar-base.png)
- [Dashboard mobile — arquivo de teste](docs/preview-mobile-teste.png)

## Regras financeiras

- **A Vencer:** soma de `Vr.aberto` na categoria A Vencer.
- **Vencidos (inadimplência):** soma de `Vr.aberto` na categoria de inadimplência, preservando a classificação original do Excel.
- **Recebido YTD:** soma de `Vr.recebido` com `Dt.recebimento` entre 1º de janeiro do ano escolhido e o menor valor entre o fim do mês selecionado e a data de referência.
- **Limite Global:** soma dos três componentes acima. Não é um crédito contratual concedido.

Valores são convertidos com Decimal.js para centavos inteiros, somados dentro da faixa segura de inteiros e formatados em reais somente na interface. Valores inválidos, com precisão superior a centavos ou com overflow são bloqueantes. Valores negativos são preservados e advertidos. Datas civis e diferenças de dias usam UTC para evitar variações de fuso horário.

**Saldos de posição não são séries históricas.** Os filtros de ano e mês alteram o período dos recebimentos; os saldos A Vencer e Vencidos (inadimplência) continuam sendo os da extração importada. A interface informa explicitamente a data da posição e o intervalo YTD. Não se reclassificam títulos automaticamente com a data de hoje.

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
