import { assertServerOnly, type ServerEnvironment } from "../config.js";
import { createDatabase, type ScopedDatabase } from "../db/client.js";
import { ServerError } from "../errors.js";
import { PostgresDatasetRepository } from "../persistence/postgres-datasets.js";
import { PostgresProposalRepository } from "../persistence/postgres-proposals.js";
import {
  createIdentityVerifier,
  type IdentityVerifier,
} from "../security/identity.js";
import { financialContext } from "../security/financial-context.js";
import type { Permission } from "../security/authorization.js";
import {
  badInput,
  exact,
  normalizeImport,
  object,
  reviewInput,
  versionId,
} from "./import-input.js";
import type { PolicyProposal } from "../../src/credito/types.js";
import { getDiagnostic, type FinancialGetLogger } from "./get-diagnostics.js";
export interface FinancialRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: unknown;
}
export interface FinancialResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}
interface Dependencies {
  environment?: ServerEnvironment;
  identity?: IdentityVerifier;
  database?: ScopedDatabase;
  diagnostic?: FinancialGetLogger;
}
const routes: Record<string, Record<string, Permission>> = {
  active: {
    GET: "datasets:read",
    PUT: "datasets:write",
    DELETE: "datasets:write",
  },
  validate: { POST: "datasets:write" },
  imports: { POST: "datasets:write" },
  versions: { GET: "datasets:read" },
  version: { GET: "datasets:read" },
  reviews: { PATCH: "datasets:write" },
  proposals: { GET: "credit:read", POST: "credit:write" },
};
const publicErrors = new Set([
  "UNAUTHENTICATED",
  "IDENTITY_NOT_CONFIGURED",
  "ACCESS_DENIED",
  "INVALID_INPUT",
  "DATASET_INVALID",
  "PROPOSAL_INVALID",
  "IMPORT_NOT_CONFIRMED",
  "IMPORT_HAS_ERRORS",
  "PRECONDITION_REQUIRED",
  "REVISION_CONFLICT",
  "VERSION_NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
]);
/** Fail-closed: desabilitado por padrão e sempre indisponível em Production nesta etapa. */
export function createFinancialHandler(dependencies: Dependencies = {}) {
  let identity: IdentityVerifier | undefined;
  const database =
    dependencies.database ?? createDatabase(dependencies.environment);
  return async (req: FinancialRequest, res: FinancialResponse) => {
    assertServerOnly();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Authorization, X-Workspace-Id");
    let diagnostic: ReturnType<typeof getDiagnostic> | undefined;
    let identityVerified = false;
    const reply = (status: number, body: unknown) => {
      const entry = diagnostic?.finish(status);
      // Only sanitized metadata about this request; never financial data or raw input.
      // Production/disabled routes never create a diagnostic; failed JWTs never receive the header.
      if (identityVerified && status === 400 && entry)
        res.setHeader("X-Biosaude-Get-Diagnostic", JSON.stringify(entry));
      res.statusCode = status;
      return res.end(JSON.stringify(body));
    };
    const env = dependencies.environment ?? process.env;
    if (
      env.FINANCIAL_API_ENABLED !== "true" ||
      !["preview", "development"].includes(env.VERCEL_ENV ?? "")
    )
      return reply(404, { code: "NOT_FOUND" });
    diagnostic = getDiagnostic(req, dependencies.diagnostic);
    try {
      diagnostic.phase("identity");
      if (
        typeof req.headers.authorization !== "string" ||
        !req.headers.authorization.startsWith("Bearer ")
      )
        throw new ServerError(
          "UNAUTHENTICATED",
          "Autenticação necessária.",
          401,
        );
      identity ??= dependencies.identity ?? createIdentityVerifier(env);
      const verified = await identity.verify(req.headers.authorization);
      identityVerified = true;
      diagnostic.phase("validation");
      const url = new URL(req.url ?? "", "https://request.invalid");
      const match = /^\/api\/financial\/([a-z]+)$/.exec(url.pathname);
      const operation = match?.[1] ?? "";
      const methods = Object.hasOwn(routes, operation)
        ? routes[operation]
        : undefined;
      if (!methods) return reply(404, { code: "NOT_FOUND" });
      const permission = Object.hasOwn(methods, req.method ?? "")
        ? methods[req.method ?? ""]
        : undefined;
      if (!permission) {
        res.setHeader("Allow", Object.keys(methods).join(", "));
        return reply(405, { code: "METHOD_NOT_ALLOWED" });
      }
      const workspace = req.headers["x-workspace-id"];
      if (
        typeof workspace !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          workspace,
        )
      ) {
        diagnostic.reject("workspace_header");
        throw badInput();
      }
      const allowedQuery =
        operation === "versions"
          ? ["limit", "offset"]
          : operation === "version"
            ? ["versionId"]
            : [];
      for (const key of url.searchParams.keys())
        if (
          !allowedQuery.includes(key) ||
          url.searchParams.getAll(key).length !== 1
        ) {
          diagnostic.reject(url.searchParams.getAll(key).length !== 1 ? "query_duplicate" : "query_unexpected");
          throw badInput();
        }
      const matchHeader = req.headers["if-match"];
      const revision =
        typeof matchHeader === "string" &&
        /^"(?:0|[1-9][0-9]{0,15})"$/.test(matchHeader)
          ? Number(matchHeader.slice(1, -1))
          : undefined;
      if (
        permission.endsWith(":write") &&
        operation !== "validate" &&
        !Number.isSafeInteger(revision)
      )
        throw new ServerError(
          "PRECONDITION_REQUIRED",
          "Informe If-Match.",
          428,
        );
      const context = financialContext(
        database,
        verified,
        workspace,
        permission,
        revision,
      );
      // Autoriza antes de ler/normalizar a carga; nova verificação dentro da transação de persistência.
      diagnostic.phase("authorization");
      await context.gate.authorize(permission);
      diagnostic.phase("body");
      const repo = new PostgresDatasetRepository(context.db, context.gate);
      let body: unknown;
      if (["POST", "PUT", "PATCH"].includes(req.method ?? "")) {
        if (
          typeof req.headers["content-type"] !== "string" ||
          !/^application\/json(?:\s*;.*)?$/i.test(req.headers["content-type"])
        )
          throw badInput();
        let raw: string;
        try {
          raw =
            typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        } catch {
          throw badInput();
        }
        if (typeof raw !== "string") throw badInput();
        if (Buffer.byteLength(raw, "utf8") > 3_000_000)
          throw new ServerError(
            "PAYLOAD_TOO_LARGE",
            "Carga excede o limite.",
            413,
          );
        try {
          body = JSON.parse(raw);
        } catch {
          throw badInput();
        }
      } else {
        const received = req.body;
        diagnostic.body(received);
        // Node/serverless parsers can represent a bodyless GET as a zero-byte Buffer.
        const empty = received === undefined || received === null || received === "" ||
          (req.method === "GET" && Buffer.isBuffer(received) && received.length === 0);
        // Parsed null/empty values must not hide bytes declared on the wire.
        const framedGet = req.method === "GET" && (
          (req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0") ||
          req.headers["transfer-encoding"] !== undefined
        );
        if (!empty || framedGet) {
          diagnostic.reject(!empty ? "body_nonempty" : "body_framing");
          throw badInput();
        }
      }
      let output: unknown;
      let status = 200;
      if (operation === "active") {
        if (req.method === "GET") {
          diagnostic.phase("load");
          output = { dataset: await repo.load() };
        }
        else if (req.method === "DELETE") {
          await repo.clear();
          output = { deactivated: true };
        } else {
          const input = object(body);
          exact(input, ["versionId"]);
          await repo.activate(versionId(input.versionId));
          output = { activated: true };
        }
      } else if (operation === "imports" || operation === "validate") {
        if (operation === "imports" && object(body).confirm !== true)
          throw new ServerError(
            "IMPORT_NOT_CONFIRMED",
            "Confirmação explícita necessária.",
            400,
          );
        const dataset = normalizeImport(body);
        if (operation === "validate")
          return reply(200, {
            valid: !dataset.issues.some((i) => i.severity === "error"),
            recordCount: dataset.records.length,
            issues: dataset.issues,
          });
        if (dataset.issues.some((i) => i.severity === "error"))
          throw new ServerError(
            "IMPORT_HAS_ERRORS",
            "Base contém erros impeditivos.",
            422,
          );
        await repo.save(dataset);
        status = 201;
        output = {
          versionId: dataset.id,
          reference: dataset.reference,
          recordCount: dataset.records.length,
        };
      } else if (operation === "versions") {
        function integer(key: string, fallback: number, max: number) {
          const raw = url.searchParams.get(key);
          if (raw === null) return fallback;
          if (
            !/^(?:0|[1-9][0-9]*)$/.test(raw) ||
            Number(raw) > max ||
            !Number.isSafeInteger(Number(raw))
          )
            throw badInput();
          return Number(raw);
        }
        const limit = integer("limit", 20, 100),
          offset = integer("offset", 0, 100000);
        if (limit < 1) throw badInput();
        output = {
          versions: await repo.versions(limit, offset),
          limit,
          offset,
        };
      } else if (operation === "version") {
        const dataset = await repo.loadVersion(
          versionId(url.searchParams.get("versionId")),
        );
        if (!dataset)
          throw new ServerError(
            "VERSION_NOT_FOUND",
            "Versão não encontrada.",
            404,
          );
        output = { dataset };
      } else if (operation === "reviews") {
        const input = reviewInput(body);
        await repo.updateReviews(input.versionId, input.reviews);
        output = { updated: true };
      } else {
        const proposals = new PostgresProposalRepository(
          context.db,
          context.gate,
        );
        if (req.method === "GET")
          output = { proposals: await proposals.list() };
        else {
          await proposals.append(body as PolicyProposal);
          output = { created: true };
          status = 201;
        }
      }
      res.setHeader("ETag", `"${context.revision()}"`);
      return reply(status, output);
    } catch (error) {
      if (error instanceof ServerError && publicErrors.has(error.code)) {
        if (error.status === 401) res.setHeader("WWW-Authenticate", "Bearer");
        return reply(error.status, { code: error.code });
      }
      // Nenhum erro bruto, URI, token, SQL ou configuração em resposta/log.
      return reply(503, { code: "FINANCIAL_API_UNAVAILABLE" });
    }
  };
}
