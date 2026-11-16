import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { neonConfig } from "@neondatabase/serverless";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { migrationPlan } from "../server/db/migration-plan.js";
import { createDatabase } from "../server/db/client.js";
import { createIdentityVerifier } from "../server/security/identity.js";
import { createFinancialHandler } from "../server/financial/handler.js";
import type { DatabaseDiagnostic } from "../server/db/diagnostics.js";
import { fixture } from "./fixtures.js";
import { readWorkbook } from "../src/importacao/workbook.js";
import { suggestMappings } from "../src/importacao/mapping.js";

const workspace = "6aa0ef36-66d5-4b16-8acc-2846586458ec";
const other = "11111111-1111-4111-8111-111111111111";
const issuer = "https://synthetic.neon.build/neondb/auth";
const environment = { VERCEL_ENV: "production", FINANCIAL_API_ENABLED: "true", FINANCIAL_PRODUCTION_ENABLED: "true",
  DATABASE_URL: "postgresql://biosaude_runtime_prod:NEVER_REAL@ep-synthetic.example.invalid/neondb?sslmode=require",
  FINANCIAL_AUTH_ISSUER: issuer, FINANCIAL_AUTH_JWKS_URL: issuer + "/.well-known/jwks.json" };

test("Production flow: real Neon driver and JWT verifier, disposable SQL database and simulated HTTPS", async t => {
  const directory = await mkdtemp(join(tmpdir(), "biosaude-production-driver-"));
  let pg = new PGlite(directory);
  const previous = neonConfig.fetchFunction;
  try {
    await pg.exec("CREATE DATABASE neondb");
    await pg.close();
    pg = new PGlite(directory, { database: "neondb" });
    for (const migration of await migrationPlan()) await pg.exec(migration.sql);
    await pg.exec("CREATE ROLE biosaude_runtime_prod LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT");
    for (const w of [workspace, other]) {
      await pg.query("INSERT INTO biosaude.workspaces(id,name) VALUES($1,'Synthetic')", [w]);
      await pg.query("INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,permissions,provisioned_by) VALUES($1,$2,'operator',ARRAY['datasets:read','datasets:write','credit:read','credit:write'],'offline-test')", [w, issuer]);
    }
    await pg.exec("CREATE TABLE public.lg_financial_records(id text PRIMARY KEY, amount_cents bigint); INSERT INTO public.lg_financial_records VALUES('synthetic-legacy',123)");
    await pg.exec(await readFile("scripts/neon-production-login-boundary.sql", "utf8"));
    await pg.exec(await readFile("scripts/neon-production-runtime-grants.sql", "utf8"));
    // Isolated fixture only. Production/homologation credentials and networks are never used.
    await pg.exec("SET SESSION AUTHORIZATION biosaude_runtime_prod");
    assert.deepEqual((await pg.query("SELECT session_user,current_user")).rows,
      [{ session_user: "biosaude_runtime_prod", current_user: "biosaude_runtime_prod" }]);
    let requests = 0;
    neonConfig.fetchFunction = async (_url, options) => {
      requests++;
      assert.equal(new Headers(options.headers).get("Neon-Batch-Isolation-Level"), "Serializable");
      const body = JSON.parse(String(options.body)) as { queries: { query: string; params: string[] }[] };
      try {
        const results = await pg.transaction(async tx => {
          const results = [];
          for (const q of body.queries) {
            const result = await tx.query(q.query, q.params);
            results.push({ fields: result.fields, rows: result.rows.map(row => result.fields.map(field => {
              const value = (row as Record<string, unknown>)[field.name];
              return value === null ? null : typeof value === "boolean" ? value ? "t" : "f"
                : typeof value === "object" ? JSON.stringify(value) : String(value);
            })) });
          }
          return results;
        });
        return Response.json({ results });
      } catch (error) {
        return Response.json({ message: "Synthetic database failure", code: (error as { code: string }).code }, { status: 400 });
      }
    };
    const keys = await generateKeyPair("RS256");
    const identity = createIdentityVerifier(environment, createLocalJWKSet({ keys: [{ ...(await exportJWK(keys.publicKey)), kid: "synthetic" }] }));
    const token = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "synthetic" }).setIssuer(issuer)
      .setAudience(issuer).setSubject("operator").setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
    const logs: DatabaseDiagnostic[] = [];
    const handler = createFinancialHandler({ environment, identity,
      database: createDatabase(environment, undefined, entry => { logs.push(entry); }), diagnostic: () => {} });
    async function invoke(operation: string, scope = workspace, jwt: string | undefined = token,
      options: { method?: string; body?: unknown; revision?: number } = {}) {
      const res = { statusCode: 0, body: "", headers: {} as Record<string, string>,
        setHeader(k: string, v: string) { this.headers[k] = v; }, end(body?: string) { this.body = body ?? ""; } };
      await handler({ method: options.method ?? "GET", url: `/api/financial/${operation}`, body: options.body,
        headers: { "x-workspace-id": scope, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.revision !== undefined ? { "if-match": `"${options.revision}"` } : {}) } }, res);
      return res;
    }
    await t.test("missing JWT never connects; authorized empty database is 200 with revision zero", async () => {
      assert.equal((await invoke("active", workspace, "")).statusCode, 401);
      assert.equal(requests, 0);
      const active = await invoke("active");
      assert.equal(active.statusCode, 200, JSON.stringify(logs));
      assert.deepEqual(JSON.parse(active.body), { dataset: null });
      assert.equal(active.headers["X-Biosaude-Revision"], "0");
      for (const [operation, field] of [["versions", "versions"], ["proposals", "proposals"]]) {
        const res = await invoke(operation);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(JSON.parse(res.body)[field], []);
      }
      assert.equal((await invoke("version?versionId=missing")).statusCode, 404);
      assert.deepEqual(logs, []);
    });
    await t.test("restrictive policy denies another workspace despite its valid membership", async () => {
      assert.equal((await invoke("active", other)).statusCode, 403);
      assert.equal(logs.at(-1)?.category, "sql_permission_denied");
    });
    await t.test("Excel validation/import and version reads work with minimum runtime grants and preserve legacy", async () => {
      const source = await readWorkbook(Uint8Array.from(await fixture()).buffer);
      const body = { source, mappings: suggestMappings(source), reference: "2026-10-19", filename: "SYNTHETIC.xlsx", confirm: true };
      assert.equal((await invoke("validate", workspace, token, { method: "POST", body })).statusCode, 200);
      const imported = await invoke("imports", workspace, token, { method: "POST", body, revision: 0 });
      assert.equal(imported.statusCode, 201, JSON.stringify(logs));
      const active = await invoke("active");
      assert.equal(active.statusCode, 200);
      assert.equal(JSON.parse(active.body).dataset.records.length, 6);
      assert.equal(active.headers["X-Biosaude-Revision"], "1");
      const versions = await invoke("versions");
      assert.equal(versions.statusCode, 200);
      assert.equal(JSON.parse(versions.body).versions[0].record_count, 6);
      const version = await invoke("version?versionId=" + encodeURIComponent(JSON.parse(imported.body).versionId));
      assert.equal(version.statusCode, 200);
      assert.equal(JSON.parse(version.body).dataset.records.length, 6);
      // PGlite's single backend needs an explicit fixture login switch.
      await pg.exec("SET SESSION AUTHORIZATION postgres");
      assert.deepEqual((await pg.query("SELECT id,amount_cents::text FROM public.lg_financial_records")).rows,
        [{ id: "synthetic-legacy", amount_cents: "123" }]);
      await pg.exec("SET SESSION AUTHORIZATION biosaude_runtime_prod");
    });
    await t.test("unsafe runtime is an infrastructure 503, not a user's permission 403", async () => {
      await pg.exec("SET SESSION AUTHORIZATION postgres; GRANT CREATE ON SCHEMA biosaude TO biosaude_runtime_prod; SET SESSION AUTHORIZATION biosaude_runtime_prod");
      const res = await invoke("active");
      assert.equal(res.statusCode, 503);
      assert.deepEqual(JSON.parse(res.body), { code: "FINANCIAL_API_UNAVAILABLE" });
      assert.equal(logs.at(-1)?.category, "runtime_security_rejected");
    });
  } finally {
    neonConfig.fetchFunction = previous;
    await pg.close();
    await rm(directory, { recursive: true, force: true });
  }
});
