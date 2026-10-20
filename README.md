# BIOSAÚDE — Limite Global por Cliente

Projeto novo em React, TypeScript e Vite. Esta entrega contém a estrutura visual para avaliação, sem dados financeiros e sem conexão ao Neon.

## Estado da entrega

- Navegação entre visão geral, clientes, representantes, auditoria e Gerenciar Base.
- Quatro cards e seis áreas de visualização em estado vazio, sem indicadores simulados.
- Tabelas de ranking, filtros desabilitados até a importação e painel de auditoria.
- Importação Excel, cálculos, gráficos reais, detalhamento e persistência **ainda não implementados**. Dependem da aprovação visual e do recebimento da planilha oficial.
- Nenhum arquivo financeiro, credencial ou serviço de backend é incluído.

## Executar no próprio computador

Requisito: Node.js 22.12 ou superior, necessário para executar Vite e compilar TypeScript.

```sh
git clone https://github.com/Biosaude/novo_limite_global_por_cliente.git
cd novo_limite_global_por_cliente
npm ci
npm run dev
```

Abra no mesmo computador o endereço informado pelo Vite. Um endereço local de uma máquina remota não constitui acesso público.

```sh
npm run build
npm run preview
```

O build gera `dist/`. A integração GitHub–Vercel poderá publicar a interface vazia, conforme autorização do usuário. O endereço e o sucesso do deploy devem ser verificados no projeto Vercel; esta documentação não presume um domínio.

## Testes de interface

```sh
npm ci
npx playwright install chromium
npm test
```

Em máquinas com Chromium instalado, informe o executável:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

Os testes verificam a interface sem dados. Não constituem conciliação financeira nem validação com a planilha real.

## Próximas etapas e limites

1. Avaliação visual pelo usuário em navegador.
2. Após aprovação, inspecionar a planilha oficial e implementar importação, normalização, regras monetárias, auditoria, filtros e visualizações reais em camadas separadas.
3. Validar com dados reais e obter aprovação da primeira etapa.
4. Somente depois, avaliar integração ao Neon e controle de acesso.

Não importar arquivos financeiros para o repositório. A autorização atual de publicação abrange somente a interface vazia. Não usar os totais históricos como dados do dashboard. A data 19/10/2026 apresentada em Gerenciar Base é uma referência histórica inicial, não uma posição carregada.
