import assert from "node:assert/strict";
import { test } from "node:test";
import { readDatabaseUrl } from "../server/config.js";
import { bindFinancialIdentity, createCorporateHandler } from "../server/corporate/http.js";
import { corporatePreviewEnabled } from "../server/corporate/auth.server.js";
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
  const production = { ...env, VERCEL_ENV: "production", GLOBAL_LIMIT_PRODUCTION_ORIGIN: env.GLOBAL_LIMIT_PREVIEW_ORIGIN,
    FINANCIAL_AUTH_ISSUER: identity.issuer, GLOBAL_LIMIT_PRODUCTION_IDENTITY_BINDINGS: env.GLOBAL_LIMIT_PREVIEW_IDENTITY_BINDINGS };
  await bindFinancialIdentity(req, production, identity, granted);
  await assert.rejects(bindFinancialIdentity(req, production, identity, async () => null), { code: "UNAUTHENTICATED" });
  await assert.rejects(bindFinancialIdentity(req, production, identity, async () => {
    throw new CorporateAccessError("corporate_denied");
  }), { code: "ACCESS_DENIED" });
  await assert.rejects(bindFinancialIdentity(req, { ...production, GLOBAL_LIMIT_PRODUCTION_IDENTITY_BINDINGS: undefined }, identity, granted),
    { code: "CORPORATE_UNAVAILABLE" });
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

test("Preview hospedado mantém as APIs protegidas e encaminha a entrada do deployment ao alias", async () => {
  const deployment = "limit-deploy.vercel.app";
  const config = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: deployment, GLOBAL_LIMIT_PREVIEW_ORIGIN: env.GLOBAL_LIMIT_PREVIEW_ORIGIN };
  assert.equal(corporatePreviewEnabled(config), true);
  const serve = createCorporateHandler(config);
  const response = () => ({
    statusCode: 0, headers: new Map<string,string>(), body: "",
    setHeader(name: string, value: string) { this.headers.set(name, value); },
    end(body = "") { this.body = body; },
  });
  const login = response();
  await serve({ method: "GET", url: "/api/corporate-auth/login?next=https://other.invalid", headers: { host: deployment } }, login);
  assert.equal(login.statusCode, 303);
  assert.equal(login.headers.get("Location"), config.GLOBAL_LIMIT_PREVIEW_ORIGIN + "/");
  assert.equal(login.headers.has("Set-Cookie"), false);
  const status = response();
  await serve({ method: "GET", url: "/api/corporate-auth/status", headers: { host: deployment } }, status);
  assert.equal(status.statusCode, 403);
  assert.equal(JSON.parse(status.body).canonicalOrigin, config.GLOBAL_LIMIT_PREVIEW_ORIGIN);
  const callback = response();
  await serve({ method: "GET", url: "/api/corporate-auth/callback?code=fixture", headers: { host: deployment } }, callback);
  assert.equal(callback.statusCode, 403);
  const data = { ...req, headers: { host: deployment } };
  await assert.rejects(bindFinancialIdentity(data, config, identity, async () => {
    assert.fail("uma URL individual não deve consultar autorização");
  }), { code: "ACCESS_DENIED" });
});
