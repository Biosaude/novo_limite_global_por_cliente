import { ServerError } from "../errors.js";

const sqlCategories: Readonly<Record<string, string>> = {
  "28P01": "db_auth_failed", "28000": "db_auth_failed",
  "3D000": "database_missing", "42501": "sql_permission_denied",
  "42P01": "relation_missing", "42883": "function_missing",
  "42601": "sql_syntax_error", "40001": "serialization_conflict",
  "57014": "query_cancelled", "57P01": "connection_terminated",
  PBR01: "runtime_security_rejected",
};
const configurationCategories: Readonly<Record<string, string>> = {
  DATABASE_URL_MISSING: "database_url_missing",
  DATABASE_URL_INVALID: "database_url_invalid",
  PUBLIC_DATABASE_URL_FORBIDDEN: "public_database_url_forbidden",
};
export interface DatabaseDiagnostic {
  event: "FINANCIAL_DATABASE_FAILURE";
  phase: "configuration" | "transaction";
  category: string;
  sqlStateRecognized: boolean;
}
export type DatabaseDiagnosticLogger = (entry: DatabaseDiagnostic) => void;
export const logDatabaseDiagnostic: DatabaseDiagnosticLogger = entry => {
  console.warn(JSON.stringify(entry));
};
/** Closed vocabulary only: no messages, SQL, parameters, URLs or identifiers. */
export function databaseDiagnostic(error: unknown, phase: DatabaseDiagnostic["phase"]): DatabaseDiagnostic {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const sqlCategory = typeof code === "string" && Object.hasOwn(sqlCategories, code)
    ? sqlCategories[code] : typeof code === "string" && /^08[0-9A-Z]{3}$/.test(code)
      ? "connection_failed" : undefined;
  const configurationCategory = error instanceof ServerError && Object.hasOwn(configurationCategories, error.code)
    ? configurationCategories[error.code] : undefined;
  // Neon wraps fetch errors in sourceError; never inspect or copy their message.
  const source = error && typeof error === "object" && "sourceError" in error ? error.sourceError : error;
  const timeout = source instanceof Error && ["TimeoutError", "AbortError"].includes(source.name);
  const transport = source instanceof TypeError;
  return { event: "FINANCIAL_DATABASE_FAILURE", phase,
    category: configurationCategory ?? sqlCategory ?? (timeout ? "connection_timeout" : transport ? "transport_failed" : "other_driver_failure"),
    sqlStateRecognized: sqlCategory !== undefined };
}
