import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeImportEnvelope, encodeFinancialResponse } from "../server/financial/payload.js";
import { encodeLargeRequest, decodeLargeResponse } from "../src/persistencia/http.js";

test("compactação: preserva dados UTF-8 e conteúdo financeiro sem aproximação", () => {
  const obj = { source: { text: "Crédito São Luís", rows: Array.from({ length: 130000 }, (_, i) => ({ id: i, value: "R$ 1.234,56" })) } };
  const raw = JSON.stringify(obj);
  assert.ok(Buffer.byteLength(raw, "utf8") > 3_000_000);
  const request = encodeLargeRequest(raw);
  assert.ok(Buffer.byteLength(request, "utf8") <= 3_000_000);
  assert.deepEqual(decodeImportEnvelope(JSON.parse(request)), obj);
});
test("compactação: resposta preserva dados, revisão e contrato JSON", () => {
  const obj = { dataset: { content: "Ó".repeat(1_500_000) } };
  const wrapped = encodeFinancialResponse(obj);
  assert.deepEqual(decodeLargeResponse(wrapped), obj);
});
test("compactação: entrada inválida é rejeitada sem normalização silenciosa", () => {
  for (const value of [
    { __biosaude_transport: "gzip-base64-v1", data: "%notbase64" },
    { __biosaude_transport: "gzip-base64-v1", data: "", unexpected: true },
    { __biosaude_transport: "unsupported", data: "AA==" },
  ]) assert.throws(() => decodeImportEnvelope(value));
});
test("compactação: resposta pequena permanece no formato anterior", () => {
  const obj = { dataset: null };
  assert.equal(encodeFinancialResponse(obj), obj);
  assert.equal(decodeLargeResponse(obj), obj);
});
