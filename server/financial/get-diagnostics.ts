import type { FinancialRequest } from "./handler.js";
export type GetPhase = "validation" | "identity" | "authorization" | "body" | "load";
export type GetValidation = "none" | "workspace_header" | "query_unexpected" | "query_duplicate" | "body_nonempty" | "body_framing";
export interface FinancialGetDiagnostic {
  event: "FINANCIAL_GET_DIAGNOSTIC";
  status: number;
  phase: GetPhase;
  validation: GetValidation;
  bodyKind: string;
  contentLength: "absent" | "zero" | "positive" | "invalid";
  contentType: "absent" | "json" | "binary" | "text" | "form" | "other";
  workspaceHeader: "absent" | "string" | "multiple" | "other";
  transferEncoding: boolean;
  query: "none" | "operation_only" | "other";
  operationMatches: boolean;
  runtimeOperation: "absent" | "matches" | "different" | "multiple" | "other";
  elapsedMs: number;
  identityMs: number;
  authorizationMs: number;
  loadMs: number;
}
export type FinancialGetLogger = (entry: FinancialGetDiagnostic) => void;
const defaultLogger: FinancialGetLogger = entry => console.info(JSON.stringify(entry));
/** Fixed metadata vocabulary only. Never copy request values, identifiers or error messages. */
export function getDiagnostic(req: FinancialRequest, log: FinancialGetLogger = defaultLogger, now = () => performance.now()) {
  let url: URL | undefined;
  try { url = new URL(req.url ?? "", "https://request.invalid"); } catch { /* Existing handler decides validity. */ }
  const enabled = req.method === "GET" && url?.pathname === "/api/financial/active";
  const started = now();
  let changed = started, phase: GetPhase = "validation", validation: GetValidation = "none", bodyKind = "not_read";
  const durations = { validation: 0, identity: 0, authorization: 0, body: 0, load: 0 };
  function mark(next: GetPhase) { const time = now(); durations[phase] += time - changed; changed = time; phase = next; }
  return {
    phase: mark,
    reject(reason: GetValidation) { validation = reason; },
    body(value: unknown) {
      if (!enabled) return;
      try {
      bodyKind = value === undefined ? "undefined" : value === null ? "null" :
        Buffer.isBuffer(value) ? value.length === 0 ? "buffer_empty" : "buffer_nonempty" :
        typeof value === "string" ? value === "" ? "string_empty" : "string_nonempty" :
        Array.isArray(value) ? "array" : typeof value === "object" ? Object.keys(value).length === 0 ? "object_empty" : "object_nonempty" :
        typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "other";
      } catch { bodyKind = "other"; }
    },
    finish(status: number) {
      if (!enabled) return;
      try {
        const time = now(); durations[phase] += time - changed; changed = time;
        const length = req.headers["content-length"];
        const type = req.headers["content-type"];
        const workspace = req.headers["x-workspace-id"];
        const query = url!.searchParams;
        const keys = [...query.keys()];
        const rawQuery = req.query;
        const operation = rawQuery && typeof rawQuery === "object" && "operation" in rawQuery ? rawQuery.operation : undefined;
        const round = (value: number) => Math.max(0, Math.round(value));
        const entry: FinancialGetDiagnostic = { event: "FINANCIAL_GET_DIAGNOSTIC", status, phase, validation, bodyKind,
          contentLength: length === undefined ? "absent" : length === "0" ? "zero" : typeof length === "string" && /^[1-9][0-9]*$/.test(length) ? "positive" : "invalid",
          contentType: type === undefined ? "absent" : typeof type !== "string" ? "other" : /^application\/json(?:\s*;|$)/i.test(type) ? "json" : /^application\/octet-stream(?:\s*;|$)/i.test(type) ? "binary" : /^text\/plain(?:\s*;|$)/i.test(type) ? "text" : /^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(type) ? "form" : "other",
          workspaceHeader: workspace === undefined ? "absent" : Array.isArray(workspace) ? "multiple" : typeof workspace === "string" ? "string" : "other",
          transferEncoding: req.headers["transfer-encoding"] !== undefined,
          query: !keys.length ? "none" : keys.every(key => key === "operation") ? "operation_only" : "other",
          operationMatches: query.getAll("operation").length === 1 && query.get("operation") === "active",
          runtimeOperation: operation === undefined ? "absent" : Array.isArray(operation) ? "multiple" : typeof operation !== "string" ? "other" : operation === "active" ? "matches" : "different",
          elapsedMs: round(time - started), identityMs: round(durations.identity), authorizationMs: round(durations.authorization), loadMs: round(durations.load),
        };
        try { log(entry); } catch { /* Response metadata remains available without a logger. */ }
        return entry;
      } catch { /* Diagnostics must never change an API response. */ }
    },
  };
}
