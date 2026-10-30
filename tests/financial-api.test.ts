import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { migrationPlan } from "../server/db/migration-plan";
import {
  createDatabase,
  type Row,
  type ScopedDatabase,
} from "../server/db/client";
import { createIdentityVerifier } from "../server/security/identity";
import { financialContext } from "../server/security/financial-context";
import {
  createFinancialHandler,
  type FinancialRequest,
} from "../server/financial/handler";
import { proposedConfig } from "../src/credito/policy";
import { normalizeImport } from "../server/financial/import-input";
import { fixture } from "./fixtures";
import { readWorkbook } from "../src/importacao/workbook";
import { suggestMappings } from "../src/importacao/mapping";
import disabledRoute from "../api/financial/[operation]";
const pg = new PGlite();
const issuer = "https://identity.example.invalid/",
  audience = "biosaude-financial-test";
const environment = {
  FINANCIAL_API_ENABLED: "true",
  VERCEL_ENV: "preview",
  FINANCIAL_AUTH_ISSUER: issuer,
  FINANCIAL_AUTH_AUDIENCE: audience,
  FINANCIAL_AUTH_JWKS_URL: issuer + ".well-known/jwks.json",
};
const url =
  "postgresql://test:NOT_A_REAL_PASSWORD@test.invalid/test?sslmode=require";
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let verifier: ReturnType<typeof createIdentityVerifier>;
let db: ScopedDatabase;
let source: Awaited<ReturnType<typeof readWorkbook>>;
let databaseCalls = 0;
before(async () => {
  keys = await generateKeyPair("RS256");
  verifier = createIdentityVerifier(
    environment,
    createLocalJWKSet({
      keys: [
        {
          ...(await exportJWK(keys.publicKey)),
          kid: "synthetic-key",
          alg: "RS256",
        },
      ],
    }),
  );
  for (const migration of await migrationPlan()) await pg.exec(migration.sql);
  await pg.exec(
    "CREATE ROLE api_test NOSUPERUSER NOBYPASSRLS NOLOGIN; GRANT USAGE ON SCHEMA biosaude TO api_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA biosaude TO api_test; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA biosaude TO api_test",
  );
  db = createDatabase({ DATABASE_URL: url }, () => ({
    async transaction(statements) {
      databaseCalls++;
      return pg.transaction(async (tx) => {
        const rows: Row[][] = [];
        await tx.exec("SET LOCAL ROLE api_test");
        for (const s of statements)
          rows.push(
            (await tx.query(s.text, [...(s.values ?? [])])).rows as Row[],
          );
        return rows;
      });
    },
  }));
  source = await readWorkbook(Uint8Array.from(await fixture()).buffer);
});
after(async () => pg.close());
async function token(
  subject = "operator",
  overrides: Record<string, unknown> = {},
) {
  return new SignJWT({ ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
    .setSubject(subject)
    .setIssuer(String(overrides.iss ?? issuer))
    .setAudience(String(overrides.aud ?? audience))
    .setIssuedAt()
    .setExpirationTime(
      (overrides.exp as number) ?? Math.floor(Date.now() / 1000) + 300,
    )
    .sign(keys.privateKey);
}
async function seed(
  subject = "operator",
  permissions = [
    "datasets:read",
    "datasets:write",
    "credit:read",
    "credit:write",
  ],
) {
  const workspace = crypto.randomUUID();
  await pg.query(
    "INSERT INTO biosaude.workspaces(id,name) VALUES($1,'Workspace sintético')",
    [workspace],
  );
  // Provisionamento privilegiado apenas no banco descartável de teste; nunca pelo runtime da API.
  await pg.query(
    "INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,permissions,provisioned_by) VALUES($1,$2,$3,$4,'synthetic-test-bootstrap')",
    [workspace, issuer, subject, permissions],
  );
  const bearer = await token(subject);
  const handler = createFinancialHandler({
    environment,
    identity: verifier,
    database: db,
  });
  async function request(
    operation: string,
    method = "GET",
    body?: unknown,
    revision?: number,
    extra: Record<string, string | string[]> = {},
  ) {
    const response = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      body: "",
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      end(value?: string) {
        this.body = value ?? "";
      },
    };
    await handler(
      {
        method,
        url: `/api/financial/${operation}`,
        headers: {
          authorization: `Bearer ${bearer}`,
          "x-workspace-id": workspace,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(revision !== undefined ? { "if-match": `"${revision}"` } : {}),
          ...extra,
        },
        body,
      },
      response,
    );
    return { ...response, data: JSON.parse(response.body) };
  }
  return { workspace, bearer, handler, request };
}
const input = () => ({
  source,
  mappings: suggestMappings(source),
  reference: "2026-10-19",
  filename: "BASE_SINTETICA.xlsx",
  confirm: true,
});
test("identidade: assinatura real, emissor/audience/expiração/nbf e claims administrativos não confiáveis", async () => {
  const good = await token();
  assert.equal((await verifier.verify(`Bearer ${good}`)).subject, "operator");
  for (const header of [
    undefined,
    ["Bearer " + good],
    "Bearer " + "ab".repeat(32),
    "Bearer a.b.c",
  ]) {
    await assert.rejects(verifier.verify(header), { code: "UNAUTHENTICATED" });
  }
  for (const claims of [
    { iss: "https://other.invalid/" },
    { aud: "other-api" },
    { exp: 1 },
    { nbf: Math.floor(Date.now() / 1000) + 3600 },
  ])
    await assert.rejects(
      verifier.verify("Bearer " + (await token("operator", claims))),
      { code: "UNAUTHENTICATED" },
    );
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
    .setSubject("operator")
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(other.privateKey);
  await assert.rejects(verifier.verify("Bearer " + forged), {
    code: "UNAUTHENTICATED",
  });
  const hs = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", kid: "synthetic-key" })
    .setSubject("operator")
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new Uint8Array(32));
  await assert.rejects(verifier.verify("Bearer " + hs), {
    code: "UNAUTHENTICATED",
  });
  const noExpiry = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
    .setSubject("operator")
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .sign(keys.privateKey);
  await assert.rejects(verifier.verify("Bearer " + noExpiry), {
    code: "UNAUTHENTICATED",
  });
  assert.throws(() => createIdentityVerifier({}), {
    code: "IDENTITY_NOT_CONFIGURED",
  });
});
test("API: feature flag, Production, autenticação e configuração ausente não abrem conexão", async () => {
  const baseline = databaseCalls;
  for (const env of [
    {},
    { ...environment, VERCEL_ENV: "production" },
    { ...environment, FINANCIAL_API_ENABLED: "false" },
  ]) {
    const handler = createFinancialHandler({ environment: env, database: db });
    const r = {
      statusCode: 0,
      setHeader() {},
      end(body?: string) {
        assert.equal(JSON.parse(body!).code, "NOT_FOUND");
      },
    };
    await handler(
      { method: "GET", url: "/api/financial/active", headers: {} },
      r,
    );
    assert.equal(r.statusCode, 404);
  }
  const s = await seed();
  assert.equal(
    (
      await s.request("active", "GET", undefined, undefined, {
        authorization: "",
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await s.request("active", "GET", undefined, undefined, {
        authorization: "Bearer a.b.c",
      })
    ).statusCode,
    401,
  );
  const defaultResponse = { statusCode: 0, setHeader() {}, end() {} };
  await disabledRoute({ method: "GET", headers: {} }, defaultResponse);
  assert.equal(defaultResponse.statusCode, 404);
  assert.equal(databaseCalls, baseline);
});
test("API/PostgreSQL: importar normaliza no servidor, centavos/categorias/recebimentos e versão ficam persistidos", async () => {
  const s = await seed();
  const empty = await s.request("active");
  assert.equal(empty.data.dataset, null);
  assert.equal(empty.headers.ETag, '"0"');
  const validated = await s.request("validate", "POST", input());
  assert.equal(validated.statusCode, 200);
  assert.equal(validated.data.valid, true);
  assert.equal((await s.request("versions")).data.versions.length, 0);
  assert.equal(
    (await s.request("imports", "POST", { ...input(), confirm: false }, 0))
      .statusCode,
    400,
  );
  const imported = await s.request("imports", "POST", input(), 0);
  assert.equal(imported.statusCode, 201, imported.body);
  assert.equal(imported.headers.ETag, '"1"');
  const active = await s.request("active");
  const data = active.data.dataset;
  assert.equal(data.id, imported.data.versionId);
  assert.equal(data.records.length, 6);
  const [totals] = await db.transaction(s.workspace, [
    {
      text: "SELECT category,sum(amount_cents)::text AS cents,count(*)::int AS count FROM biosaude.financial_records WHERE workspace_id=$1 GROUP BY category",
      values: [s.workspace],
    },
  ]);
  assert.deepEqual(
    Object.fromEntries(totals.map((r) => [r.category, [r.cents, r.count]])),
    { upcoming: ["10010", 1], overdue: ["5020", 1], received: ["155070", 4] },
  );
  const version = await s.request(
    "version?versionId=" + encodeURIComponent(data.id),
  );
  assert.equal(version.statusCode, 200);
  assert.deepEqual(version.data.dataset.records, data.records);
  const history = await s.request("versions?limit=1&offset=0");
  assert.equal(history.data.versions.length, 1);
  assert.equal(history.data.versions[0].record_count, 6);
});
test("API: validações de entrada, confirmação, revisão e limite de carga não gravam dados", async () => {
  const s = await seed();
  for (const [body, status] of [
    [{ ...input(), records: [] }, 400],
    [{ ...input(), mappings: [] }, 400],
    [
      {
        ...input(),
        source: { ...source, sheets: [...source.sheets, source.sheets[0]] },
      },
      400,
    ],
  ] as const)
    assert.equal(
      (await s.request("imports", "POST", body, 0)).statusCode,
      status,
    );
  const malformed = structuredClone(input());
  malformed.source.sheets[0].rows[1].cells[3] = "valor inválido";
  // Rejeita explicitamente valores financeiros que falham na normalização.
  const amount = malformed.mappings[0].fields.amount;
  malformed.source.sheets[0].rows[1].cells[amount] = "valor inválido";
  assert.equal(
    (await s.request("imports", "POST", malformed, 0)).statusCode,
    422,
  );
  assert.equal((await s.request("imports", "POST", input())).statusCode, 428);
  assert.equal(
    (await s.request("imports", "POST", { source: "x".repeat(3_000_001) }, 0))
      .statusCode,
    413,
  );
  assert.equal(
    (
      await s.request("imports", "POST", input(), 0, {
        "content-type": "text/plain",
      })
    ).statusCode,
    400,
  );
  for (const operation of [
    "versions?limit=0",
    "versions?limit=101",
    "versions?limit=1&limit=2",
    "active?sql=SELECT+1",
    "version",
  ])
    assert.equal((await s.request(operation)).statusCode, 400);
  assert.equal((await s.request("active", "POST", {}, 0)).statusCode, 405);
  assert.equal((await s.request("versions")).data.versions.length, 0);
});
test("API: histórico, troca de posição e revisões não reescrevem finanças; conflito desfaz o lote", async () => {
  const s = await seed();
  const a = await s.request("imports", "POST", input(), 0);
  const b = await s.request(
    "imports",
    "POST",
    { ...input(), reference: "2026-10-23" },
    1,
  );
  const id = a.data.versionId;
  const review = await s.request(
    "reviews",
    "PATCH",
    { versionId: id, reviews: { conferencia: "Revisão sintética" } },
    2,
  );
  assert.equal(review.statusCode, 200, review.body);
  assert.equal((await s.request("active")).data.dataset.id, b.data.versionId);
  assert.equal(
    (await s.request("version?versionId=" + id)).data.dataset.reviews
      .conferencia.note,
    "Revisão sintética",
  );
  const stale = await s.request("active", "PUT", { versionId: id }, 1);
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.data.code, "REVISION_CONFLICT");
  assert.equal((await s.request("active")).headers.ETag, '"3"');
  assert.equal(
    (await s.request("active", "PUT", { versionId: "unknown" }, 3)).statusCode,
    404,
  );
  assert.equal((await s.request("active")).headers.ETag, '"3"');
  assert.equal(
    (await s.request("active", "PUT", { versionId: id }, 3)).statusCode,
    200,
  );
  assert.equal(
    (await s.request("active", "DELETE", undefined, 4)).statusCode,
    200,
  );
  assert.equal((await s.request("active")).data.dataset, null);
  assert.equal((await s.request("versions")).data.versions.length, 2);
  const [events] = await db.transaction(s.workspace, [
    {
      text: "SELECT actor_subject,action FROM biosaude.audit_events WHERE workspace_id=$1 AND action LIKE 'dataset.%'",
      values: [s.workspace],
    },
  ]);
  assert.equal(events.length, 5);
  assert.ok(
    events.every(
      (e) => e.actor_subject === JSON.stringify([issuer, "operator"]),
    ),
  );
});
test("autorização: organização diferente, revogação, expiração e claims de função não concedem acesso", async () => {
  const a = await seed("alice"),
    b = await seed("bob");
  assert.equal(
    (
      await a.request("active", "GET", undefined, undefined, {
        "x-workspace-id": b.workspace,
      })
    ).statusCode,
    403,
  );
  const fakeAdmin = await token("stranger", {
    role: "admin",
    workspaceId: a.workspace,
    permissions: ["datasets:write"],
  });
  assert.equal(
    (
      await a.request("active", "GET", undefined, undefined, {
        authorization: "Bearer " + fakeAdmin,
      })
    ).statusCode,
    403,
  );
  await pg.query(
    "UPDATE biosaude.identity_memberships SET revoked_at=now() WHERE workspace_id=$1",
    [a.workspace],
  );
  assert.equal((await a.request("active")).statusCode, 403);
  await pg.query(
    "UPDATE biosaude.identity_memberships SET expires_at=now()-interval '1 minute' WHERE workspace_id=$1",
    [b.workspace],
  );
  assert.equal((await b.request("active")).statusCode, 403);
});
test("permissões: leitor não importa, usuário de dados não aprova crédito e nenhuma API provisiona acesso", async () => {
  const reader = await seed("reader", ["datasets:read"]);
  assert.equal((await reader.request("active")).statusCode, 200);
  assert.equal(
    (await reader.request("imports", "POST", input(), 0)).statusCode,
    403,
  );
  assert.equal((await reader.request("proposals")).statusCode, 403);
  assert.equal(
    (await reader.request("memberships", "POST", {}, 0)).statusCode,
    404,
  );
  const [updated] = await db.transaction(reader.workspace, [
    {
      text: "UPDATE biosaude.identity_memberships SET permissions=ARRAY['datasets:write'] WHERE workspace_id=$1 RETURNING *",
      values: [reader.workspace],
    },
  ]);
  assert.equal(updated.length, 0);
  await assert.rejects(
    db.transaction(reader.workspace, [
      {
        text: "INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,permissions,provisioned_by) VALUES($1,$2,'attacker',ARRAY['datasets:write'],'self')",
        values: [reader.workspace, issuer],
      },
    ]),
    { code: "ACCESS_DENIED" },
  );
});
test("revogação entre autorização e transação impede gravação e revisão não avança", async () => {
  const s = await seed("revoked-between");
  const identity = await verifier.verify("Bearer " + s.bearer);
  const context = financialContext(
    db,
    identity,
    s.workspace,
    "datasets:write",
    0,
  );
  await context.gate.authorize("datasets:write");
  await pg.query(
    "UPDATE biosaude.identity_memberships SET revoked_at=now() WHERE workspace_id=$1",
    [s.workspace],
  );
  await assert.rejects(
    context.db.transaction(s.workspace, [
      {
        text: "INSERT INTO biosaude.audit_events(workspace_id,actor_subject,action) VALUES($1,'attacker','should.not.exist')",
        values: [s.workspace],
      },
    ]),
    { code: "ACCESS_DENIED" },
  );
  const [rows] = await db.transaction(s.workspace, [
    {
      text: "SELECT * FROM biosaude.workspace_state WHERE workspace_id=$1",
      values: [s.workspace],
    },
  ]);
  assert.equal(rows.length, 0);
});
test("erros: falha de banco/identidade não expõe tokens, SQL ou credenciais", async () => {
  const s = await seed();
  const broken = createFinancialHandler({
    environment,
    identity: verifier,
    database: {
      async transaction() {
        throw Error(url + s.bearer);
      },
    },
  });
  const r = {
    statusCode: 0,
    setHeader() {},
    end(body?: string) {
      assert.equal(body, '{"code":"FINANCIAL_API_UNAVAILABLE"}');
    },
  };
  await broken(
    {
      method: "GET",
      url: "/api/financial/active",
      headers: {
        authorization: "Bearer " + s.bearer,
        "x-workspace-id": s.workspace,
      },
    },
    r,
  );
  assert.equal(r.statusCode, 503);
});
test("HTTP local: servidor com autenticação real e PostgreSQL descartável aceita leitura autorizada e nega chamada pública", async () => {
  const s = await seed();
  const server: Server = createServer((req, res) => {
    void s.handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}/api/financial/active`;
    const denied = await fetch(endpoint);
    assert.equal(denied.status, 401);
    const authorized = await fetch(endpoint, {
      headers: {
        Authorization: "Bearer " + s.bearer,
        "x-workspace-id": s.workspace,
      },
    });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get("cache-control"), "no-store, private");
    assert.deepEqual(await authorized.json(), { dataset: null });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test("normalização: totais submetidos e categoria fora do contrato são rejeitados", () => {
  assert.throws(() => normalizeImport({ ...input(), records: [] }), {
    code: "INVALID_INPUT",
  });
  const bad = structuredClone(input());
  bad.mappings[0].category = "unknown" as never;
  assert.throws(() => normalizeImport(bad), { code: "INVALID_INPUT" });
});

test("concorrência: dois escritores na mesma revisão têm um sucesso e um conflito, sem duplicar versão", async () => {
  const s = await seed("concurrent");
  const results = await Promise.all([
    s.request("imports", "POST", input(), 0),
    s.request("imports", "POST", input(), 0),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409]);
  const versions = await s.request("versions");
  assert.equal(versions.data.versions.length, 1);
  assert.equal(versions.headers.ETag, '"1"');
});
test("propostas: apenas rascunhos, permissão exclusiva e auditoria identificada", async () => {
  const s = await seed("credit-user", ["credit:read", "credit:write"]);
  const proposal = {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: new Date().toISOString(),
    reason: "Proposta sintética",
    config: proposedConfig,
    status: "draft",
  };
  const result = await s.request("proposals", "POST", proposal, 0);
  assert.equal(result.statusCode, 201, result.body);
  assert.deepEqual((await s.request("proposals")).data.proposals, [proposal]);
  assert.equal(
    (
      await s.request(
        "proposals",
        "POST",
        { ...proposal, id: crypto.randomUUID(), status: "approved" },
        1,
      )
    ).statusCode,
    400,
  );
  assert.equal((await s.request("proposals")).headers.ETag, '"1"');
  assert.equal((await s.request("active")).statusCode, 403);
});

test("provisionamento: papel sem login é separado do runtime e alterações de acesso geram auditoria", async () => {
  const workspace = crypto.randomUUID();
  await pg.query(
    "INSERT INTO biosaude.workspaces(id,name) VALUES($1,'Provisionamento sintético')",
    [workspace],
  );
  await pg.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE biosaude_membership_admin");
    await tx.query("SELECT set_config('biosaude.workspace_id',$1,true)", [
      workspace,
    ]);
    await tx.query(
      "INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,permissions,provisioned_by) VALUES($1,$2,'provisioned',ARRAY['datasets:read'],'approved-test-operator')",
      [workspace, issuer],
    );
  });
  const [events] = await db.transaction(workspace, [
    {
      text: "SELECT action,metadata,actor_subject FROM biosaude.audit_events WHERE workspace_id=$1",
      values: [workspace],
    },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "identity.membership.insert");
  assert.equal(
    (events[0].metadata as { after: { subject: string } }).after.subject,
    "provisioned",
  );
  await assert.rejects(
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE biosaude_membership_admin");
      await tx.query("SELECT * FROM biosaude.financial_records");
    }),
    { code: "42501" },
  );
  const role = await pg.query<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
    "SELECT rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname='biosaude_membership_admin'",
  );
  assert.equal(role.rows[0].rolcanlogin, false);
  assert.equal(role.rows[0].rolbypassrls, false);
});

test("auditoria PR13: proposta com critérios de risco ausentes é rejeitada sem persistência", async () => {
  const s = await seed("invalid-policy");
  const config = structuredClone(proposedConfig);
  config.rules = { Moderado: {}, Alto: {}, Crítico: {} } as typeof config.rules;
  const partial = structuredClone(proposedConfig);
  delete (partial.rules.Alto as Partial<typeof partial.rules.Alto>).delayDays;
  const extra = structuredClone(proposedConfig);
  Object.assign(extra.rules.Moderado, { approved: true });
  for (const malformed of [config, partial, extra]) {
    const response = await s.request(
      "proposals",
      "POST",
      {
        id: crypto.randomUUID(),
        version: 1,
        createdAt: new Date().toISOString(),
        reason: "Política sintética incompleta",
        config: malformed,
        status: "draft",
      },
      0,
    );
    assert.equal(response.statusCode, 400);
    assert.equal(response.data.code, "PROPOSAL_INVALID");
  }
  const list = await s.request("proposals");
  assert.equal(list.data.proposals.length, 0);
  assert.equal(list.headers.ETag, '"0"');
});

test("auditoria PR13: dados, versões e mutações de outra organização permanecem inacessíveis", async () => {
  const a = await seed("audit-alice"),
    b = await seed("audit-bob");
  const imported = await b.request("imports", "POST", input(), 0);
  assert.equal(imported.statusCode, 201);
  const id = imported.data.versionId;
  assert.equal((await a.request("version?versionId=" + id)).statusCode, 404);
  assert.equal(
    (await a.request("active", "PUT", { versionId: id }, 0)).statusCode,
    404,
  );
  assert.equal(
    (
      await a.request(
        "reviews",
        "PATCH",
        { versionId: id, reviews: { test: "Tentativa sintética" } },
        0,
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await a.request("active", "GET", undefined, undefined, {
        "x-workspace-id": b.workspace,
      })
    ).statusCode,
    403,
  );
  const own = await a.request("active");
  assert.equal(own.data.dataset, null);
  assert.equal(own.headers.ETag, '"0"');
  assert.equal((await a.request("versions")).data.versions.length, 0);
  const unchanged = await b.request("active");
  assert.equal(unchanged.data.dataset.id, id);
  assert.deepEqual(unchanged.data.dataset.reviews, {});
  assert.equal(unchanged.headers.ETag, '"1"');
  const [rows] = await db.transaction(a.workspace, [
    {
      text: "SELECT * FROM biosaude.financial_records WHERE version_id=$1",
      values: [id],
    },
  ]);
  assert.equal(rows.length, 0); // Consulta sem filtro de workspace continua protegida por RLS.
});

test("auditoria PR13: If-Match forte e inteiro seguro é obrigatório; precondições inválidas não escrevem", async () => {
  const s = await seed("audit-etag");
  for (const header of [
    "*",
    'W/"0"',
    '"0", "1"',
    '"9007199254740992"',
    "0",
    '"-1"',
  ]) {
    const result = await s.request("imports", "POST", input(), undefined, {
      "if-match": header,
    });
    assert.equal(result.statusCode, 428);
    assert.equal(result.data.code, "PRECONDITION_REQUIRED");
  }
  assert.equal((await s.request("versions")).data.versions.length, 0);
  assert.equal((await s.request("active")).headers.ETag, '"0"');
});

test("auditoria PR13: todas as tabelas de negócio têm RLS forçado e o runtime não herda provisionamento", async () => {
  const tables = await pg.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='biosaude' AND c.relkind='r' AND c.relname<>'schema_migrations'",
  );
  assert.ok(tables.rows.length >= 20);
  assert.ok(
    tables.rows.every((t) => t.relrowsecurity && t.relforcerowsecurity),
  );
  const roles = await pg.query<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
  }>(
    "SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('api_test','biosaude_membership_admin')",
  );
  assert.equal(roles.rows.length, 2);
  assert.ok(
    roles.rows.every((r) => !r.rolsuper && !r.rolbypassrls && !r.rolcanlogin),
  );
  const membership = await pg.query<{ member: boolean }>(
    "SELECT pg_has_role('api_test','biosaude_membership_admin','MEMBER') AS member",
  );
  assert.equal(membership.rows[0].member, false);
  const grants = await pg.query(
    "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='biosaude' AND proname IN ('require_permission','advance_revision','require_version') AND a.grantee=0 AND a.privilege_type='EXECUTE'",
  );
  assert.equal(grants.rows.length, 0);
});

test("auditoria PR13: bloqueio em Production e flag ausente ocorre antes de identidade e DATABASE_URL", async () => {
  let calls = 0;
  for (const flags of [
    { VERCEL_ENV: "production", FINANCIAL_API_ENABLED: "true" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "preview", FINANCIAL_API_ENABLED: "TRUE" },
  ]) {
    const env = new Proxy(flags, {
      get(target, key) {
        if (key === "DATABASE_URL") {
          calls++;
          throw Error("Não ler conexão");
        }
        return Reflect.get(target, key);
      },
    });
    const handler = createFinancialHandler({
      environment: env,
      identity: {
        async verify() {
          calls++;
          throw Error("Não autenticar em rota desligada");
        },
      },
    });
    const response = {
      statusCode: 0,
      setHeader() {},
      end(body?: string) {
        assert.equal(body, '{"code":"NOT_FOUND"}');
      },
    };
    await handler(
      {
        method: "GET",
        url: "/api/financial/active",
        headers: {
          authorization: "Bearer a.b.c",
          "x-workspace-id": crypto.randomUUID(),
          "x-vercel-env": "preview",
        },
      },
      response,
    );
    assert.equal(response.statusCode, 404);
  }
  assert.equal(calls, 0);
});

test("auditoria PR13: JWT assinado não pode substituir JWKS, omitir iat ou usar subject vazio", async () => {
  for (const [header, subject, issued] of [
    [
      {
        alg: "RS256",
        kid: "synthetic-key",
        jku: "https://attacker.invalid/jwks",
      },
      "operator",
      true,
    ],
    [{ alg: "RS256", kid: "synthetic-key" }, "operator", false],
    [{ alg: "RS256", kid: "synthetic-key" }, "  ", true],
  ] as const) {
    let signed = new SignJWT({})
      .setProtectedHeader(header)
      .setSubject(subject)
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime("5m");
    if (issued) signed = signed.setIssuedAt();
    await assert.rejects(
      verifier.verify("Bearer " + (await signed.sign(keys.privateKey))),
      { code: "UNAUTHENTICATED" },
    );
  }
});

test("API: JWT Ed25519 autoriza leitura e continua exigindo vínculo com a organização", async () => {
  const s = await seed();
  const edKeys = await generateKeyPair("EdDSA");
  const identity = createIdentityVerifier(environment, createLocalJWKSet({
    keys: [{ ...(await exportJWK(edKeys.publicKey)), kid: "neon-synthetic", alg: "EdDSA" }],
  }));
  const bearer = await new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid: "neon-synthetic" })
    .setSubject("operator")
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(edKeys.privateKey);
  const handler = createFinancialHandler({ environment, identity, database: db });
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}/api/financial/active`;
    const own = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${bearer}`, "x-workspace-id": s.workspace },
    });
    assert.equal(own.status, 200);
    assert.deepEqual(await own.json(), { dataset: null });
    const other = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${bearer}`, "x-workspace-id": crypto.randomUUID() },
    });
    assert.equal(other.status, 403);
    assert.deepEqual(await other.json(), { code: "ACCESS_DENIED" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
});

test("integração HTTP: importar, revisar, reativar e recarregar em outra sessão preserva dados no PostgreSQL descartável", async () => {
  const { FinancialHttpClient, HttpDatasetRepository, HttpProposalRepository } = await import("../src/persistencia/http");
  const s = await seed();
  const server = createServer(async (req,res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw=Buffer.concat(chunks).toString("utf8");
    await s.handler({method:req.method,url:req.url,headers:req.headers,body:raw || undefined},res);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address && typeof address!=="string");
  const send: typeof fetch=(url,init)=>fetch(`http://127.0.0.1:${address.port}${url}`,init);
  const make=()=>{
    const client=new FinancialHttpClient({workspace:s.workspace,token:async()=>s.bearer,active:()=>true,send});
    return {datasets:new HttpDatasetRepository(client),proposals:new HttpProposalRepository(client)};
  };
  try {
    const first=make();assert.equal(await first.datasets.load(),null);
    const d=normalizeImport(input());assert.equal((await first.datasets.validate(d)).valid,true);
    await first.datasets.save(d);
    const saved=await first.datasets.load();assert.ok(saved);assert.notEqual(saved.id,d.id);
    const other=make();const loaded=await other.datasets.load();assert.ok(loaded);
    assert.deepEqual(loaded.records.map(r=>[r.category,r.cents]),saved.records.map(r=>[r.category,r.cents]));
    assert.equal((await other.datasets.history()).length,1);
    const issue=loaded.issues[0]?.id ?? "synthetic-review";
    await other.datasets.updateReviews({...loaded,reviews:{[issue]:{note:"conferido",reviewedAt:new Date().toISOString()}}});
    await assert.rejects(first.datasets.clear(),{code:"REVISION_CONFLICT"});
    const fresh=make();const reviewed=await fresh.datasets.load();assert.equal(reviewed?.reviews[issue].note,"conferido");
    await fresh.datasets.clear();assert.equal(await fresh.datasets.load(),null);
    assert.equal((await fresh.datasets.history()).length,1);
    await fresh.datasets.activate(saved.id);assert.equal((await fresh.datasets.load())?.id,saved.id);
    await fresh.proposals.append({id:crypto.randomUUID(),version:1,createdAt:new Date().toISOString(),reason:"proposta sintética",config:proposedConfig,status:"draft"});
    assert.equal((await fresh.proposals.list()).length,1);
    await pg.query("UPDATE biosaude.identity_memberships SET revoked_at=now() WHERE workspace_id=$1",[s.workspace]);
    await assert.rejects(make().datasets.load(),{code:"ACCESS_DENIED"});
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});


test("GET financeiro: Buffer vazio do runtime carrega a base autorizada sem alterar revisão", async () => {
  const s = await seed();
  const imported = await s.request("imports", "POST", input(), 0);
  assert.equal(imported.statusCode, 201);
  for (const body of [undefined, null, "", Buffer.alloc(0)]) {
    for (const headers of [{}, { "content-length": "0" }] as Record<string, string>[]) {
      const active = await s.request("active", "GET", body, undefined, { ...headers, "content-type": "application/octet-stream" });
      assert.equal(active.statusCode, 200, active.body);
      assert.equal(active.data.dataset.id, imported.data.versionId);
      assert.equal(active.data.dataset.records.length, 6);
      assert.equal(active.headers.ETag, '\"1\"');
    }
  }
});
test("GET financeiro: corpos reais, framing positivo e payload ocultado pelo parser são recusados", async () => {
  const s = await seed();
  const cases: [unknown, Record<string, string | string[]>][] = [
    ...[Buffer.from("{}"), Buffer.from(" "), Buffer.from([0]), {}, [], { length: 0 },
      "{}", "null", " ", "0", 0, false, new Uint8Array(0)].map(body => [body, {}] as [unknown, Record<string, string>]),
    [Buffer.alloc(0), { "content-length": "2" }], [undefined, { "content-length": "2" }],
    [null, { "content-length": "4" }], ["", { "content-length": "2" }],
    [Buffer.alloc(0), { "transfer-encoding": "chunked" }],
    [undefined, { "transfer-encoding": "chunked" }],
    [Buffer.alloc(0), { "content-length": ["0", "2"] }],
    [Buffer.alloc(0), { "content-length": "invalid" }],
    [Buffer.alloc(0), { "content-length": "-1" }],
  ];
  for (const [body, headers] of cases) {
    const before = databaseCalls;
    const result = await s.request("active", "GET", body, undefined, headers);
    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.data, { code: "INVALID_INPUT" });
    assert.equal(databaseCalls, before + 1, "Somente a autorização anterior à validação; sem consulta da base");
  }
  const active = await s.request("active");
  assert.equal(active.statusCode, 200); assert.equal(active.headers.ETag, '\"0\"');
});
test("GET HTTP/Node: zero bytes recebidos funcionam; JSON e chunked com conteúdo são recusados", async () => {
  const s = await seed();
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    // Shape produced by a binary serverless body parser, including the zero-byte case.
    await s.handler({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) }, res);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    async function get(body?: string, extra: Record<string, string> = {}) {
      return new Promise<{ status: number; data: unknown }>((resolve, reject) => {
        const req = httpRequest({ hostname: "127.0.0.1", port: (address as { port: number }).port,
          path: "/api/financial/active", method: "GET", headers: {
            authorization: `Bearer ${s.bearer}`, "x-workspace-id": s.workspace,
            "content-type": "application/octet-stream", ...extra,
          } }, res => {
          const chunks: Buffer[] = [];
          res.on("data", chunk => chunks.push(Buffer.from(chunk)));
          res.on("error", reject);
          res.on("end", () => { try { resolve({ status: res.statusCode!, data: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } });
        });
        req.on("error", reject); req.end(body);
      });
    }
    for (const headers of [{}, { "content-length": "0" }] as Record<string, string>[])
      assert.deepEqual(await get(undefined, headers), { status: 200, data: { dataset: null } });
    for (const payload of ["{}", "null", " "])
      assert.deepEqual(await get(payload, { "content-length": String(Buffer.byteLength(payload)) }), { status: 400, data: { code: "INVALID_INPUT" } });
    assert.deepEqual(await get("{}", { "transfer-encoding": "chunked" }), { status: 400, data: { code: "INVALID_INPUT" } });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
