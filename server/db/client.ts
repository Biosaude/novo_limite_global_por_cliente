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
        const result = await driver.transaction([
          {
            text: "SELECT set_config('biosaude.workspace_id', $1, true)",
            values: [workspaceId],
          },
          ...statements,
        ]);
        return result.slice(1);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
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
