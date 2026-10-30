import type { ServerEnvironment } from "../config";
import type { FinancialRequest, FinancialResponse } from "../financial/handler";
const methods: Record<string,string> = { "sign-in/email": "POST", "sign-out": "POST", "get-session": "GET", token: "GET" };
const cookieName = /^(?:__Secure-|__Host-)?(?:neon-auth|neonauth|better-auth)\.[A-Za-z0-9_.-]+$/;
/** Proxy restrito de sessão na mesma origem. Nunca recebe destino ou SQL do cliente. */
export function createAuthProxy(env?: ServerEnvironment, send: typeof fetch = fetch) {
  return async (req: FinancialRequest, res: FinancialResponse) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    let logoutCookies: string[] = [];
    const reply = (status:number, value:unknown) => {
      if (logoutCookies.length) (res.setHeader as (name:string,value:unknown)=>unknown)("Set-Cookie",logoutCookies);
      res.statusCode=status; res.end(JSON.stringify(value)); };
    const config = env ?? process.env;
    if (!["preview","development"].includes(config.VERCEL_ENV ?? "") || !config.NEON_AUTH_BASE_URL)
      return reply(404,{ code:"AUTH_DISABLED", message:"Autenticação indisponível neste ambiente." });
    try {
      const base = new URL(config.NEON_AUTH_BASE_URL);
      if (base.protocol!=="https:" || base.username || base.password || base.search || base.hash
        || !/\.neon\.(?:tech|build)$/.test(base.hostname)) throw Error();
      const origins = [config.AUTH_APP_ORIGIN, config.VERCEL_URL && `https://${config.VERCEL_URL}`,
        config.VERCEL_BRANCH_URL && `https://${config.VERCEL_BRANCH_URL}`].filter((x): x is string => !!x);
      if (!origins.length) throw Error();
      for (const origin of origins) {
        const u = new URL(origin);
        if (u.origin!==origin || (u.protocol!=="https:" && !(config.VERCEL_ENV==="development" && ["localhost","127.0.0.1","[::1]"].includes(u.hostname)))) throw Error();
      }
      const url = new URL(req.url ?? "", "https://request.invalid");
      const path = url.pathname.startsWith("/api/neon-auth/") ? url.pathname.slice("/api/neon-auth/".length) : url.searchParams.get("path") ?? "";
      if (!Object.hasOwn(methods,path) || methods[path]!==req.method) return reply(404,{code:"NOT_FOUND"});
      const origin = req.headers.origin;
      if (req.headers["sec-fetch-site"]==="cross-site" || (origin!==undefined && (typeof origin!=="string" || !origins.includes(origin)))
        || (req.method==="POST" && typeof origin!=="string")) return reply(403,{code:"FORBIDDEN",message:"Origem não autorizada."});
      for (const [key,value] of url.searchParams) {
        if (key==="path") continue;
        if (!["disableCookieCache","disableRefresh"].includes(key) || !["true","false"].includes(value)) return reply(400,{code:"INVALID_INPUT"});
      }
      const upstream = new URL(`${base.href.replace(/\/$/,"")}/${path}`);
      for (const key of ["disableCookieCache","disableRefresh"]) if (url.searchParams.has(key)) upstream.searchParams.set(key,url.searchParams.get(key)!);
      let body: string | undefined;
      if (req.method==="POST") {
        if (typeof req.headers["content-type"]!=="string" || !/^application\/json(?:;.*)?$/i.test(req.headers["content-type"])) return reply(400,{code:"INVALID_INPUT"});
        body = typeof req.body==="string" ? req.body : JSON.stringify(req.body ?? {});
        if (!body || Buffer.byteLength(body)>16384) return reply(413,{code:"PAYLOAD_TOO_LARGE"});
        const value=JSON.parse(body);
        if (!value || typeof value!=="object" || Array.isArray(value)) return reply(400,{code:"INVALID_INPUT"});
        const allowed=path==="sign-in/email" ? ["email","password","rememberMe"] : [];
        if (Object.keys(value).some(key=>!allowed.includes(key))) return reply(400,{code:"INVALID_INPUT"});
      }
      const cookies=typeof req.headers.cookie==="string" ? req.headers.cookie.split(";").map(s=>s.trim()).filter(s=>cookieName.test(s.split("=")[0])).join("; ") : "";
      if (path==="sign-out") {
        const names=new Set(["__Secure-neon-auth.session_token","__Secure-neonauth.session_token",...cookies.split("; ").map(c=>c.split("=")[0]).filter(c=>cookieName.test(c))]);
        logoutCookies=Array.from(names,name=>`${name}=; Max-Age=0; Secure; HttpOnly; SameSite=Lax; Path=${name.startsWith("__Host-") ? "/" : "/api/neon-auth"}`);
      }
      const response = await send(upstream, {
        method:req.method, redirect:"error", signal:AbortSignal.timeout(10000),
        headers:{ accept:"application/json", "x-neon-auth-middleware":"true", origin:typeof origin==="string" ? origin : origins[0],
          ...(body ? {"content-type":"application/json"} : {}), ...(cookies ? {cookie:cookies} : {}) }, body,
      });
      // Cookies são limitados à origem atual e à rota Auth; JWTs nunca são registrados.
      const setCookies = response.headers.getSetCookie().filter(s=>cookieName.test(s.split("=")[0])).map(s=>
        s.replace(/;\s*(?:Domain|Path|SameSite)=[^;]*/gi,"").replace(/;\s*(?:Partitioned|Secure|HttpOnly)(?=;|$)/gi,"")+`; Secure; HttpOnly; SameSite=Lax; Path=${s.startsWith("__Host-") ? "/" : "/api/neon-auth"}`);
      if (setCookies.length) (res.setHeader as (name:string,value:unknown)=>unknown)("Set-Cookie",setCookies);
      for (const name of ["set-auth-jwt","set-auth-token"]) { const value=response.headers.get(name); if (value) res.setHeader(name,value); }
      if (!response.ok) return reply(response.status===401 || response.status===403 ? response.status : 502,
        {code:"AUTH_REJECTED",message:"Não foi possível autenticar. Confira os dados e a verificação de e-mail."});
      if (!response.headers.get("content-type")?.includes("application/json")) throw Error();
      return reply(200,await response.json());
    } catch {
      return reply(503,{code:"AUTH_UNAVAILABLE",message:"Serviço de autenticação indisponível."});
    }
  };
}
