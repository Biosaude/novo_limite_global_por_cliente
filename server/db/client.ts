import { neon } from "@neondatabase/serverless";
import {
  assertServerOnly,
  readDatabaseUrl,
  type ServerEnvironment,
} from "../config.js";
import { ServerError } from "../errors.js";
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
 * alone cannot establish the privileges of the actual authenticated session. */
export const PRODUCTION_RUNTIME_CHECK = `DO $runtime$
BEGIN
  IF session_user <> 'biosaude_runtime_prod' OR current_user <> session_user
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
     OR (SELECT count(*) FROM pg_catalog.pg_policies
       WHERE schemaname='biosaude' AND policyname='production_login_boundary'
       AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['public']::name[]) <> 20
  THEN RAISE EXCEPTION 'Unsafe production runtime' USING ERRCODE='42501';
  END IF;
END $runtime$`;
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
/** Preguiçoso: importar/criar o módulo não lê a URL, abre conexão ou executa SQL. */
export function createDatabase(
  environment?: ServerEnvironment,
  factory: DriverFactory = neonFactory,
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
      const url = driver ? undefined : readDatabaseUrl(environment);
      try {
        driver ??= factory(url!);
        const checks: Statement[] = (environment ?? process.env).VERCEL_ENV === "production"
          ? [{ text: PRODUCTION_RUNTIME_CHECK }] : [];
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
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        // Diagnóstico exclusivamente categórico no Preview: jamais registrar SQL,
        // parâmetros, host, URI, token, mensagem ou stack do driver.
        const category = ({
          "28P01": "db_auth_failed",
          "3D000": "database_missing",
          "42501": "sql_permission_denied",
          "42P01": "relation_missing",
          "42883": "function_missing",
          "40001": "serialization_conflict",
          "08001": "connection_failed",
          "08003": "connection_failed",
          "08006": "connection_failed",
          "57P01": "connection_terminated",
        } as Record<string, string>)[typeof code === "string" ? code : ""] ??
          (typeof code === "string" && code.startsWith("08")
            ? "connection_failed" : "other_driver_failure");
        if (["preview", "development"].includes((environment ?? process.env).VERCEL_ENV ?? "")) {
          console.warn(JSON.stringify({
            event: "FINANCIAL_DATABASE_FAILURE",
            category,
            sqlStateRecognized: category !== "other_driver_failure",
          }));
        }
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
