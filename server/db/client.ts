import { neon } from "@neondatabase/serverless";
import {
  assertServerOnly,
  readDatabaseUrl,
  type ServerEnvironment,
} from "../config";
import { ServerError } from "../errors";
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
      } catch {
        throw new ServerError(
          "DATABASE_OPERATION_FAILED",
          "Não foi possível concluir a operação de persistência. Nenhum detalhe de conexão é exposto.",
        );
      }
    },
  };
}
