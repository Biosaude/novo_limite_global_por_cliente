import { test } from "node:test";
import assert from "node:assert/strict";
import { FinancialHttpClient } from "../src/persistencia/http.js";

const workspace = "fa76845b-235f-48fc-a609-81134636f5b5";
function response(etag: string, revision?: string) {
  return new Response(JSON.stringify({ dataset: null }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "etag": etag,
      ...(revision ? { "x-biosaude-revision": revision } : {}),
    },
  });
}
test("GET normaliza ETag enfraquecido pela Vercel e envia If-Match forte", async () => {
  const seen: string[] = [];
  const send = async (_url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push(headers.get("if-match") ?? "");
    return response('W/"3"', "3");
  };
  const client = new FinancialHttpClient({ workspace, active: () => true, token: async () => "synthetic", send: send as typeof fetch });
  await client.request("active");
  await client.request("active", "PUT", { versionId: "synthetic" });
  assert.deepEqual(seen, ["", '"3"']);
});
test("GET legado aceita W/ sem cabeçalho auxiliar", async () => {
  const client = new FinancialHttpClient({ workspace, active: () => true, token: async () => "synthetic", send: async (_url, init) => {
    if (init?.method === "DELETE") assert.equal(new Headers(init.headers).get("if-match"), '"3"');
    return response('W/"3"');
  } });
  assert.deepEqual(await client.request("active"), { dataset: null });
  await client.request("active", "DELETE");
});

test("revisão: cabeçalhos presentes inválidos não são ignorados e não habilitam escrita", async () => {
  for (const [etag, revision] of [['W/"invalid"', "3"], ['"3"', "invalid"], ['"03"', "3"], ['"9007199254740992"', undefined]]) {
    let calls = 0;
    const client = new FinancialHttpClient({ workspace, active: () => true, token: async () => "synthetic", send: async () => { calls++; return response(etag!, revision); } });
    await assert.rejects(client.request("active"), { code: "UNAVAILABLE" });
    await assert.rejects(client.request("active", "DELETE"), { code: "PRECONDITION_REQUIRED" });
    assert.equal(calls, 1);
  }
});

test("revisão: alteração após ETag fraco bloqueia escrita sem retry", async () => {
  let calls = 0;
  const client = new FinancialHttpClient({ workspace, active: () => true, token: async () => "synthetic", send: async () => response(`W/"${calls++}"`) });
  await client.request("active");
  await assert.rejects(client.request("versions"), { code: "REVISION_CONFLICT" });
  await assert.rejects(client.request("active", "DELETE"), { code: "REVISION_CONFLICT" });
  assert.equal(calls, 2);
});
test("resposta divergente entre ETag e revisão é rejeitada", async () => {
  const client = new FinancialHttpClient({ workspace, active: () => true, token: async () => "synthetic", send: async () => response('W/"3"', "4") });
  await assert.rejects(client.request("active"), { code: "UNAVAILABLE" });
});
