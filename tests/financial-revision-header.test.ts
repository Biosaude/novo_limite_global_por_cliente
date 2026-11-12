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
  const client = new FinancialHttpClient({ workspace, active: () => true, token: async () => "synthetic", send: async () => response('W/"3"') });
  assert.deepEqual(await client.request("active"), { dataset: null });
});
test("resposta divergente entre ETag e revisão é rejeitada", async () => {
  const client = new FinancialHttpClient({ workspace, active: () => true, token: async () => "synthetic", send: async () => response('W/"3"', "4") });
  await assert.rejects(client.request("active"), { code: "UNAVAILABLE" });
});
