# Migrações preparadas — não aplicadas

`0001_financial_foundation.sql` cria o esquema relacional. `0002_security_and_immutability.sql` adiciona RLS, histórico imutável e validação documental de vínculos.

`npm run db:plan` calcula versões e SHA-256 **offline**. Nenhum comando do projeto aplica migrações no Neon. Não execute estes arquivos em produção nesta etapa.

O fluxo futuro precisa de revisão do banco existente, autorização de aplicação, papel de migração separado, backup, lock e gravação dos hashes em `biosaude.schema_migrations`. Não há seed de clientes, valores, contas, papéis ou processos.

Os testes executam esses mesmos arquivos somente em PostgreSQL descartável em memória (PGlite). Consulte [a documentação da etapa](../docs/NEON_ETAPA_1.md).
