/** Explicit suite: PostgreSQL 18 in Docker, official Neon driver, simulated HTTP. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { neonConfig } from "@neondatabase/serverless";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { createDatabase, PRODUCTION_RUNTIME_CHECK } from "../server/db/client.js";
import { createIdentityVerifier } from "../server/security/identity.js";
import { createFinancialHandler } from "../server/financial/handler.js";
import type { DatabaseDiagnostic } from "../server/db/diagnostics.js";
import { fixture } from "./fixtures.js";
import { readWorkbook } from "../src/importacao/workbook.js";
import { suggestMappings } from "../src/importacao/mapping.js";

const image = "postgres:18@sha256:2ea8630df176ad090ec92136dee850397c5af8781e4bcf2e4162593691c61bbc";
const runtime = "biosaude_runtime_prod";
const workspace = "6aa0ef36-66d5-4b16-8acc-2846586458ec";
const other = "11111111-1111-4111-8111-111111111111";
const issuer = "https://native-test.example.invalid/";
const environment = { VERCEL_ENV: "production", FINANCIAL_API_ENABLED: "true", FINANCIAL_PRODUCTION_ENABLED: "true",
  DATABASE_URL: "postgresql://biosaude_runtime_prod:NEVER_REAL@ep-synthetic.example.invalid/neondb?sslmode=require",
  FINANCIAL_AUTH_ISSUER: issuer, FINANCIAL_AUTH_JWKS_URL: issuer + "jwks" };

test("native PostgreSQL 18: authorized empty financial reads through the actual Neon transaction sequence", { timeout: 120_000 }, async t => {
  const container = `biosaude-http-tx-${process.pid}-${Date.now()}`;
  const previous = neonConfig.fetchFunction;
  const docker = (args: string[], input?: string) => execFileSync("docker", args, {
    input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
  });
  const sql = (input: string, user = "postgres") => docker(["exec", "-i", container, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1",
    "-v", "VERBOSITY=sqlstate", "-U", user, "-d", "neondb"], input).trim();
  try {
    docker(["run", "--rm", "--detach", "--network", "none", "--name", container,
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_DB=neondb", image]);
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try { sql("SELECT 1"); ready = true; break; } catch { await delay(250); }
    }
    assert.ok(ready);
    assert.match(sql("SHOW server_version"), /^18\./);
    for (const file of ["0001_financial_foundation.sql", "0002_security_and_immutability.sql", "0003_financial_access.sql"])
      sql(readFileSync(`migrations/${file}`, "utf8"));
    sql(`CREATE ROLE ${runtime} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`);
    for (const w of [workspace, other]) sql(`
      INSERT INTO biosaude.workspaces(id,name) VALUES('${w}','Synthetic');
      INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,permissions,provisioned_by)
      VALUES('${w}','${issuer}','operator',ARRAY['datasets:read','datasets:write'],'offline-test');`);
    sql(readFileSync("scripts/neon-production-login-boundary.sql", "utf8"));
    sql(readFileSync("scripts/neon-production-runtime-grants.sql", "utf8"));

    let calls = 0, failTransport = false;
    const sequences: string[][] = [];
    const logs: DatabaseDiagnostic[] = [];
    neonConfig.fetchFunction = async (_url, options) => {
      calls++;
      if (failTransport) throw new TypeError("synthetic fetch failure", { cause: { code: "ECONNRESET" } });
      assert.equal(new Headers(options.headers).get("Neon-Batch-Isolation-Level"), "Serializable");
      const { queries } = JSON.parse(String(options.body)) as { queries: { query: string; params: (string | null)[] }[] };
      sequences.push(queries.map(q => q.query));
      assert.equal(queries[0].query, PRODUCTION_RUNTIME_CHECK);
      assert.deepEqual(queries[0].params, []);
      assert.equal(queries[1].query, "SELECT set_config('biosaude.workspace_id', $1, true)");
      // SQL runs in one real backend/transaction per HTTP batch, authenticated directly as runtime.
      // Only the HTTP adapter is simulated; no external connection string is ever used.
      let input = `BEGIN ISOLATION LEVEL SERIALIZABLE;
        SET LOCAL standard_conforming_strings=on;
        SELECT json_build_object('session',session_user,'current',current_user,
          'isolation',current_setting('transaction_isolation'),
          'unset',coalesce(current_setting('biosaude.workspace_id',true),'')='');\n`;
      const literal = (v: string | null) => v === null ? "NULL" : "'" + v.replaceAll("'", "''") + "'";
      for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        if (i === 0) {
          // Zero-parameter DO is sent with psql's extended query protocol, as by the Neon proxy.
          input += q.query + "\n\\bind\n\\g\n";
        } else {
          assert.match(q.query, /^SELECT /);
          // Preserve placeholders and PostgreSQL type inference. Convert only the result to JSON.
          input += `PREPARE q${i} AS SELECT coalesce(json_agg(row_to_json(r)),'[]'::json) FROM (${q.query}) r;\n`;
          input += `EXECUTE q${i}${q.params.length ? "(" + q.params.map(literal).join(",") + ")" : ""};\n`;
          input += `DEALLOCATE q${i};\n`;
        }
      }
      input += "COMMIT;";
      let lines: string[];
      try { lines = sql(input, runtime).split("\n"); }
      catch (error) {
        const code = /ERROR:\s+([A-Z0-9]{5})\b/.exec(String((error as { stderr: unknown }).stderr))?.[1];
        assert.ok(code, "native test database must expose a SQLSTATE");
        return Response.json({ code, message: "Synthetic database failure" }, { status: 400 });
      }
      assert.deepEqual(JSON.parse(lines.shift()!), { session: runtime, current: runtime, isolation: "serializable", unset: true });
      const results = [{ fields: [] as { name: string; dataTypeID: number }[], rows: [] as (string | null)[][] }];
      for (const line of lines) {
        const rows = JSON.parse(line) as Record<string, unknown>[];
        const names = Object.keys(rows[0] ?? {});
        const fields = names.map(name => ({ name, dataTypeID: typeof rows[0][name] === "boolean" ? 16
          : typeof rows[0][name] === "number" ? 23 : typeof rows[0][name] === "object" && rows[0][name] !== null ? 114 : 25 }));
        results.push({ fields, rows: rows.map(row => names.map(name => {
          const v = row[name];
          return v === null ? null : typeof v === "boolean" ? v ? "t" : "f" : typeof v === "object" ? JSON.stringify(v) : String(v);
        })) });
      }
      return Response.json({ results });
    };
    const keys = await generateKeyPair("RS256");
    const identity = createIdentityVerifier(environment, createLocalJWKSet({ keys: [{ ...(await exportJWK(keys.publicKey)), kid: "native" }] }));
    const token = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "native" }).setIssuer(issuer).setAudience(issuer)
      .setSubject("operator").setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
    const database = createDatabase(environment, undefined, entry => { logs.push(entry); });
    const handler = createFinancialHandler({ environment, identity, database, diagnostic: () => {} });
    async function request(operation: string, scope = workspace, body?: unknown, authenticated = true) {
      const res = { statusCode: 0, body: "", setHeader() {}, end(value?: string) { this.body = value ?? ""; } };
      await handler({ method: body ? "POST" : "GET", url: `/api/financial/${operation}`, body,
        headers: { "x-workspace-id": scope, ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { "content-type": "application/json" } : {}) } }, res);
      return res;
    }
    await t.test("missing JWT never reaches SQL; authorized empty base returns dataset:null", async () => {
      assert.equal((await request("active", workspace, undefined, false)).statusCode, 401);
      assert.equal(calls, 0);
      const res = await request("active");
      assert.equal(res.statusCode, 200, JSON.stringify(logs));
      assert.deepEqual(JSON.parse(res.body), { dataset: null });
      assert.equal(sequences.length, 3); // authorization, repository gate, actual load + revision
      assert.ok(sequences.every(q => q[2] === "SELECT biosaude.require_permission($1,$2,$3,$4)"));
      assert.ok(sequences.at(-1)!.some(q => q.includes("FROM biosaude.active_datasets")));
      assert.deepEqual(logs, []);
    });
    await t.test("validate uses the same authorized Serializable batch without importing records", async () => {
      const source = await readWorkbook(Uint8Array.from(await fixture()).buffer);
      const res = await request("validate", workspace, { source, mappings: suggestMappings(source), reference: "2026-10-19", filename: "SYNTHETIC.xlsx" });
      assert.equal(res.statusCode, 200, JSON.stringify(logs));
      assert.equal(JSON.parse(res.body).recordCount, 6);
      assert.equal(sql("SELECT count(*) FROM biosaude.import_versions"), "0");
    });
    await t.test("bound values remain literal and workspace context is not carried to another batch", async () => {
      const value = "Synthetic'; SELECT 1; -- \\ literal";
      const [rows] = await database.transaction(workspace, [{ text: "SELECT $1::text AS value", values: [value] }]);
      assert.deepEqual(rows, [{ value }]);
      assert.equal(sql("SELECT count(*) FROM biosaude.workspaces", runtime), "0");
      assert.equal((await request("active", other)).statusCode, 403);
      assert.equal(logs.at(-1)?.category, "sql_permission_denied");
    });
    await t.test("actual SDK wraps nested fetch cause; diagnostic recognizes it without raw messages", async () => {
      failTransport = true;
      assert.equal((await request("active")).statusCode, 503);
      assert.equal(logs.at(-1)?.category, "connection_failed");
      assert.equal(logs.at(-1)?.sqlStateRecognized, false);
      failTransport = false;
    });
    await t.test("unsafe runtime aborts the batch and leaves financial tables empty", async () => {
      sql(`GRANT CREATE ON SCHEMA biosaude TO ${runtime}`);
      assert.equal((await request("active")).statusCode, 503);
      assert.equal(logs.at(-1)?.category, "runtime_security_rejected");
      assert.equal(sql("SELECT count(*) FROM biosaude.import_versions"), "0");
    });
  } finally {
    neonConfig.fetchFunction = previous;
    try { docker(["rm", "--force", container]); } catch { /* Container may not have started. */ }
  }
});
