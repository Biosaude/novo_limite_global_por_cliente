import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db/client.js";
import { databaseDiagnostic, type DatabaseDiagnostic } from "../server/db/diagnostics.js";

const workspace = "6aa0ef36-66d5-4b16-8acc-2846586458ec";
const url = "postgresql://biosaude_runtime_prod:NEVER_REAL@ep-synthetic.example.invalid/neondb?sslmode=require";
const environment = { VERCEL_ENV: "production", DATABASE_URL: url };
test("Production: configuration and database failures have categorical diagnostics without secrets", async () => {
  for (const [code, category, publicCode] of [
    ["28P01", "db_auth_failed", "DATABASE_OPERATION_FAILED"],
    ["08006", "connection_failed", "DATABASE_OPERATION_FAILED"],
    ["42P01", "relation_missing", "DATABASE_OPERATION_FAILED"],
    ["42883", "function_missing", "DATABASE_OPERATION_FAILED"],
    ["PBR01", "runtime_security_rejected", "DATABASE_RUNTIME_UNSAFE"],
    ["42501", "sql_permission_denied", "ACCESS_DENIED"],
    ["40001", "serialization_conflict", "REVISION_CONFLICT"],
    [url, "other_driver_failure", "DATABASE_OPERATION_FAILED"],
    ["toString", "other_driver_failure", "DATABASE_OPERATION_FAILED"],
  ]) {
    const logs: DatabaseDiagnostic[] = [];
    const db = createDatabase(environment, () => ({ async transaction() {
      throw Object.assign(new Error(url), { code, query: "private SQL", parameters: [workspace], detail: "private data" });
    } }), entry => { logs.push(entry); });
    await assert.rejects(db.transaction(workspace, []), { code: publicCode });
    assert.deepEqual(logs, [{ event: "FINANCIAL_DATABASE_FAILURE", phase: "transaction", category,
      sqlStateRecognized: category !== "other_driver_failure" }]);
    for (const secret of [url, workspace, "private SQL", "private data", "NEVER_REAL"])
      assert.ok(!JSON.stringify(logs).includes(secret));
  }
  for (const [config, category, code] of [
    [{}, "database_url_missing", "DATABASE_URL_MISSING"],
    [{ DATABASE_URL: "invalid" }, "database_url_invalid", "DATABASE_URL_INVALID"],
    [{ VITE_DATABASE_URL: url }, "public_database_url_forbidden", "PUBLIC_DATABASE_URL_FORBIDDEN"],
  ] as const) {
    const logs: DatabaseDiagnostic[] = [];
    const db = createDatabase({ VERCEL_ENV: "production", ...config }, () => { throw Error("must not open"); }, entry => { logs.push(entry); });
    await assert.rejects(db.transaction(workspace, []), { code });
    assert.deepEqual(logs, [{ event: "FINANCIAL_DATABASE_FAILURE", phase: "configuration", category, sqlStateRecognized: false }]);
  }
});
test("database logging failure cannot change a permission denial into an unavailable API", async () => {
  const db = createDatabase(environment, () => ({ async transaction() { throw { code: "42501" }; } }),
    () => { throw Error("logger failure"); });
  await assert.rejects(db.transaction(workspace, []), { code: "ACCESS_DENIED", status: 403 });
});
test("Neon transport failures and timeouts are classified without copying error messages", () => {
  for (const sourceError of [new TypeError(url), new DOMException(url, "TimeoutError"), new DOMException(url, "AbortError")]) {
    assert.equal(databaseDiagnostic({ sourceError }, "transaction").category,
      sourceError instanceof TypeError ? "transport_failed" : "connection_timeout");
  }
  assert.equal(databaseDiagnostic({ code: "08" + url }, "transaction").category, "other_driver_failure");
});

test("wrapped SQLSTATEs retain the category and application error mapping", async () => {
  for (const [code, category, publicCode, status] of [
    ["42501", "sql_permission_denied", "ACCESS_DENIED", 403],
    ["40001", "serialization_conflict", "REVISION_CONFLICT", 409],
    ["P0002", "version_not_found", "VERSION_NOT_FOUND", 404],
    ["PBR01", "runtime_security_rejected", "DATABASE_RUNTIME_UNSAFE", 503],
    ["28P01", "db_auth_failed", "DATABASE_OPERATION_FAILED", 503],
    ["0A000", "feature_not_supported", "DATABASE_OPERATION_FAILED", 503],
    ["25P02", "transaction_aborted", "DATABASE_OPERATION_FAILED", 503],
  ] as const) {
    for (const wrap of [
      (e: unknown) => ({ sourceError: e }),
      (e: unknown) => new Error("private wrapper", { cause: e }),
      (e: unknown) => ({ code: "UNKNOWN_WRAPPER", sourceError: { cause: e } }),
      (e: unknown) => new AggregateError([new Error("private sibling"), e]),
    ]) {
      const error = wrap(Object.assign(new Error(url), { code, query: "private SQL", parameters: [workspace] }));
      const logs: DatabaseDiagnostic[] = [];
      const db = createDatabase(environment, () => ({ async transaction() { throw error; } }), entry => { logs.push(entry); });
      await assert.rejects(db.transaction(workspace, []), { code: publicCode, status });
      assert.equal(logs[0].category, category);
      assert.equal(logs[0].sqlStateRecognized, true);
      for (const secret of [url, workspace, "private wrapper", "private sibling", "private SQL"])
        assert.ok(!JSON.stringify(logs).includes(secret));
    }
  }
});

test("nested fetch failures recognize only approved transport codes, including plain objects", () => {
  for (const [error, category] of [
    [{ sourceError: new TypeError(url, { cause: { code: "ENOTFOUND" } }) }, "dns_resolution_failed"],
    [new Error(url, { cause: { sourceError: { code: "ECONNRESET" } } }), "connection_failed"],
    [{ sourceError: { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } } }, "connection_timeout"],
    [{ cause: { sourceError: new DOMException(url, "TimeoutError") } }, "connection_timeout"],
    [{ sourceError: { cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } } }, "tls_failed"],
    [{ cause: { code: url, message: "ENOTFOUND 42501" } }, "other_driver_failure"],
  ] as const) {
    const diagnostic = databaseDiagnostic(error, "transaction");
    assert.equal(diagnostic.category, category);
    assert.equal(diagnostic.sqlStateRecognized, false);
    assert.ok(!JSON.stringify(diagnostic).includes(url));
  }
});

test("error traversal is bounded, cycle-safe and never evaluates getters or messages", () => {
  const cycle: { cause?: unknown; sourceError?: unknown } = {};
  cycle.cause = cycle;
  cycle.sourceError = { cause: { code: "42501" } };
  assert.equal(databaseDiagnostic(cycle, "transaction").category, "sql_permission_denied");
  const hostile = Object.defineProperties({}, Object.fromEntries(["code", "message", "cause", "sourceError", "errors"].map(key =>
    [key, { get() { throw Error("must not inspect private accessor"); } }])));
  assert.equal(databaseDiagnostic(hostile, "transaction").category, "other_driver_failure");
  let deep: unknown = { code: "42501" };
  for (let n = 0; n < 100; n++) deep = { cause: deep };
  assert.equal(databaseDiagnostic(deep, "transaction").category, "other_driver_failure");
  assert.equal(databaseDiagnostic({ code: "40001", cause: { code: "42501" } }, "transaction").category, "serialization_conflict");
});
