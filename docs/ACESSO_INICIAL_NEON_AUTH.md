# Primeiro acesso: usuário do Console sem senha e e-mail pendente

## Verificação prévia e bloqueio externo

A verificação disponível neste ambiente encontrou o SDK oficial @neondatabase/auth 0.7.0-beta, baseado no Better Auth 1.7.6. Não há conector administrativo Neon/Vercel, credencial vinculada ou configuração autenticada acessível do projeto. Portanto **não foi possível confirmar se Sign-up with Email está habilitado, qual provedor de e-mail está selecionado ou se o envio entrega mensagens neste projeto**. Nenhum e-mail real foi enviado e nenhuma opção do Console foi modificada.

A documentação oficial atual confirma suporte gerenciado:

- [Password reset](https://neon.com/docs/auth/guides/password-reset): recuperação disponível ao habilitar autenticação por e-mail em Settings → Better Auth → Sign-up with Email; links expiram em 15 minutos.
- [Email provider requirements](https://neon.com/docs/auth/production-checklist#email-provider): recuperação de senha funciona com o provedor compartilhado ou SMTP próprio. SMTP próprio não é obrigatório para recuperação no desenvolvimento.
- [Email verification](https://neon.com/docs/auth/guides/email-verification): verificação por código funciona com ambos os provedores; verificação por link exige provedor próprio. O administrador escolhe o método e se a verificação é obrigatória.
- [User management](https://neon.com/docs/auth/guides/user-management): os métodos de recuperação são requestPasswordReset/resetPassword. O método Supabase resetPasswordForEmail não é usado, pois o guia o aponta como não suportado plenamente.

O código dos componentes oficiais ForgotPasswordForm/ResetPasswordForm incluídos no SDK instalado confirma o uso de requestPasswordReset({email,redirectTo}) e resetPassword({newPassword,token}). A implementação usa esses mesmos métodos, sem instalar outra biblioteca de UI ou substituir o layout aprovado.

O código da versão Better Auth 1.7.6 usada pelo SDK cria a credencial pelo próprio serviço quando o usuário existente não possui conta credential. Isso fundamenta o uso do fluxo de recuperação para definir a primeira senha, mas **não substitui a homologação contra a instância gerenciada real**. O dashboard não cria credenciais em SQL, não modifica emailVerified diretamente e não recria o usuário.

## Fluxo implementado

1. Na tela de login, escolher **Definir ou recuperar senha** para a conta existente.
2. Informar o e-mail e solicitar o link. A resposta é condicional e genérica: não confirma existência da conta nem entrega de mensagem. Se o envio estiver indisponível, o usuário recebe orientação para pedir a conferência da configuração ao administrador.
3. Abrir o link recebido. O serviço valida o token e retorna à mesma origem do Preview em `/?access=reset`. O token é removido da URL na inicialização da aplicação, antes de carregar o SDK; fica somente em memória para o POST de redefinição. Não é colocado em localStorage, IndexedDB, logs ou mensagens de erro. O link de e-mail e a primeira navegação podem conter o token por exigência do protocolo oficial; tratar esses URLs como secretos nos acessos e logs operacionais do provedor.
4. Informar e confirmar a nova senha (8–128 caracteres; o serviço mantém a validação definitiva). Link inválido, expirado ou utilizado exige nova solicitação. Não há login financeiro automático após definir senha.
5. Se a verificação estiver pendente, escolher **Verificar meu e-mail**. O serviço envia o método configurado: código para preencher na tela ou link para abrir no próprio Neon Auth. A confirmação de código usa emailOtp.verifyEmail. O retorno de link sozinho não marca o e-mail como verificado no frontend.
6. Entrar com a senha. Os códigos de erro originais e os normalizados pelo SDK (`EMAIL_NOT_VERIFIED` / `email_not_confirmed`) levam à tela de verificação. O serviço continua responsável por exigir a verificação conforme a configuração da branch.

Um usuário sem senha pode receber a mesma falha de login de uma senha incorreta. A tela não consulta publicamente o estado da conta nem afirma que determinado endereço não possui senha; apresenta instruções de primeiro acesso e recuperação sem permitir enumeração de usuários.

## APIs e limites de segurança

O proxy anterior mantém destino fixo, origem autorizada, cookies seguros, limitação de corpo e bloqueio de Production. Foram permitidos somente estes POSTs adicionais:

- `/request-password-reset`: email, redirectTo.
- `/reset-password`: newPassword, token.
- `/send-verification-email`: email, callbackURL.
- `/email-otp/verify-email`: email, otp.

Os callbacks são fixados na origem validada do Preview (`/?access=reset` e `/?access=verified`); destinos externos, caminhos arbitrários, tokens em query da API e campos administrativos são recusados. Respostas de erro do serviço são sanitizadas. Pedidos de envio preservam respostas genéricas para conta inexistente ou já verificada. Há intervalo local de um minuto entre solicitações; o rate limit efetivo é do serviço Neon Auth e o frontend não o substitui.

O SDK instalado pode lançar erros normalizados em vez de devolver result.error. A interface trata ambos os casos, incluindo token inválido mapeado para bad_jwt. Nenhum erro bruto é exibido.

Não foram alterados JWT financeiro, RLS, permissões, vínculos de organização, tabelas, fórmulas, IndexedDB, layout do dashboard, dependências ou flags de ambiente. Recuperação/verificação não criam vínculo em identity_memberships nem concedem permissões financeiras. Cadastro público e operações administrativas continuam fora do proxy.

## Ação administrativa mínima se o e-mail não chegar

Exclusivamente na branch desenvolvimento, pelo Console seguro do Neon:

1. Conferir Settings → Better Auth → Sign-up with Email e a disponibilidade de autenticação por e-mail/senha. Isso habilita o método do serviço; não exige liberar cadastro pelo dashboard.
2. Conferir o provedor e a entrega (incluindo spam e limites). Para desenvolvimento, o provedor compartilhado oficialmente suporta recuperação. Se ele não estiver disponível/entregando, configurar SMTP próprio pelos canais seguros do Console, sem colocar senha no chat ou no repositório.
3. Manter verificação exigida e selecionar códigos se estiver usando o provedor compartilhado. Para links de verificação, configurar provedor próprio.
4. Confirmar a origem exata do Preview como domínio confiável e as variáveis Auth já documentadas na integração. Não usar o domínio de Production para o callback de homologação.
5. Solicitar um novo link pela interface para o usuário já existente. Depois confirmar o e-mail pelo método configurado e testar login. Não usar changePassword como atalho: ele exige senha atual; não usar UPDATE nas tabelas Auth nem definir senha em SQL.

Se essas opções estiverem ausentes ou retornarem serviço desabilitado, o desbloqueio depende da configuração/suporte oficial do Neon. Não há fallback que burle a verificação de identidade ou altere o banco diretamente.

## Validação

Testes automatizados usam o SDK oficial instalado e um upstream Auth simulado; não enviam mensagens reais e não acessam o banco Neon. Cobrem senha inicial, confirmação, token expirado/reutilizado, verificação OTP/link, envio indisponível, callbacks maliciosos, ausência de enumeração, erros normalizados e ausência de concessão financeira automática.

A confirmação da configuração e entrega real de e-mail permanece pendente. Testes aprovados não devem ser apresentados como prova de que o SMTP ou o usuário real já foram recuperados.

Resultados executados nesta correção:

- `npm run test:unit`: **138 aprovados, zero falhas, 8 ignorados** por ausência das planilhas oficiais.
- Playwright de recuperação: **8 aprovados, zero falhas**, nos projetos desktop e mobile.
- Playwright da integração financeira existente: **1 aprovado, zero falhas**, com PostgreSQL descartável.
- Typecheck da aplicação/servidor e dos testes alterados, builds normal e remoto e inspeção do bundle: aprovados.
- `git diff --check`: aprovado. Nenhuma dependência foi adicionada ou atualizada.

Para reproduzir os testes de navegador, gerar primeiro o build com `VITE_FINANCIAL_REMOTE_ENABLED=true VITE_ALLOW_LOCAL_FALLBACK=true npm run build`; depois executar `REMOTE_E2E=true npx playwright test tests/access-recovery.spec.ts --project=desktop --project=mobile`. Usar o Chromium já instalado (neste ambiente: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`). Esse teste intercepta o serviço Auth e não envia e-mails reais. A regressão financeira pode ser repetida com `REMOTE_E2E=true npx playwright test tests/remote-integration.spec.ts --project=desktop` no mesmo build remoto.
