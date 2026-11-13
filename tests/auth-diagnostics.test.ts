import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthProxy } from "../server/auth/proxy.js";
import { providerErrorCode, type AuthDiagnostic } from "../server/auth/diagnostics.js";

const origin = "https://synthetic.vercel.app";
const env = { VERCEL_ENV: "preview", AUTH_APP_ORIGIN: origin, NEON_AUTH_BASE_URL: "https://synthetic.neon.build/neondb/auth" };
const email = "private-diagnostic@example.invalid";
const secret = "synthetic-password-token-cookie-never-real";
const request = (path = "request-password-reset") => ({
  method: "POST", url: `/api/neon-auth/${path}`,
  headers: { origin, "content-type": "application/json", authorization: `Bearer ${secret}`, cookie: `__Secure-neon-auth.session_token=${secret}` },
  body: { email, ...(path === "email-otp/verify-email" ? { otp: "123456" } : {}) },
});
function response() {
  return { statusCode: 0, body: "", headers: {} as Record<string, unknown>,
    setHeader(k: string, v: unknown) { this.headers[k] = v; }, end(body?: string) { this.body = body ?? ""; } };
}
async function invoke(send: typeof fetch, path?: string, config = env) {
  const logs: AuthDiagnostic[] = [];
  const res = response();
  await createAuthProxy(config, send, entry => { logs.push(entry); })(request(path), res);
  for (const entry of logs) {
    assert.deepEqual(Object.keys(entry).sort(), ["code", "status"]);
    assert.ok(entry.status === null || Number.isInteger(entry.status));
  }
  const output = JSON.stringify(logs) + res.body;
  for (const value of [email, secret, "private-provider-message", "sensitive-host.invalid", "stack-trace"])
    assert.ok(!output.includes(value), `Confidential marker leaked: ${value}`);
  return { logs, res };
}
const failure = (status: number, code: unknown): typeof fetch => async () => Response.json({
  code, message: `private-provider-message ${email} ${secret}`, stack: "stack-trace",
  url: `https://sensitive-host.invalid/?token=${secret}`, headers: { authorization: secret },
}, { status });

test("diagnóstico: configuração de recuperação/verificação preserva status externo somente no log", async () => {
  for (const [path, code] of [["request-password-reset", "RESET_PASSWORD_DISABLED"], ["send-verification-email", "VERIFICATION_EMAIL_NOT_ENABLED"], ["request-password-reset", "INVALID_REDIRECT_URL"]]) {
    const { logs, res } = await invoke(failure(400, code), path);
    assert.deepEqual(logs, [{ status: 400, code }]);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).code, "AUTH_CONFIGURATION_ERROR");
    assert.ok(!res.body.includes(code));
  }
});
test("diagnóstico: limite por HTTP 429 e por código controlado não vira indisponibilidade", async () => {
  for (const [status, code] of [[429, "TOO_MANY_REQUESTS"], [429, "RATE_LIMIT"], [400, "RATE_LIMIT_EXCEEDED"]] as const) {
    const { logs, res } = await invoke(failure(status, code));
    assert.deepEqual(logs, [{ status, code }]); assert.equal(res.statusCode, 429);
    assert.equal(JSON.parse(res.body).code, "TOO_MANY_REQUESTS");
  }
});
test("diagnóstico: falhas HTTP do serviço mantêm o status real e nunca simulam sucesso", async () => {
  for (const status of [400, 401, 403, 404, 500, 502, 503, 504]) {
    const { logs, res } = await invoke(failure(status, "SERVICE_UNAVAILABLE"));
    assert.deepEqual(logs, [{ status, code: "SERVICE_UNAVAILABLE" }]);
    assert.equal(res.statusCode, 503); assert.equal(JSON.parse(res.body).code, "EMAIL_SERVICE_UNAVAILABLE");
  }
  for (const path of ["request-password-reset", "email-otp/verify-email"]) {
    const { logs, res } = await invoke(failure(500, "USER_NOT_FOUND"), path);
    assert.equal(res.statusCode, 503); assert.equal(logs[0].status, 500);
  }
});
test("diagnóstico: strings arbitrárias, mensagens, corpos aninhados e códigos ausentes são descartados", async () => {
  for (const code of [email, secret, "SERVICE_UNAVAILABLE\n" + secret, "UNKNOWN_UPPERCASE_CODE", { code: "RESET_PASSWORD_DISABLED", email }, null]) {
    const { logs, res } = await invoke(failure(500, code));
    assert.deepEqual(logs, [{ status: 500, code: "UNRECOGNIZED_PROVIDER_ERROR" }]); assert.equal(res.statusCode, 503);
  }
  for (const detail of [null, [], {}, { message: "RESET_PASSWORD_DISABLED" }, { error: { message: "RESET_PASSWORD_DISABLED" } }, { code: "toString" }])
    assert.equal(providerErrorCode(detail), "UNRECOGNIZED_PROVIDER_ERROR");
  assert.equal(providerErrorCode({ error: { code: "RESET_PASSWORD_DISABLED", message: secret } }), "RESET_PASSWORD_DISABLED");
});
test("diagnóstico: HTML/JSON inválido de erro não vaza e preserva status HTTP", async () => {
  for (const body of [`<html>${email} ${secret}</html>`, `{"code":"${secret}"`, "null", "[]"]) {
    const { logs, res } = await invoke(async () => new Response(body, { status: 502 }));
    assert.deepEqual(logs, [{ status: 502, code: "UNRECOGNIZED_PROVIDER_ERROR" }]); assert.equal(res.statusCode, 503);
  }
});
test("diagnóstico: rede e timeout não inventam status do Neon ou registram exceções", async () => {
  for (const timeout of [false, true]) {
    const { logs, res } = await invoke(async () => {
      if (timeout) throw new DOMException(`private-provider-message ${secret}`, "TimeoutError");
      throw new TypeError(`private-provider-message https://sensitive-host.invalid/?token=${secret}`, { cause: { stack: "stack-trace", email } });
    });
    assert.deepEqual(logs, [{ status: null, code: timeout ? "AUTH_UPSTREAM_TIMEOUT" : "AUTH_UPSTREAM_NETWORK_ERROR" }]);
    assert.equal(res.statusCode, timeout ? 504 : 503); assert.equal(JSON.parse(res.body).code, "AUTH_COMMUNICATION_FAILED");
  }
});
test("diagnóstico: resposta de sucesso inválida é falha de protocolo, não sucesso falso", async () => {
  for (const headers of [{ "content-type": "text/html" }, { "content-type": "application/json" }]) {
    const { logs, res } = await invoke(async () => new Response(`private-provider-message ${secret}`, { headers }));
    assert.deepEqual(logs, [{ status: 200, code: "AUTH_UPSTREAM_INVALID_RESPONSE" }]);
    assert.equal(res.statusCode, 502); assert.equal(JSON.parse(res.body).code, "AUTH_COMMUNICATION_FAILED");
  }
});
test("diagnóstico: timeout ao ler o erro conserva o status recebido, sem corpo ou exceção", async () => {
  const { logs, res } = await invoke(async () => new Response(new ReadableStream({
    start(controller) { controller.error(new DOMException(`private-provider-message ${secret}`, "TimeoutError")); },
  }), { status: 503, headers: { "content-type": "application/json" } }));
  assert.deepEqual(logs, [{ status: 503, code: "AUTH_UPSTREAM_TIMEOUT" }]);
  assert.equal(res.statusCode, 504); assert.equal(JSON.parse(res.body).code, "AUTH_COMMUNICATION_FAILED");
});
test("diagnóstico: configuração local inválida não abre rede nem registra a configuração", async () => {
  for (const config of [{ ...env, NEON_AUTH_BASE_URL: `https://sensitive-host.invalid/?token=${secret}` }, { ...env, AUTH_APP_ORIGIN: "invalid" }, { ...env, NEON_AUTH_BASE_URL: "" }]) {
    let calls = 0;
    const { logs, res } = await invoke(async () => { calls++; throw Error(); }, undefined, config);
    assert.equal(calls, 0); assert.deepEqual(logs, [{ status: null, code: "AUTH_PROXY_CONFIGURATION_ERROR" }]);
    assert.equal(res.statusCode, config.NEON_AUTH_BASE_URL ? 503 : 404);
  }
});
test("diagnóstico: Production, entrada inválida e CSRF não geram logs nem acessam o serviço", async () => {
  let calls = 0; const logs: AuthDiagnostic[] = [];
  const send: typeof fetch = async () => { calls++; throw Error(); };
  const handler = createAuthProxy(env, send, entry => { logs.push(entry); });
  for (const req of [{ ...request(), body: "{invalid" }, { ...request(), headers: { ...request().headers, origin: "https://attacker.invalid" } }]) {
    const res = response(); await handler(req, res); assert.ok([400, 403].includes(res.statusCode));
  }
  const prod = await invoke(send, undefined, { ...env, VERCEL_ENV: "production" });
  assert.equal(prod.res.statusCode, 404); assert.deepEqual(prod.logs, []);
  assert.deepEqual(logs, []); assert.equal(calls, 0);
});
test("diagnóstico: sucesso e anti-enumeração mantêm contrato e não expõem estado da conta", async () => {
  const success = await invoke(async () => Response.json({ status: true }));
  assert.equal(success.res.statusCode, 200); assert.deepEqual(success.logs, []);
  for (const code of ["USER_NOT_FOUND", "EMAIL_ALREADY_VERIFIED"]) {
    const { logs, res } = await invoke(failure(400, code));
    assert.deepEqual(logs, [{ status: 400, code }]); assert.equal(res.statusCode, 200); assert.deepEqual(JSON.parse(res.body), { status: true });
  }
});
test("diagnóstico: logger padrão emite um único JSON com apenas status e código", async context => {
  const lines: unknown[][] = [];
  context.mock.method(console, "warn", (...args: unknown[]) => { lines.push(args); });
  const res = response(); await createAuthProxy(env, failure(400, "RESET_PASSWORD_DISABLED"))(request(), res);
  assert.deepEqual(lines, [[JSON.stringify({ status: 400, code: "RESET_PASSWORD_DISABLED" })]]);
});
test("diagnóstico: indisponibilidade do logger não muda a resposta de autenticação", async () => {
  const res = response();
  await createAuthProxy(env, failure(429, "TOO_MANY_REQUESTS"), () => { throw Error("private-provider-message"); })(request(), res);
  assert.equal(res.statusCode, 429); assert.equal(JSON.parse(res.body).code, "TOO_MANY_REQUESTS");
});
