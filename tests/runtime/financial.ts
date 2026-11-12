/** Only for the offline official-builder harness; never an API entry in the repository. */
import { PGlite } from "@electric-sql/pglite";
import { createLocalJWKSet } from "jose";
import { createIdentityVerifier } from "../../server/security/identity.js";
import { migrationPlan } from "../../server/db/migration-plan.js";
import { createFinancialHandler, type FinancialRequest, type FinancialResponse } from "../../server/financial/handler.js";
import type { Row, ScopedDatabase } from "../../server/db/client.js";
const workspace = "50000000-0000-4000-8000-000000000001";
const issuer = "https://runtime.synthetic.invalid/";
const environment = { VERCEL_ENV: "preview", FINANCIAL_API_ENABLED: "true", FINANCIAL_AUTH_ISSUER: issuer,
  FINANCIAL_AUTH_AUDIENCE: "runtime-test", FINANCIAL_AUTH_JWKS_URL: issuer + "jwks" };
const pg = new PGlite();
for (const migration of await migrationPlan()) await pg.exec(migration.sql);
await pg.exec("CREATE ROLE api_runtime_test NOSUPERUSER NOBYPASSRLS NOLOGIN; GRANT USAGE ON SCHEMA biosaude TO api_runtime_test; GRANT SELECT ON ALL TABLES IN SCHEMA biosaude TO api_runtime_test; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA biosaude TO api_runtime_test");
await pg.query("INSERT INTO biosaude.workspaces(id,name) VALUES($1,'Synthetic runtime')", [workspace]);
await pg.query("INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,permissions,provisioned_by) VALUES($1,$2,'runtime-user',$3,'synthetic-test')", [workspace, issuer, ["datasets:read", "credit:read"]]);
const identity = createIdentityVerifier(environment, createLocalJWKSet(JSON.parse(process.env.FINANCIAL_TEST_PUBLIC_JWKS!)));
const database: ScopedDatabase = {
  async transaction(scope, statements) {
    return pg.transaction(async tx => {
      await tx.exec("SET LOCAL ROLE api_runtime_test");
      await tx.query("SELECT set_config('biosaude.workspace_id',$1,true)", [scope]);
      const rows: Row[][] = [];
      for (const statement of statements) rows.push((await tx.query(statement.text, [...(statement.values ?? [])])).rows as Row[]);
      return rows;
    });
  },
};
export default async function runtime(req: FinancialRequest, res: FinancialResponse) {
  // Safe metadata headers exist in this temporary test fixture only.
  const handler = createFinancialHandler({ environment, identity, database, diagnostic(entry) {
    res.setHeader("X-Test-Validation", entry.validation);
    res.setHeader("X-Test-Body", entry.bodyKind);
    res.setHeader("X-Test-Query", entry.query);
    res.setHeader("X-Test-Elapsed", String(entry.elapsedMs));
    res.setHeader("X-Test-Identity", String(entry.identityMs));
    res.setHeader("X-Test-Authorization", String(entry.authorizationMs));
    res.setHeader("X-Test-Load", String(entry.loadMs));
  } });
  return handler(req, res);
}
