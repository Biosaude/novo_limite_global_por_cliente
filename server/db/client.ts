import { Client, neon } from "@neondatabase/serverless";
import {
  assertServerOnly,
  readDatabaseUrl,
  type ServerEnvironment,
} from "../config.js";
import { corporatePreviewEnabled } from "../corporate/auth.server.js";
import { ServerError } from "../errors.js";
import { databaseDiagnostic, databaseErrorCode, logDatabaseDiagnostic, type DatabaseDiagnosticLogger } from "./diagnostics.js";
export interface Statement {
  text: string;
  values?: readonly (string | number | boolean | null)[];
}
export type Row = Record<string, unknown>;
export interface Driver {
  transaction(statements: readonly Statement[]): Promise<Row[][]>;
}
export type DriverFactory = (url: string) => Driver;
/** Executed in the same transaction, before any application SQL. A URL username
 * alone cannot establish the privileges of the actual authenticated session.
 * PBR01 distinguishes unsafe server configuration from require_permission's 42501. */
function runtimeCheck(role: "biosaude_runtime_prod" | "biosaude_runtime_preview") {
  const production = role === "biosaude_runtime_prod";
  return `DO $runtime$
BEGIN
  IF session_user <> '${role}' OR current_user <> session_user
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user
       AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
       AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname=session_user)
     OR pg_catalog.has_schema_privilege(current_user,'biosaude','CREATE')
     OR pg_catalog.has_table_privilege(current_user,'biosaude.identity_memberships','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
     OR pg_catalog.has_table_privilege(current_user,'biosaude.schema_migrations','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='biosaude' AND c.relkind IN ('r','p')
       AND pg_catalog.has_table_privilege(current_user,c.oid,'TRUNCATE,TRIGGER'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
       WHERE n.nspname='biosaude' AND r.rolname=session_user)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
       WHERE n.nspname='biosaude' AND r.rolname=session_user)
     OR (SELECT count(*) FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='biosaude' AND c.relkind IN ('r','p')
       AND c.relname <> 'schema_migrations' AND c.relrowsecurity AND c.relforcerowsecurity) <> 20
     ${production ? `OR (SELECT count(*) FROM pg_catalog.pg_policies
       WHERE schemaname='biosaude' AND policyname='production_login_boundary'
       AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['public']::name[]) <> 20` : ""}
  THEN RAISE EXCEPTION 'Unsafe financial runtime' USING ERRCODE='PBR01';
  END IF;
END $runtime$`;
}
export const PRODUCTION_RUNTIME_CHECK = runtimeCheck("biosaude_runtime_prod");
export const PREVIEW_RUNTIME_CHECK = runtimeCheck("biosaude_runtime_preview");
export interface ScopedDatabase {
  transaction(
    workspaceId: string,
    statements: readonly Statement[],
  ): Promise<Row[][]>;
}
const neonFactory: DriverFactory = (url) => {
  const sql = neon(url);
  return {
    async transaction(statements) {
      return (await sql.transaction(
        statements.map((s) => sql.query(s.text, [...(s.values ?? [])])),
        { isolationLevel: "Serializable" },
      )) as Row[][];
    },
  };
};
/** Production uses a dedicated WebSocket PostgreSQL session per transaction.
 * A one-shot HTTP batch can fail before a usable SQLSTATE reaches the serverless
 * driver. We never replay a transaction on transport failure: a write may have
 * committed before the response was lost.
 */
const websocketFactory: DriverFactory = (url) => ({
  async transaction(statements) {
    const client = new Client({ connectionString: url });
    let connected = false;
    let begun = false;
    try {
      await client.connect();
      connected = true;
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      begun = true;
      const rows: Row[][] = [];
      for (const statement of statements) {
        const result = await client.query(statement.text, [...(statement.values ?? [])]);
        rows.push(result.rows as Row[]);
      }
      await client.query("COMMIT");
      begun = false;
      return rows;
    } catch (error) {
      if (begun) {
        try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      }
      throw error;
    } finally {
      if (connected) {
        try { await client.end(); } catch { /* Never replace the outcome. */ }
      }
    }
  },
});
/** Preguiçoso: importar/criar o módulo não lê a URL, abre conexão ou executa SQL. */
export function createDatabase(
  environment?: ServerEnvironment,
  factory?: DriverFactory,
  log: DatabaseDiagnosticLogger = logDatabaseDiagnostic,
): ScopedDatabase {
  assertServerOnly();
  let driver: Driver | undefined;
  return {
    async transaction(workspaceId, statements) {
      assertServerOnly();
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          workspaceId,
        )
      )
        throw new ServerError(
          "WORKSPACE_INVALID",
          "Contexto de persistência inválido.",
          403,
        );
      let phase: "configuration" | "transaction" = "configuration";
      try {
        const url = driver ? undefined : readDatabaseUrl(environment);
        // Opt-in only: existing HTTP deployments retain their established transport.
        // WebSocket is enabled explicitly for an isolated Production rollout.
        const transport = (environment ?? process.env).FINANCIAL_DB_TRANSPORT;
        driver ??= (factory ?? (transport === "websocket" ? websocketFactory : neonFactory))(url!);
        phase = "transaction";
        const env = environment ?? process.env;
        const check = env.VERCEL_ENV === "production" ? PRODUCTION_RUNTIME_CHECK
          : corporatePreviewEnabled(env) ? PREVIEW_RUNTIME_CHECK : undefined;
        const checks: Statement[] = check ? [{ text: check }] : [];
        const result = await driver.transaction([
          ...checks,
          {
            text: "SELECT set_config('biosaude.workspace_id', $1, true)",
            values: [workspaceId],
          },
          ...statements,
        ]);
        return result.slice(checks.length + 1);
      } catch (error) {
        const code = databaseErrorCode(error);
        if (["production", "preview", "development"].includes((environment ?? process.env).VERCEL_ENV ?? "")) {
          try { log(databaseDiagnostic(error, phase)); } catch { /* Logging must not alter authorization or rollback. */ }
        }
        if (error instanceof ServerError) throw error;
        if (code === "PBR01")
          throw new ServerError("DATABASE_RUNTIME_UNSAFE", "Configuração de execução indisponível.");
        if (code === "40001")
          throw new ServerError(
            "REVISION_CONFLICT",
            "A versão foi alterada; consulte novamente.",
            409,
          );
        if (code === "P0002")
          throw new ServerError(
            "VERSION_NOT_FOUND",
            "Versão não encontrada.",
            404,
          );
        if (code === "42501")
          throw new ServerError(
            "ACCESS_DENIED",
            "Acesso remoto não autorizado.",
            403,
          );
        throw new ServerError(
          "DATABASE_OPERATION_FAILED",
          "Não foi possível concluir a operação de persistência. Nenhum detalhe de conexão é exposto.",
        );
      }
    },
  };
}

export const CONNECTIVITY_SQL = "SELECT 1 AS ok";
export const CONNECTIVITY_TIMEOUT_MS = 5000;
/** Sonda restrita: não recebe SQL, organização, dados ou parâmetros da requisição. */
export async function checkReadOnlyConnectivity(
  environment?: ServerEnvironment,
): Promise<void> {
  assertServerOnly();
  const url = readDatabaseUrl(environment);
  try {
    const sql = neon(url);
    const result = await sql.transaction([sql.query(CONNECTIVITY_SQL)], {
      readOnly: true,
      isolationLevel: "ReadCommitted",
      fetchOptions: { signal: AbortSignal.timeout(CONNECTIVITY_TIMEOUT_MS) },
    });
    if (result.length !== 1 || result[0].length !== 1 || result[0][0]?.ok !== 1)
      throw new Error();
  } catch {
    throw new ServerError(
      "CONNECTIVITY_UNAVAILABLE",
      "Não foi possível validar a conectividade de leitura.",
    );
  }
}
