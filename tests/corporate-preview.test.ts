import assert from "node:assert/strict";
import { test } from "node:test";
import { readDatabaseUrl } from "../server/config.js";
import { bindFinancialIdentity } from "../server/corporate/http.js";
import { CorporateAccessError } from "../server/corporate/access.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const identity = { issuer: "https://synthetic.neon.tech", subject: "synthetic-neon-subject", actor: "synthetic" };
const req = { method: "GET", url: "/api/financial/active", headers: { host: "global-preview.example.invalid" } };
const env = {
  VERCEL_ENV: "preview", GLOBAL_LIMIT_AUTH_MODE: "preview",
  GLOBAL_LIMIT_PREVIEW_ORIGIN: "https://global-preview.example.invalid",
  GLOBAL_LIMIT_PREVIEW_AUTH_ISSUER: identity.issuer,
  GLOBAL_LIMIT_PREVIEW_IDENTITY_BINDINGS: JSON.stringify([{ tenantId, objectId, subject: identity.subject }]),
};

test("aceita apenas uma concessão Entra ligada ao sub do JWT Neon verificado", async () => {
  const granted = async () => ({ tenantId, objectId });
  await bindFinancialIdentity(req, env, identity, granted);
  await assert.rejects(bindFinancialIdentity(req, env, { ...identity, subject: "other" }, granted), { code: "ACCESS_DENIED" });
  await assert.rejects(bindFinancialIdentity(req, env, { ...identity, issuer: "https://other.neon.tech" }, granted), { code: "ACCESS_DENIED" });
  await assert.rejects(bindFinancialIdentity(req, env, identity, async () => null), { code: "UNAUTHENTICATED" });
  await assert.rejects(bindFinancialIdentity(req, env, identity, async () => { throw new CorporateAccessError("corporate_denied"); }), { code: "ACCESS_DENIED" });
  await assert.rejects(bindFinancialIdentity(req, env, identity, async () => { throw new Error("down"); }), { code: "CORPORATE_UNAVAILABLE" });
  await assert.rejects(bindFinancialIdentity({ ...req, headers: { host: "other.invalid" } }, env, identity, granted), { code: "ACCESS_DENIED" });
  await bindFinancialIdentity(req, { ...env, VERCEL_ENV: "production" }, identity, async () => { throw new Error("unexpected"); });
});

test("conexão usa host isolado, papel dedicado e TLS verify-full", () => {
  const host = "ep-synthetic.c-1.sa-east-1.aws.neon.tech";
  const sample = `postgresql://biosaude_runtime_preview:fixture-only@${host}/neondb?sslmode=verify-full`;
  const config = { ...env, GLOBAL_LIMIT_PREVIEW_NEON_HOST: host, GLOBAL_LIMIT_PREVIEW_DATABASE_URL: sample };
  assert.equal(readDatabaseUrl(config), sample);
  for (const bad of [sample.replace("verify-full", "require"),
    sample.replace("biosaude_runtime_preview", "neondb_owner"),
    sample.replace("ep-synthetic", "ep-other"), sample + "&sslmode=disable"]) {
    assert.throws(() => readDatabaseUrl({ ...config, GLOBAL_LIMIT_PREVIEW_DATABASE_URL: bad }), { code: "DATABASE_URL_INVALID" });
  }
  assert.throws(() => readDatabaseUrl({ ...config, DATABASE_URL: sample }), { code: "DATABASE_URL_INVALID" });
});
