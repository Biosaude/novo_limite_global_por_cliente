import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { neonConfig } from "@neondatabase/serverless";
import {
  createConnectivityHandler,
  type DiagnosticRequest,
  type DiagnosticResponse,
} from "../server/diagnostics/neon-connectivity";
import {
  checkReadOnlyConnectivity,
  CONNECTIVITY_SQL,
  CONNECTIVITY_TIMEOUT_MS,
} from "../server/db/client";
import {
  runPreviewProbe,
  previewEndpoint,
} from "../scripts/neon-preview-client";
import { createDiagnosticKeyFile } from "../scripts/diagnostic-key";
import health from "../api/health";
import { serverBoundary } from "../build/server-boundary";
const token = "ab".repeat(32);
const fake =
  "postgresql://synthetic_user:NEVER_A_REAL_PASSWORD@ep-unit.example.invalid/unit?sslmode=require";
const environment = {
  VERCEL_ENV: "preview",
  NEON_DIAGNOSTIC_TOKEN: token,
  DATABASE_URL: fake,
};
const request = (
  override: Partial<DiagnosticRequest> = {},
): DiagnosticRequest => ({
  method: "POST",
  url: "/api/diagnostics/neon",
  headers: { authorization: `Bearer ${token}` },
  ...override,
});
function response() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    end(body?: string) {
      this.body = body ?? "";
    },
  };
}
async function invoke(
  handler: ReturnType<typeof createConnectivityHandler>,
  req = request(),
) {
  const res = response();
  await handler(req, res);
  return res;
}
const rawResult = (value = "1") => ({
  results: [
    {
      command: "SELECT",
      rowCount: 1,
      rows: [[value]],
      fields: [{ name: "ok", dataTypeID: 23 }],
    },
  ],
});
async function withTransport<T>(
  send: (url: string, options: RequestInit) => Promise<Response>,
  fn: () => Promise<T>,
) {
  const previous = neonConfig.fetchFunction;
  neonConfig.fetchFunction = send;
  try {
    return await fn();
  } finally {
    neonConfig.fetchFunction = previous;
  }
}
test("diagnóstico: Production, ambiente ausente e chave não configurada permanecem desabilitados", async () => {
  let queries = 0;
  for (const env of [
    { ...environment, VERCEL_ENV: "production" },
    { ...environment, VERCEL_ENV: undefined },
    { ...environment, NEON_DIAGNOSTIC_TOKEN: "" },
    { ...environment, NEON_DIAGNOSTIC_TOKEN: "fraca" },
    { ...environment, VITE_NEON_DIAGNOSTIC_TOKEN: token },
  ]) {
    const res = await invoke(
      createConnectivityHandler({
        environment: env,
        probe: async () => {
          queries++;
        },
      }),
    );
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { code: "NOT_FOUND" });
  }
  assert.equal(queries, 0);
});
test("autorização: ausência, duplicação e token inválido não consultam configuração nem banco", async () => {
  let reads = 0;
  const env = new Proxy(environment, {
    get(target, key) {
      if (key === "DATABASE_URL") {
        reads++;
        throw Error(fake);
      }
      return target[key as keyof typeof target];
    },
  });
  const handler = createConnectivityHandler({
    environment: env,
    probe: async () => {
      throw Error("Não consultar");
    },
  });
  for (const headers of [
    {},
    { authorization: `Bearer ${"cd".repeat(32)}` },
    { authorization: [`Bearer ${token}`] },
    { authorization: "Bearer " + token + ", Bearer " + token },
    { authorization: "Basic " + token },
    { authorization: "Bearer 😀" },
  ]) {
    const res = await invoke(handler, request({ headers }));
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers["WWW-Authenticate"], "Bearer");
    assert.ok(!res.body.includes(token));
  }
  assert.equal(reads, 0);
});
test("superfície: aceita somente POST sem corpo, query string, SQL ou credenciais na requisição", async () => {
  let count = 0;
  const handler = createConnectivityHandler({
    environment,
    probe: async () => {
      count++;
    },
  });
  for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"])
    assert.equal((await invoke(handler, request({ method }))).statusCode, 405);
  for (const req of [
    request({ body: { sql: "DROP TABLE forbidden" } }),
    request({ url: "/api/diagnostics/neon?token=never" }),
    request({
      headers: { authorization: `Bearer ${token}`, "content-length": "1" },
    }),
    request({
      headers: {
        authorization: `Bearer ${token}`,
        "transfer-encoding": "chunked",
      },
    }),
  ])
    assert.equal((await invoke(handler, req)).statusCode, 400);
  assert.equal(count, 0);
});
test("resposta: sucesso somente depois de aguardar a consulta, sem dados financeiros ou configuração", async () => {
  let queried = false;
  const handler = createConnectivityHandler({
    environment,
    probe: async () => {
      await Promise.resolve();
      queried = true;
    },
    now: () => new Date("2026-10-29T12:00:00.000Z"),
  });
  const res = await invoke(handler);
  assert.equal(queried, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    code: "NEON_CONNECTIVITY_OK",
    connected: true,
    readOnly: true,
    checkedAt: "2026-10-29T12:00:00.000Z",
    persistence: "local",
    financialApi: "disabled",
  });
  assert.equal(res.headers["Cache-Control"], "no-store, private");
  assert.equal(res.headers["Vercel-CDN-Cache-Control"], "no-store");
  assert.ok(!res.body.includes(fake));
  assert.ok(!res.body.includes(token));
});
test("falhas: erro com URL, host e chave é descartado sem resposta detalhada nem logs", async (t) => {
  const log = t.mock.method(console, "log", () => {}),
    error = t.mock.method(console, "error", () => {});
  const res = await invoke(
    createConnectivityHandler({
      environment,
      probe: async () => {
        throw Error(fake + " " + token);
      },
    }),
  );
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), {
    code: "NEON_CONNECTIVITY_UNAVAILABLE",
    connected: false,
    persistence: "local",
    financialApi: "disabled",
  });
  assert.equal(log.mock.callCount(), 0);
  assert.equal(error.mock.callCount(), 0);
  assert.ok(!res.body.includes("example.invalid"));
});
test("driver real, transporte simulado: envia exclusivamente SELECT 1 com transação READ ONLY e timeout", async () => {
  let calls = 0;
  await withTransport(
    async (url, options) => {
      calls++;
      assert.ok(url.includes("example.invalid"));
      assert.deepEqual(JSON.parse(String(options.body)), {
        queries: [{ query: CONNECTIVITY_SQL, params: [] }],
      });
      const headers = new Headers(options.headers);
      assert.equal(headers.get("Neon-Batch-Read-Only"), "true");
      assert.equal(headers.get("Neon-Batch-Isolation-Level"), "ReadCommitted");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      assert.equal(CONNECTIVITY_TIMEOUT_MS, 5000);
      return new Response(JSON.stringify(rawResult()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    () => checkReadOnlyConnectivity(environment),
  );
  assert.equal(calls, 1);
});
test("consulta: configuração ausente não chama transporte; resultado inesperado nunca confirma conexão", async () => {
  let calls = 0;
  await withTransport(
    async () => {
      calls++;
      return new Response(JSON.stringify(rawResult("0")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    async () => {
      await assert.rejects(checkReadOnlyConnectivity({}), {
        code: "DATABASE_URL_MISSING",
      });
      assert.equal(calls, 0);
      await assert.rejects(checkReadOnlyConnectivity(environment), {
        code: "CONNECTIVITY_UNAVAILABLE",
      });
    },
  );
});
test("driver: falha e cancelamento não propagam credenciais ou detalhes do transporte", async () => {
  await withTransport(
    async () => {
      throw Error(fake);
    },
    async () => {
      await assert.rejects(
        checkReadOnlyConnectivity(environment),
        (error) =>
          String(error).includes("conectividade") &&
          !String(error).includes("example.invalid") &&
          !String(error).includes("NEVER_A_REAL_PASSWORD"),
      );
    },
  );
});
test("Development permitido com a mesma proteção; /api/health continua público e idêntico", async () => {
  const res = await invoke(
    createConnectivityHandler({
      environment: {
        ...environment,
        VERCEL_ENV: "development",
        NODE_ENV: "production",
      },
      probe: async () => {},
    }),
  );
  assert.equal(res.statusCode, 200);
  for (const method of ["GET", "HEAD", "POST"]) {
    const out = response();
    health({ method }, out);
    assert.equal(out.statusCode, method === "POST" ? 405 : 200);
    if (method === "GET")
      assert.deepEqual(JSON.parse(out.body), {
        status: "ok",
        persistence: "local",
        financialApi: "disabled",
      });
    if (method === "HEAD") assert.equal(out.body, "");
  }
});
test("cliente seguro: usa HTTPS do Preview, token em header e não acompanha redirecionamentos", async () => {
  let requests = 0;
  const result = await runPreviewProbe(
    "https://project-test.vercel.app",
    environment,
    async (url, options) => {
      requests++;
      assert.equal(
        String(url),
        "https://project-test.vercel.app/api/diagnostics/neon",
      );
      assert.equal(options?.method, "POST");
      assert.equal(options?.redirect, "error");
      assert.equal(options?.body, undefined);
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        `Bearer ${token}`,
      );
      return new Response(
        JSON.stringify({
          code: "NEON_CONNECTIVITY_OK",
          connected: true,
          readOnly: true,
          checkedAt: "2026-10-29T12:00:00.000Z",
          persistence: "local",
          financialApi: "disabled",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  );
  assert.equal(result.success, true);
  assert.equal(requests, 1);
  assert.ok(!JSON.stringify(result).includes(token));
  for (const url of [
    "http://project.vercel.app",
    "https://evil.invalid",
    "https://project.vercel.app.evil.invalid",
    "https://user:pass@project.vercel.app",
    "https://project.vercel.app?token=anything",
    "https://project.vercel.app/path",
  ])
    assert.throws(() => previewEndpoint(url));
});
test("cliente: falta de chave, proteção Vercel e conteúdo remoto não são impressos como erros brutos", async () => {
  let called = false;
  const absent = await runPreviewProbe(
    "https://project.vercel.app",
    {},
    async () => {
      called = true;
      throw Error();
    },
  );
  assert.equal(absent.success, false);
  assert.equal(called, false);
  const html = await runPreviewProbe(
    "https://project.vercel.app",
    environment,
    async () => new Response(fake, { status: 401 }),
  );
  assert.equal(html.code, "PREVIEW_RESPONSE_NOT_JSON");
  const malicious = await runPreviewProbe(
    "https://project.vercel.app",
    environment,
    async () =>
      new Response(JSON.stringify({ code: fake, host: fake }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
  );
  assert.equal(malicious.code, "PREVIEW_CHECK_FAILED");
  assert.ok(!JSON.stringify(malicious).includes("example.invalid"));
});
test("cliente: sinalizador connected sem resultado completo e confirmado não é sucesso", async () => {
  for (const body of [
    { connected: true },
    { code: "NEON_CONNECTIVITY_OK", connected: false },
    {
      code: "NEON_CONNECTIVITY_OK",
      connected: true,
      readOnly: true,
      persistence: "local",
      financialApi: "disabled",
      checkedAt: fake,
    },
  ]) {
    const res = await runPreviewProbe(
      "https://project.vercel.app",
      environment,
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    assert.equal(res.success, false);
    assert.notEqual(res.code, "NEON_CONNECTIVITY_OK");
  }
});
test("chave: arquivo privado gerado sem sobrescrita, versão pública permanece vazia", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "biosaude-diagnostic-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, ".env.neon-diagnostic");
  await createDiagnosticKeyFile(path);
  const contents = await readFile(path, "utf8");
  assert.match(contents, /^NEON_DIAGNOSTIC_TOKEN=[a-f0-9]{64}\n$/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await assert.rejects(createDiagnosticKeyFile(path), { code: "EEXIST" });
  assert.equal(await readFile(path, "utf8"), contents);
  const example = await readFile(".env.example", "utf8");
  assert.match(example, /^NEON_DIAGNOSTIC_TOKEN=\s*$/m);
});
test("build: variável pública do diagnóstico também é proibida sem exibir a chave", () => {
  const plugin = serverBoundary();
  const hook = plugin.configResolved as (value: unknown) => void;
  assert.throws(
    () => hook({ env: { VITE_NEON_DIAGNOSTIC_TOKEN: token } }),
    (error) => !String(error).includes(token),
  );
});
test("HTTP local: rota protegida não alcança banco sem autorização; saúde preservada", async (t) => {
  let calls = 0;
  const handler = createConnectivityHandler({
    environment,
    probe: async () => {
      calls++;
    },
  });
  const server = createServer((req, res) => {
    if (req.url === "/api/health") health(req, res);
    else void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  );
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal(
    (await fetch(base + "/api/diagnostics/neon", { method: "POST" })).status,
    401,
  );
  assert.equal(calls, 0);
  assert.equal((await fetch(base + "/api/health")).status, 200);
  const authorized = await fetch(base + "/api/diagnostics/neon", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(authorized.status, 200);
  assert.equal(calls, 1);
});
