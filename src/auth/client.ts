import { createAuthClient, type VanillaBetterAuthClient } from "@neondatabase/auth";
import { decodeJwt } from "jose";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla";
import { installEphemeralAuthChannel } from "./broadcast";
let instance: VanillaBetterAuthClient | undefined;
export function authClient() {
  installEphemeralAuthChannel();
  return instance ??= createAuthClient(`${window.location.origin}/api/neon-auth`, {
    adapter: BetterAuthVanillaAdapter({ fetchOptions: { credentials: "same-origin", headers: { "X-Force-Fetch": "true" } } }),
  });
}
export async function currentUser() {
  const result = await authClient().getSession({ query: { disableCookieCache: true } });
  if (result.error) throw new Error("Não foi possível verificar a sessão.");
  return result.data?.session && result.data?.user ? result.data.user : null;
}
export async function financialToken(expectedSubject: string) {
  const user = await currentUser();
  if (!user || user.id !== expectedSubject) throw new Error("Sessão alterada. Entre novamente.");
  const result = await authClient().token();
  if (result.error || !result.data?.token) throw new Error("Não foi possível obter a autorização.");
  // Somente uma barreira contra troca de sessão entre as duas chamadas.
  // A autenticação e a assinatura continuam sendo verificadas exclusivamente pela API.
  if (decodeJwt(result.data.token).sub !== expectedSubject) throw new Error("Sessão alterada. Entre novamente.");
  return result.data.token;
}
