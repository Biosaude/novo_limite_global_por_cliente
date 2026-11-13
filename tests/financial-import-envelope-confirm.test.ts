import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { decodeImportEnvelope } from "../server/financial/payload.js";

test("a confirmação de importações compactadas é conferida após a descompressão", () => {
  const json = JSON.stringify({ source: { sheets: [] }, confirm: true });
  const wrapped = {
    __biosaude_transport: "gzip-base64-v1",
    data: gzipSync(json).toString("base64"),
  };
  const decoded = decodeImportEnvelope(wrapped);
  assert.equal((decoded as { confirm: boolean }).confirm, true);
  assert.equal(Object.hasOwn(wrapped, "confirm"), false);
});
test("o envelope não substitui a confirmação explícita", () => {
  const wrapped = {
    __biosaude_transport: "gzip-base64-v1",
    data: gzipSync(JSON.stringify({ confirm: false })).toString("base64"),
  };
  const decoded = decodeImportEnvelope(wrapped);
  assert.equal((decoded as { confirm: boolean }).confirm, false);
});
