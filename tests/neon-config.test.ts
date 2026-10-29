import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";
import { databaseConfiguration, readDatabaseUrl } from "../server/config";
import { createDatabase } from "../server/db/client";
import { PostgresDatasetRepository } from "../server/persistence/postgres-datasets";
import { PostgresProposalRepository } from "../server/persistence/postgres-proposals";
import { serverBoundary } from "../build/server-boundary";
import health from "../api/health";
import { migrationPlan } from "../server/db/migration-plan";
const fake =
  "postgresql://unit_user:NOT_A_REAL_PASSWORD@ep-unit.example.invalid/test_db?sslmode=require";
test("configuração: DATABASE_URL do servidor, TLS obrigatório e mensagens sem credenciais", () => {
  assert.deepEqual(databaseConfiguration({}), {
    configured: false,
    code: "DATABASE_URL_MISSING",
  });
  assert.equal(readDatabaseUrl({ DATABASE_URL: fake }), fake);
  for (const bad of [
    "not-a-url",
    fake.replace("postgresql:", "https:"),
    fake.replace("sslmode=require", "sslmode=disable"),
    fake.replace("?sslmode=require", ""),
  ]) {
    const result = databaseConfiguration({ DATABASE_URL: bad });
    assert.equal(result.configured, false);
    assert.ok(!JSON.stringify(result).includes("NOT_A_REAL_PASSWORD"));
    assert.throws(
      () => readDatabaseUrl({ DATABASE_URL: bad }),
      (e) => !String(e).includes(bad),
    );
  }
  assert.equal(
    databaseConfiguration({ DATABASE_URL: fake, VITE_DATABASE_URL: fake }).code,
    "PUBLIC_DATABASE_URL_FORBIDDEN",
  );
});
test("conexão: nenhuma leitura de segredo, fábrica ou rede antes da primeira operação", async () => {
  let reads = 0,
    calls = 0;
  const env = new Proxy(
    {},
    {
      get() {
        reads++;
        throw Error("Não ler ambiente antecipadamente");
      },
    },
  );
  const db = createDatabase(env, () => {
    calls++;
    throw Error("Não abrir antecipadamente");
  });
  assert.equal(reads, 0);
  assert.equal(calls, 0);
  const repo = new PostgresDatasetRepository(db),
    proposals = new PostgresProposalRepository(db);
  for (const request of [
    () => repo.load(),
    () => repo.history(),
    () => repo.clear(),
    () => repo.save({} as never),
    () => proposals.list(),
    () => proposals.append({} as never),
  ])
    await assert.rejects(request(), { code: "ACCESS_DENIED" });
  assert.equal(reads, 0);
  assert.equal(calls, 0);
});
test("conexão: contexto transacional local, reutilização da fábrica e erro do driver sanitizado", async () => {
  let factories = 0;
  const batches: unknown[] = [];
  const db = createDatabase({ DATABASE_URL: fake }, () => {
    factories++;
    return {
      async transaction(statements) {
        batches.push(statements);
        return [[{}], [{ ok: 1 }]];
      },
    };
  });
  const w = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(
    await db.transaction(w, [
      { text: "SELECT $1 AS value", values: ["valor literal"] },
    ]),
    [[{ ok: 1 }]],
  );
  await db.transaction(w, []);
  assert.equal(factories, 1);
  assert.equal(
    (batches[0] as { text: string; values: string[] }[])[0].text,
    "SELECT set_config('biosaude.workspace_id', $1, true)",
  );
  const bad = createDatabase({ DATABASE_URL: fake }, () => ({
    async transaction() {
      throw Error(fake);
    },
  }));
  await assert.rejects(
    bad.transaction(w, []),
    (e) =>
      String(e).includes("persistência") &&
      !String(e).includes("NOT_A_REAL_PASSWORD"),
  );
});
test("servidor: guardas negam navegador e identificador de organização inválido", async () => {
  Object.defineProperty(globalThis, "window", {
    value: {},
    configurable: true,
  });
  try {
    assert.throws(() => createDatabase({ DATABASE_URL: fake }), {
      code: "SERVER_ONLY",
    });
    assert.throws(() => readDatabaseUrl({ DATABASE_URL: fake }), {
      code: "SERVER_ONLY",
    });
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
  let opened = false;
  const db = createDatabase({ DATABASE_URL: fake }, () => {
    opened = true;
    throw Error();
  });
  await assert.rejects(db.transaction("identificador-inválido", []), {
    code: "WORKSPACE_INVALID",
  });
  assert.equal(opened, false);
});
test("API: saúde técnica não revela configuração, dados ou operações financeiras", async () => {
  function request(method: string) {
    const response = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      body: undefined as string | undefined,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      end(body?: string) {
        this.body = body;
      },
    };
    health({ method }, response);
    return response;
  }
  assert.deepEqual(JSON.parse(request("GET").body!), {
    status: "ok",
    persistence: "local",
    financialApi: "disabled",
  });
  assert.equal(request("HEAD").body, undefined);
  assert.equal(request("POST").statusCode, 405);
  assert.equal(request("GET").headers["Cache-Control"], "no-store");
  assert.deepEqual(
    (await readdir("api")).filter((f) => f.endsWith(".ts")),
    ["health.ts"],
  );
});
test("migrações: plano offline determinístico e exemplos sem credenciais reais", async () => {
  const a = await migrationPlan(),
    b = await migrationPlan();
  assert.equal(a.length, 3);
  assert.deepEqual(a, b);
  assert.ok(a.every((m) => /^[0-9a-f]{64}$/.test(m.checksum)));
  const example = await readFile(".env.example", "utf8");
  assert.match(example, /^DATABASE_URL=\s*$/m);
  assert.doesNotMatch(example, /postgres(?:ql)?:\/\//);
  assert.match(await readFile(".gitignore", "utf8"), /!\.env\.example/);
});
test("build: código servidor e driver SQL são bloqueados em qualquer entrada do navegador", async () => {
  await assert.rejects(
    build({
      configFile: false,
      root: process.cwd(),
      logLevel: "silent",
      plugins: [serverBoundary()],
      build: {
        write: false,
        rollupOptions: { input: resolve("server/config.ts") },
      },
    }),
    /servidor.*navegador/,
  );
  const plugin = serverBoundary();
  const hook = plugin.configResolved as (c: unknown) => void;
  assert.throws(
    () => hook({ env: { VITE_DATABASE_URL: fake } }),
    (e) => !String(e).includes("NOT_A_REAL_PASSWORD"),
  );
});
