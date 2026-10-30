import { test } from "node:test";
import assert from "node:assert/strict";
import { getDiagnostic, type FinancialGetDiagnostic } from "../server/financial/get-diagnostics.js";
const secret = "private-synthetic-marker";
const base = { method: "GET", url: "/api/financial/active", headers: {} };
test("GET diagnóstico: apenas metadados fixos, sem parâmetros, corpos, IDs ou credenciais", () => {
  const records: FinancialGetDiagnostic[] = [];
  const trace = getDiagnostic({ ...base, url: `/api/financial/active?unknown=${secret}`,
    query: { operation: secret, secret }, headers: { authorization: `Bearer ${secret}`, cookie: secret,
      "x-workspace-id": secret, "content-length": secret, "transfer-encoding": secret } }, entry => records.push(entry));
  trace.phase("body"); trace.body({ email: secret, token: secret, amount: secret }); trace.reject("body_nonempty"); trace.finish(400);
  assert.equal(records.length, 1);
  assert.equal(records[0].validation, "body_nonempty"); assert.equal(records[0].bodyKind, "object_nonempty");
  assert.equal(records[0].query, "other"); assert.equal(records[0].contentLength, "invalid");
  assert.equal(records[0].runtimeOperation, "different"); assert.ok(!JSON.stringify(records).includes(secret));
  assert.deepEqual(Object.keys(records[0]).sort(), ["event", "status", "phase", "validation", "bodyKind", "contentLength", "contentType", "workspaceHeader", "transferEncoding", "query", "operationMatches", "runtimeOperation", "elapsedMs", "identityMs", "authorizationMs", "loadMs"].sort());
});
test("GET diagnóstico: 31 segundos são separados por etapa, não atribuídos por suposição", () => {
  let now = 0; const records: FinancialGetDiagnostic[] = [];
  const trace = getDiagnostic(base, entry => records.push(entry), () => now);
  trace.phase("identity"); now = 5000; trace.phase("validation"); trace.phase("authorization");
  now = 31000; trace.phase("body"); trace.body({}); trace.reject("body_nonempty"); trace.finish(400);
  assert.equal(records[0].identityMs, 5000); assert.equal(records[0].authorizationMs, 26000);
  assert.equal(records[0].elapsedMs, 31000); assert.equal(records[0].loadMs, 0); assert.equal(records[0].phase, "body");
});
test("GET diagnóstico: distingue operação inserida na URL de metadado req.query", () => {
  for (const [url, query, kind, matches, runtime] of [
    ["/api/financial/active", { operation: "active" }, "none", false, "matches"],
    ["/api/financial/active?operation=active", { operation: "active" }, "operation_only", true, "matches"],
    ["/api/financial/active?operation=other", { operation: ["other", "active"] }, "operation_only", false, "multiple"],
  ] as const) {
    let entry: FinancialGetDiagnostic | undefined;
    getDiagnostic({ ...base, url, query }, value => { entry = value; }).finish(400);
    assert.equal(entry?.query, kind); assert.equal(entry?.operationMatches, matches); assert.equal(entry?.runtimeOperation, runtime);
  }
});
test("GET diagnóstico: nenhuma avaliação de corpo em outras operações e falha do logger é isolada", () => {
  let calls = 0;
  for (const req of [{ ...base, method: "POST" }, { ...base, url: "/api/financial/versions" }]) {
    const trace = getDiagnostic(req, () => { calls++; }); trace.body(new Proxy({}, { ownKeys() { throw Error(secret); } })); trace.finish(400);
  }
  assert.equal(calls, 0);
  const trace = getDiagnostic(base, () => { throw Error(secret); });
  trace.body(new Proxy({}, { ownKeys() { throw Error(secret); } }));
  assert.doesNotThrow(() => trace.finish(400));
});
