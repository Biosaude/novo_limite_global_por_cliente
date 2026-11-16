import { ServerError } from "../errors.js";

const sqlCategories: Readonly<Record<string, string>> = {
  "28P01": "db_auth_failed", "28000": "db_auth_failed",
  "3D000": "database_missing", "42501": "sql_permission_denied",
  "42P01": "relation_missing", "42883": "function_missing",
  "42601": "sql_syntax_error", "40001": "serialization_conflict",
  "57014": "query_cancelled", "57P01": "connection_terminated",
  "0A000": "feature_not_supported", "25P02": "transaction_aborted",
  "25006": "read_only_violation", "22023": "invalid_parameter",
  "42P02": "undefined_parameter", "26000": "prepared_statement_missing",
  P0002: "version_not_found", PBR01: "runtime_security_rejected",
};
const configurationCategories: Readonly<Record<string, string>> = {
  DATABASE_URL_MISSING: "database_url_missing",
  DATABASE_URL_INVALID: "database_url_invalid",
  PUBLIC_DATABASE_URL_FORBIDDEN: "public_database_url_forbidden",
};
const transportCategories: Readonly<Record<string, string>> = {
  ENOTFOUND: "dns_resolution_failed", EAI_AGAIN: "dns_resolution_failed",
  ECONNREFUSED: "connection_failed", ECONNRESET: "connection_failed",
  EHOSTUNREACH: "connection_failed", ENETUNREACH: "connection_failed",
  UND_ERR_SOCKET: "connection_failed", ETIMEDOUT: "connection_timeout",
  UND_ERR_CONNECT_TIMEOUT: "connection_timeout", UND_ERR_HEADERS_TIMEOUT: "connection_timeout",
  UND_ERR_BODY_TIMEOUT: "connection_timeout", CERT_HAS_EXPIRED: "tls_failed",
  DEPTH_ZERO_SELF_SIGNED_CERT: "tls_failed", UNABLE_TO_VERIFY_LEAF_SIGNATURE: "tls_failed",
  ERR_TLS_CERT_ALTNAME_INVALID: "tls_failed",
};
/** Read data properties only: driver errors may have private/throwing accessors. */
function ownValue(value: unknown, key: string): unknown {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return;
  try { return Object.getOwnPropertyDescriptor(value, key)?.value; } catch { return; }
}
/** Bounded breadth-first traversal. Never read messages, stacks or request data. */
function errorChain(error: unknown): unknown[] {
  const queue = [{ value: error, depth: 0 }], seen = new Set<unknown>(), result: unknown[] = [];
  for (let i = 0; i < queue.length && i < 32; i++) {
    const { value, depth } = queue[i];
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value); result.push(value);
    if (depth >= 8) continue;
    const append = (child: unknown) => {
      if (child && typeof child === "object" && queue.length < 32) queue.push({ value: child, depth: depth + 1 });
    };
    append(ownValue(value, "sourceError"));
    append(ownValue(value, "cause"));
    const errors = ownValue(value, "errors");
    try { if (Array.isArray(errors)) for (let n = 0; n < Math.min(errors.length, 8); n++) append(ownValue(errors, String(n))); }
    catch { /* A revoked proxy is not diagnostic evidence. */ }
  }
  return result;
}
function sqlCategory(code: unknown): string | undefined {
  if (typeof code !== "string") return;
  return Object.hasOwn(sqlCategories, code) ? sqlCategories[code]
    : /^08[0-9A-Z]{3}$/.test(code) ? "connection_failed" : undefined;
}
/** Return only a recognized SQLSTATE; shared by diagnostics and public error mapping. */
export function databaseErrorCode(error: unknown): string | undefined {
  for (const value of errorChain(error)) {
    const code = ownValue(value, "code");
    if (sqlCategory(code)) return code as string;
  }
}
function transportCategory(chain: unknown[]): string | undefined {
  for (const value of chain) {
    const code = ownValue(value, "code");
    if (typeof code === "string" && Object.hasOwn(transportCategories, code)) return transportCategories[code];
  }
  for (const value of chain) {
    let name = ownValue(value, "name");
    try {
      // Use the native accessor directly, never an accessor supplied by the error.
      if (value instanceof DOMException) name = Object.getOwnPropertyDescriptor(DOMException.prototype, "name")?.get?.call(value);
      if (name === "TimeoutError" || name === "AbortError") return "connection_timeout";
    } catch { /* Ignore invalid native error wrappers. */ }
  }
  for (const value of chain) {
    try { if (value instanceof TypeError) return "transport_failed"; } catch { /* Ignore hostile proxies. */ }
  }
}
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
  const category = sqlCategory(databaseErrorCode(error));
  const configurationCategory = error instanceof ServerError && Object.hasOwn(configurationCategories, error.code)
    ? configurationCategories[error.code] : undefined;
  return { event: "FINANCIAL_DATABASE_FAILURE", phase,
    category: configurationCategory ?? category ?? transportCategory(errorChain(error)) ?? "other_driver_failure",
    sqlStateRecognized: category !== undefined };
}
