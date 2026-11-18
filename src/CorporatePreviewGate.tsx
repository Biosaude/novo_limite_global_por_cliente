import { useEffect, useState, type ReactNode } from "react";

export function CorporatePreviewGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<number>();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/corporate-auth/status", { cache: "no-store", signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setStatus(response.status); })
      .catch(() => { if (!controller.signal.aborted) setStatus(503); });
    return () => controller.abort();
  }, []);
  if (status === undefined) return <p role="status">Verificando o acesso corporativo…</p>;
  if (status === 401) return <p><a href="/api/corporate-auth/login">Entrar com Microsoft Entra ID</a></p>;
  if (status === 403) return <p role="alert">Sua conta não possui concessão individual para este dashboard.</p>;
  if (status !== 204) return <p role="alert">A verificação corporativa está indisponível.</p>;
  return <><form action="/api/corporate-auth/logout" method="post"><button type="submit">Sair da sessão corporativa</button></form>{children}</>;
}
