import { useEffect, useRef, useState } from "react";
import { authClient } from "./client";
import { recoveryFailure, type AccessReturn, type AccessStep } from "./recovery";
const requested="Se o endereço estiver cadastrado e habilitado para este fluxo, você receberá um e-mail. Confira também o spam. O recebimento depende da configuração do Neon Auth.";
export function Recovery({step:initial,email,onEmail,returned,onBack}:{step:AccessStep;email:string;onEmail:(value:string)=>void;returned:AccessReturn;onBack:()=>void}) {
  const [step,setStep]=useState(initial), [busy,setBusy]=useState(false), [message,setMessage]=useState(returned.message);
  const [error,setError]=useState(""), [password,setPassword]=useState(""), [confirm,setConfirm]=useState(""), [otp,setOtp]=useState("");
  const token=useRef(returned.token), [done,setDone]=useState(false), [nextSend,setNextSend]=useState(0);
  const [cooldown,setCooldown]=useState(false);
  const timer=useRef<number | undefined>(undefined);
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  async function submit(action:"request"|"verify-send"|"verify"|"reset") {
    if(busy)return;
    if (action!=="reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {setError("Informe um e-mail válido.");return;}
    if ((action==="request"||action==="verify-send") && Date.now()<nextSend) {setError("Aguarde um minuto antes de solicitar novo envio.");return;}
    if(action==="reset" && (password!==confirm || password.length<8 || password.length>128)) {setError("As senhas devem coincidir e ter de 8 a 128 caracteres.");return;}
    setBusy(true);setError("");setMessage("");
    try {
      const auth=authClient();
      const result=action==="request" ? await auth.requestPasswordReset({email,redirectTo:`${location.origin}/?access=reset`})
        : action==="verify-send" ? await auth.sendVerificationEmail({email,callbackURL:`${location.origin}/?access=verified`})
        : action==="verify" ? await auth.emailOtp.verifyEmail({email,otp})
        : await auth.resetPassword({newPassword:password,token:token.current});
      if(result.error) {
        setError(recoveryFailure(result.error,action));
        return;
      }
      if(action==="request" || action==="verify-send") {
        setMessage(requested);setNextSend(Date.now()+60000);setCooldown(true);
        window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>setCooldown(false),60000);
      } else if(action==="reset") {
        token.current="";setDone(true);setMessage("Senha definida pelo serviço. Se a verificação de e-mail estiver pendente, conclua-a antes de entrar.");
      } else {setDone(true);setOtp("");setMessage("E-mail verificado pelo serviço. Agora entre com sua senha. O acesso financeiro continua dependendo de autorização.");}
    } catch (failure) {setError(recoveryFailure(failure,action));}
    finally{setBusy(false);setPassword("");setConfirm("");}
  }
  return <section aria-label="Recuperação e verificação de acesso">
    <h2>{step==="request"?"Definir ou recuperar senha":step==="reset"?"Definir nova senha":"Verificar meu e-mail"}</h2>
    <p>{step==="request"?"Se sua conta foi criada pelo administrador sem senha, solicite o link para definir a primeira senha. O mesmo fluxo recupera uma senha esquecida.":step==="verify"?"Cadastro pendente de verificação: solicite o e-mail. Se receber um código, informe-o abaixo; se receber um link, abra-o para concluir.":"Use o link recebido por e-mail. Ele é validado pelo Neon Auth e não cria outra conta."}</p>
    {!done && <form onSubmit={event=>{event.preventDefault();void submit(step==="request"?"request":step==="reset"?"reset":"verify");}}>
      {step!=="reset" && <label>E-mail<input type="email" value={email} autoComplete="username" required maxLength={254} disabled={busy} onChange={e=>onEmail(e.target.value)} /></label>}
      {step==="reset" && <>
        <label>Nova senha<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} /></label>
        <label>Confirmar nova senha<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={confirm} onChange={e=>setConfirm(e.target.value)} /></label>
      </>}
      {step==="verify" && <>
        <button type="button" className="secondary" disabled={busy||cooldown||!email} onClick={()=>void submit("verify-send")}>Enviar ou reenviar verificação</button>
        <label>Código de verificação<input type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} required disabled={busy} value={otp} onChange={e=>setOtp(e.target.value)} /></label>
      </>}
      <button className="primary" disabled={busy || (step==="request" && cooldown)}>{step==="request"?"Solicitar link de senha":step==="reset"?"Salvar nova senha":"Confirmar código"}</button>
    </form>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {message && <p role="status">{message}</p>}
    <p className="helper">O envio real precisa estar habilitado no Neon Auth. Se não receber o e-mail, peça ao administrador para conferir as configurações; não crie outra conta para substituir a existente.</p>
    <button type="button" className="secondary" disabled={busy} onClick={onBack}>Voltar ao login</button>
    {step!=="verify" && <button type="button" className="secondary" disabled={busy} onClick={()=>{setStep("verify");setDone(false);setError("");setMessage("");}}>Verificar meu e-mail</button>}
    {step!=="request" && <button type="button" className="secondary" disabled={busy} onClick={()=>{token.current="";setStep("request");setDone(false);setError("");setMessage("");}}>Solicitar novo link de senha</button>}
  </section>;
}
