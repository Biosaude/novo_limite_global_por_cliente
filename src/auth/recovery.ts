export type AccessStep = "request" | "reset" | "verify";
export interface AccessReturn { step: AccessStep | null; token: string; message: string; clean: string; }
/** O token do link é opaco: apenas o Neon Auth pode validar sua posse, validade e uso único. */
export function accessReturn(input: string): AccessReturn {
  const url=new URL(input);
  const kind=url.searchParams.get("access");
  const values=url.searchParams.getAll("token");
  const token=kind==="reset" && values.length===1 && /^[A-Za-z0-9._~-]{1,2048}$/.test(values[0]) ? values[0] : "";
  const failed=url.searchParams.has("error");
  let step: AccessStep | null=null, message="";
  if (kind==="reset") {
    step=token && !failed ? "reset" : "request";
    if (step==="request") message="Link inválido ou expirado. Solicite um novo link para definir sua senha.";
  }
  if (kind==="verified") {
    step=failed ? "verify" : null;
    message=failed ? "Link de verificação inválido ou expirado. Solicite novo envio." : "Você retornou da verificação de e-mail. Entre com sua senha; o serviço confirmará a verificação.";
  }
  for (const key of ["access","token","error"]) url.searchParams.delete(key);
  return {step,token:failed ? "" : token,message,clean:url.pathname+url.search+url.hash};
}
export function consumeAccessReturn(): AccessReturn {
  const result=accessReturn(window.location.href);
  // Antes de qualquer chamada do SDK ou renderização de campos, retirar o segredo da URL.
  window.history.replaceState(window.history.state,"",result.clean);
  return result;
}

export function needsEmailVerification(error: unknown): boolean {
  const code=error && typeof error==="object" && "code" in error ? error.code : null;
  return code==="EMAIL_NOT_VERIFIED" || code==="email_not_confirmed";
}
export function recoveryFailure(error: unknown, action: "request"|"verify-send"|"verify"|"reset"): string {
  const code=error && typeof error==="object" && "code" in error ? error.code : null;
  if (action==="reset" && ["INVALID_TOKEN","TOKEN_EXPIRED","TOKEN_NOT_FOUND","bad_jwt"].includes(String(code)))
    return "Link inválido, expirado ou já utilizado. Solicite outro.";
  if(action==="verify")return "Não foi possível confirmar o código. Ele pode estar inválido ou expirado; solicite outro se necessário.";
  if(action==="reset")return "Não foi possível definir a senha. Solicite outro link se ele tiver expirado.";
  return "Envio indisponível. Aguarde e solicite ao administrador a conferência da autenticação por e-mail e do provedor no Neon Auth.";
}
