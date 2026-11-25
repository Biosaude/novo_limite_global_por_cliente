import { useEffect, useState, type ReactNode } from "react";

export function CorporatePreviewGate({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<{ status: number; canonical?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/corporate-auth/status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        let canonical: string | undefined;
        if (response.status === 403 && response.headers.get("content-type")?.startsWith("application/json")) {
          const body = await response.json().catch(() => null);
          if (body?.code === "corporate_origin_mismatch" && typeof body.canonicalOrigin === "string") {
            try {
              const url = new URL(body.canonicalOrigin);
              if (url.protocol === "https:" && url.origin === body.canonicalOrigin) canonical = url.href;
            } catch { /* An invalid response never supplies a link. */ }
          }
        }
        if (!controller.signal.aborted) setResult({ status: response.status, canonical });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ status: 503 }); });
    return () => controller.abort();
  }, []);
  const status = result?.status;
  if (result?.canonical) return <p><a href={result.canonical}>Abrir o endereço oficial do Preview</a></p>;
  if (status === undefined) return <p role="status">Verificando o acesso corporativo…</p>;
  if (status === 401) return <p><a href="/api/corporate-auth/login">Entrar com Microsoft Entra ID</a></p>;
  if (status === 403) return <p role="alert">Sua conta não possui concessão individual para este dashboard.</p>;
  if (status !== 204) return <p role="alert">A verificação corporativa está indisponível.</p>;
  return <><form action="/api/corporate-auth/logout" method="post"><button type="submit">Sair da sessão corporativa</button></form>{children}</>;
}
