# Análise de Crédito por Cliente — metodologia e proposta para revisão

## Natureza da análise

Todos os valores de limite são **estimativas gerenciais**, não autorizações de venda ou crédito aprovado. A classificação apresentada é **risco observado — prévia da proposta**, calculada somente com a extração financeira. Não há consulta de CNPJ, bureau de crédito, garantias, contratos completos, faturamento integral ou capacidade financeira externa.

Nesta entrega não há política oficial aprovada, autenticação administrativa ou aprovação de limite no frontend. A interface **Salvar proposta para revisão** registra parâmetros locais auditáveis, mas não ativa recomendação numérica. A recomendação permanece **Pendente de política de crédito**. Os fatores abaixo são proposta de trabalho para avaliação administrativa; não são percentuais oficiais da Biosaúde.

## Clientes e rastreabilidade

A chave de correspondência é o nome em Unicode NFC, com espaços consecutivos reduzidos e capitalização uniformizada. Acentos, pontuação e palavras não são removidos. Não há união por similaridade. Grafias originais, duplicata, parcela, título completo, aba e linha são preservados. Sem nome, o registro mantém identificação isolada e não recebe uma classificação artificial.

Como não há CNPJ ou código único, toda identificação permanece sujeita a homônimos. Mais de uma grafia consolidada gera aviso. Ocorrências da auditoria financeira do cliente são indicadas, sem exclusão de linhas. Uma presença em A Vencer e Recebido pode refletir pagamento parcial.

Bases antigas salvas no navegador são enriquecidas pelos cabeçalhos e pelas células originais para recuperar emissão, duplicata e parcela. Não é necessário inferir posições de colunas nem reimportar obrigatoriamente para usar o módulo.

## Escopo temporal e filtros

Cada análise utiliza **uma única posição financeira ativa**. A referência da posição determina os saldos e os dias de atraso atuais. Ano e mês selecionam o histórico recebido entre 1º de janeiro do ano e o menor valor entre fim do mês e referência da posição.

Os filtros globais de cliente, representante e categoria selecionam o universo de clientes. A exposição de cada cliente usa sempre sua posição integral, incluindo seus representantes e categorias. Isso evita mostrar dívida subestimada ao filtrar apenas recebimentos ou um representante. Essa diferença de escopo é informada na seção. Pesquisa e filtro de risco dentro do módulo atuam na tabela e no universo local, respectivamente.

## Exposição e inadimplência

- A Vencer = soma de `Vr.aberto` da categoria A Vencer.
- Vencidos (inadimplência) = soma de `Vr.aberto` da categoria Vencido na origem.
- Exposição atual = A Vencer + Vencidos (inadimplência).
- Índice de inadimplência = saldo vencido ÷ exposição; exposição zero resulta em **Não aplicável**.

Recebimentos **não são dívida atual**. As faixas são 1–30, 31–60, 61–90 e acima de 90 dias, calculadas por referência menos vencimento. Valores sem vencimento ou com categoria divergente permanecem em faixas de diagnóstico e não desaparecem da conciliação.

## Histórico de recebimentos

Total recebido YTD soma os valores efetivamente recebidos, não o nominal. Quantidade de recebimentos é quantidade de lançamentos. Pontualidade usa lançamentos positivos com recebimento e vencimento válidos:

- recebimento − vencimento < 0: antecipado;
- igual a zero: no vencimento;
- maior que zero: tardio;
- percentual até o vencimento = lançamentos antecipados ou pontuais ÷ lançamentos elegíveis;
- atraso médio tardio simples = média dos dias positivos;
- atraso médio tardio ponderado = soma(valor recebido × dias positivos) ÷ soma dos recebimentos tardios positivos;
- prazo médio de pagamento ponderado = soma(valor recebido × dias entre emissão e recebimento) ÷ valores positivos com emissão e recebimento válidos e em ordem cronológica.

Datas ausentes, inversas, valores negativos e cobertura parcial são informados. Ajustes negativos continuam no fluxo financeiro líquido, mas suspendem risco e estimativas de limite até revisão. Zero ou ausência de amostra não vira uma média inventada.

A chave do título prioriza duplicata e parcela; se indisponíveis, usa o título completo. São mostrados quantidade de títulos observados, quantidade com múltiplos lançamentos, títulos com algum recebimento tardio observado, média por lançamento e média recebida por título. Esses dados **não comprovam quitação integral**. Média por título não é valor nominal nem ticket completo de compra; quando faltam identificadores, a média por título não é apresentada como completa.

## Janela observada e limite-base

A janela comum começa na primeira data de recebimento encontrada no período da extração e termina no corte selecionado. Um mês parcial corresponde a dias observados divididos pelos dias reais desse mês; os meses sem atividade entre início e fim continuam no denominador. Não se comprime a janela ao último pagamento de cada cliente nem se convertem somente os meses com vendas em média mensal. A janela não comprova cobertura contínua ou integral do ERP.

São apresentados separadamente:

1. média mensal recebida = fluxo líquido recebido ÷ meses equivalentes da janela;
2. proxy de operações a prazo = recebimentos positivos identificáveis de títulos com emissão/vencimento consistentes e prazo contratual positivo;
3. prazo de crédito estimado = **mediana dos prazos emissão → vencimento por título distinto**, sem duplicar o prazo pelos pagamentos parciais;
4. limite-base provisório = proxy de recebimentos a prazo ÷ meses equivalentes × prazo de crédito estimado ÷ 30.

Prazo zero é operação à vista e não entra no prazo de crédito. Prazos conflitantes de um mesmo título e prazos negativos não entram na estimativa de prazo. Para formar o proxy, o recebimento deve ter emissão conhecida anterior ou igual ao pagamento. Não se usa o prazo efetivo de recebimento como se fosse prazo concedido. O nominal da duplicata nunca é substituto de `Vr.aberto` ou `Vr.recebido`.

A estimativa de base exige amostra suficiente também nos recebimentos a prazo: quantidades de lançamentos, títulos e meses ativos. Um cliente pode ter dados suficientes para observar risco e ainda não ter base de operações a prazo suficiente para o limite-base. Nesse caso o módulo mostra a limitação.

## Proposta inicial de suficiência e risco

Mínimos propostos, editáveis e sujeitos a revisão: 3 recebimentos positivos, 2 títulos distintos, 2 meses com recebimento, janela de pelo menos 2 meses e 80% de cobertura de datas válidas tanto no histórico positivo quanto nos títulos positivos em aberto. Valores negativos ou identificação ausente suspendem a classificação. Sem suficiência: **Dados insuficientes**.

Com amostra suficiente, começa-se em Baixo e prevalece o nível mais severo cujo **qualquer** critério abaixo seja atingido:

| Critério proposto | Moderado | Alto | Crítico |
|---|---:|---:|---:|
| Vencido / exposição | ≥ 1% | ≥ 20% | ≥ 50% |
| Maior atraso atual | ≥ 1 dia | ≥ 61 dias | ≥ 91 dias |
| Frequência de lançamentos tardios | ≥ 20% | ≥ 50% | ≥ 75% |
| Vencidos >90 dias / total vencido | ≥ 10% | ≥ 30% | ≥ 50% |
| Exposição / recebimento médio mensal | ≥ 2 meses | ≥ 4 meses | ≥ 6 meses |

Critérios de inadimplência e concentração só disparam com saldo vencido positivo; índice sem exposição é não aplicável. A relação exposição/recebimento médio só é usada com média positiva. Os parâmetros devem crescer de Moderado para Alto e Crítico. Não atingir limiar não equivale a aprovação de crédito.

## Proposta de fatores e governança

| Risco observado | Fator proposto (inativo) |
|---|---:|
| Baixo | 100% |
| Moderado | 75% |
| Alto | 50% |
| Crítico | 0% |

Propõe-se ainda revisão manual sempre que houver saldo vencido e teto monetário **não definido** até deliberação. Fatores são de 0 a 100%, não crescentes conforme aumenta o risco. Cada salvamento cria revisão local com identificador, número, data/hora, justificativa e cópia integral dos parâmetros; não substitui ou apaga as revisões anteriores. Isso é histórico de propostas, não assinatura autenticada.

Antes de ativar uma política, a administração deverá revisar amostras, ajustar os critérios, definir teto, regra de revisão manual e responsabilidades, aprovar a versão e registrar a decisão em um mecanismo autenticado. O frontend atual **não possui botão para aprovar** políticas ou limites. Campos de aprovação não são lidos das propostas locais ou do IndexedDB.

O contrato futuro `CreditGovernance` separa política aprovada de limite contratual aprovado por cliente. Deve ser fornecido apenas por backend com autenticação/autorização verificadas; o tipo TypeScript não constitui controle de acesso. O serviço de cálculo tem testes desse contrato, mas a aplicação atual não fornece esse contexto nem concede crédito.

Com política aprovada e dados suficientes: recomendação = limite-base × fator aprovado, sujeita a teto e revisão manual. Isso continua sendo estimativa gerencial. Limite aprovado, responsável, data, justificativa e vínculo com a aprovação anterior têm contrato próprio para futura integração.

Com limite contratual aprovado: disponibilidade bruta = limite aprovado − exposição; disponibilidade operacional = máximo(0, bruta); excedido = máximo(0, −bruta). Sem limite aprovado, não se apresenta disponibilidade autorizada. Uma eventual recomendação gera apenas diferença estimada entre recomendação e exposição.

## Precisão e versões financeiras

Valores financeiros são somados em centavos inteiros; produtos, quocientes, médias monetárias e ponderações usam Decimal.js. Derivações monetárias arredondam uma única vez ao centavo, por metade para cima. Estimativas acima da faixa segura não viram valores numéricos fictícios.

A substituição da base mantém a posição anterior no histórico da sessão. Se a versão estava salva, continua no IndexedDB. Novas versões só são persistidas quando o usuário opta por lembrar a base. Reativar uma versão troca a posição completa; não combina referências. **Desativar base atual (preservar histórico)** remove somente sua utilização; versões persistidas continuam locais. Limpar os dados do site no navegador remove esse armazenamento; não há sincronização ou backup.
