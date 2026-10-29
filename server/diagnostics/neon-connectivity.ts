import { timingSafeEqual } from "node:crypto";
import { assertServerOnly, type ServerEnvironment } from "../config";
import { checkReadOnlyConnectivity } from "../db/client";
export interface DiagnosticRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
export interface DiagnosticResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}
export interface DiagnosticDependencies {
  environment?: ServerEnvironment;
  probe?: (environment: ServerEnvironment) => Promise<void>;
  now?: () => Date;
}
const tokenPattern = /^[a-f0-9]{64}$/i;
/** Nenhuma leitura de DATABASE_URL ocorre antes desta autorização. Produção nunca é habilitada. */
function authorization(
  request: DiagnosticRequest,
  env: ServerEnvironment,
): "disabled" | "unauthorized" | "authorized" {
  if (
    !["preview", "development"].includes(env.VERCEL_ENV ?? "") ||
    env.VITE_NEON_DIAGNOSTIC_TOKEN?.trim()
  )
    return "disabled";
  const expected = env.NEON_DIAGNOSTIC_TOKEN ?? "";
  if (!tokenPattern.test(expected)) return "disabled";
  const header = request.headers.authorization;
  if (typeof header !== "string") return "unauthorized";
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(header);
  if (!match) return "unauthorized";
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(match[1], "hex"),
  )
    ? "authorized"
    : "unauthorized";
}
export function createConnectivityHandler(
  dependencies: DiagnosticDependencies = {},
) {
  return async (request: DiagnosticRequest, response: DiagnosticResponse) => {
    assertServerOnly();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store, private");
    response.setHeader("Vercel-CDN-Cache-Control", "no-store");
    response.setHeader("CDN-Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Vary", "Authorization");
    const reply = (status: number, body: object) => {
      response.statusCode = status;
      return response.end(JSON.stringify(body));
    };
    const env = dependencies.environment ?? process.env;
    const allowed = authorization(request, env);
    if (allowed === "disabled") return reply(404, { code: "NOT_FOUND" });
    if (allowed === "unauthorized") {
      response.setHeader("WWW-Authenticate", "Bearer");
      return reply(401, { code: "UNAUTHORIZED" });
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return reply(405, { code: "METHOD_NOT_ALLOWED" });
    }
    if (
      request.headers["transfer-encoding"] ||
      (request.headers["content-length"] !== undefined &&
        request.headers["content-length"] !== "0") ||
      request.url?.includes("?") ||
      (request.body !== undefined &&
        request.body !== null &&
        request.body !== "")
    )
      return reply(400, { code: "INPUT_NOT_ALLOWED" });
    try {
      await (dependencies.probe ?? checkReadOnlyConnectivity)(env);
      return reply(200, {
        code: "NEON_CONNECTIVITY_OK",
        connected: true,
        readOnly: true,
        checkedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
        persistence: "local",
        financialApi: "disabled",
      });
    } catch {
      // Sem cause, stack, query, URI, host ou mensagem do driver na resposta ou nos logs.
      return reply(503, {
        code: "NEON_CONNECTIVITY_UNAVAILABLE",
        connected: false,
        persistence: "local",
        financialApi: "disabled",
      });
    }
  };
}
