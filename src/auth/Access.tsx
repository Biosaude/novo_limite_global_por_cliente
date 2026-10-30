import { useEffect, useMemo, useRef, useState } from "react";
import App from "../App";
import { authClient, currentUser, financialToken } from "./client";
import { FinancialHttpClient, HttpDatasetRepository, HttpProposalRepository, RemoteError } from "../persistencia/http";
import { PersistenceContext, type Persistence } from "../persistencia/context";
import { createLocalRepositories } from "../persistencia/repository";

type User = { id: string; email: string };
const workspacePattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function Access() {
  const [user,setUser] = useState<User | null>(null), [loading,setLoading] = useState(true);
  const [email,setEmail] = useState(""), [password,setPassword] = useState("");
  const [workspace,setWorkspace] = useState(import.meta.env.VITE_FINANCIAL_WORKSPACE_ID ?? "");
  const [selected,setSelected] = useState(""), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const [generation,setGeneration] = useState(0), [local,setLocal] = useState(false);
  const version = useRef(0);
  const userRef = useRef<User | null>(null);
  const invalidate = () => { version.current++; userRef.current=null; setUser(null); setSelected(""); setLocal(false); setGeneration(x=>x+1); };
  useEffect(() => {
    let mounted = true;
    const inspect = async () => {
      const epoch=version.current;
      try {
        const next=await currentUser();
        if (!mounted || version.current!==epoch) return;
        if (userRef.current && userRef.current.id!==next?.id) { version.current++; setSelected(""); setLocal(false); }
        userRef.current=next; setUser(next);
      } catch { if (mounted && version.current===epoch) invalidate(); }
      finally { if (mounted) setLoading(false); }
    };
    void inspect();
    const channel = new BroadcastChannel("biosaude-auth");
    channel.onmessage=()=>{ invalidate(); };
    window.addEventListener("focus",inspect);
    const timer=window.setInterval(inspect,30000);
    return () => { mounted=false; version.current++; channel.close(); window.removeEventListener("focus",inspect); clearInterval(timer); };
  },[]);
  const persistence=useMemo<Persistence | null>(()=> {
    if (!user || !selected) return null;
    const epoch=version.current;
    const client=new FinancialHttpClient({workspace:selected,
      active:()=>version.current===epoch,
      token:async()=>{try {return await financialToken(user.id);} catch {invalidate();throw new RemoteError("UNAUTHENTICATED");}}, onUnauthorized:invalidate});
    const datasets=new HttpDatasetRepository(client);
    return {datasets,proposals:new HttpProposalRepository(client),remote:datasets,mode:"remote"};
  },[user?.id,selected,generation]);
  const [fallback,setFallback] = useState<{scope:string;value:Persistence} | null>(null);
  useEffect(()=> {
    let alive=true; setFallback(null);
    if (user && selected && local) {
      // Nome opaco separado por serviço, usuário e organização; nunca reutiliza a base local legada.
      void crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([location.origin,user.id,selected])))
        .then(hash=> {
          if (!alive) return;
          const name="biosaude-isolado-"+Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
          setFallback({scope:JSON.stringify([user.id,selected]),value:{...createLocalRepositories(name),mode:"local"}});
        });
    }
    return ()=>{alive=false;};
  },[user?.id,selected,local]);
  async function logout() {
    invalidate(); setPassword(""); setBusy(true);
    const channel=new BroadcastChannel("biosaude-auth"); channel.postMessage("logout"); channel.close();
    try {
      const result=await authClient().signOut();
      if (result.error) setError("Sessão local encerrada. Não foi possível confirmar o encerramento no serviço de autenticação.");
    } catch { setError("Sessão local encerrada. Serviço de autenticação indisponível."); }
    finally {setBusy(false);}
  }
  if (loading) return <main className="panel" role="status">Verificando sessão…</main>;
  if (!user) return <main className="panel" style={{maxWidth:440,margin:"64px auto",padding:24}}>
    <h1>Biosaúde · Acesso ao dashboard</h1>
    <p>Entre com sua conta verificada. O acesso financeiro depende de autorização administrativa.</p>
    <form onSubmit={async event=> {
      event.preventDefault();if(busy)return;version.current++;setBusy(true);setError("");const epoch=version.current;
      try {
        const result=await authClient().signIn.email({email,password});
        if (result.error) throw Error();
        const next=await currentUser(); if (!next) throw Error();
        if (version.current===epoch) {userRef.current=next;setUser(next);}
      } catch {setError("Não foi possível entrar. Confira os dados, a verificação de e-mail e a disponibilidade do serviço.");}
      finally {setPassword("");setBusy(false);}
    }}>
      <label>E-mail<input type="email" disabled={busy} autoComplete="username" value={email} required onChange={e=>setEmail(e.target.value)} /></label>
      <label>Senha<input type="password" disabled={busy} autoComplete="current-password" value={password} required onChange={e=>setPassword(e.target.value)} /></label>
      <button className="primary" disabled={busy}>Entrar</button>
    </form>
    {error && <p role="alert" className="error-text">{error}</p>}
  </main>;
  const current=local ? fallback?.scope===JSON.stringify([user.id,selected]) ? fallback.value : null : persistence;
  return <>
    <div className="panel table-controls" aria-label="Sessão e organização" style={{margin:16,padding:12}}>
      <span>{user.email} · {selected ? local ? "Modo local isolado — sem sincronização" : "Neon — organização selecionada" : "Selecione a organização autorizada"}</span>
      <form onSubmit={e=>{e.preventDefault(); if (!workspacePattern.test(workspace)) {setError("Informe um identificador de organização válido.");return;}
        version.current++;setLocal(false);setSelected(workspace.toLowerCase());setGeneration(x=>x+1);setError("");}}>
        <label>Organização<input aria-label="Identificador da organização" value={workspace} required onChange={e=>setWorkspace(e.target.value)} /></label>
        <button className="secondary" disabled={busy}>Abrir organização</button>
      </form>
      {selected && <button className="secondary" onClick={()=>{version.current++;setGeneration(x=>x+1);setError("");}}>Recarregar base</button>}
      {selected && import.meta.env.VITE_ALLOW_LOCAL_FALLBACK==="true" && <button className="secondary" onClick={()=>{version.current++;setLocal(x=>!x);setGeneration(x=>x+1);}}>{local ? "Voltar ao Neon" : "Usar modo local isolado"}</button>}
      <button className="secondary" disabled={busy} onClick={()=>void logout()}>Sair</button>
    </div>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {current && <PersistenceContext.Provider value={current}><App key={`${user.id}:${selected}:${local}:${generation}`} /></PersistenceContext.Provider>}
  </>;
}
