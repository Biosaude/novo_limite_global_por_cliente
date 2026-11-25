import type { FinancialRequest, FinancialResponse } from "../financial/handler.js";
import { ServerError } from "../errors.js";
import { z } from "zod";
import { corporateAuthResponse, configuredCorporateOrigin, previewEntryOrigin, corporatePreviewEnabled, requireCorporateRead } from "./auth.server.js";
import { CorporateAccessError, corporateAuthPaths } from "./access.js";
import { directoryId } from "./entra.server.js";
import type { VerifiedIdentity } from "../security/identity.js";
import type { ServerEnvironment } from "../config.js";

export function corporateRequest(req: FinancialRequest, env: ServerEnvironment) {
  const origin = configuredCorporateOrigin(env);
  const url = new URL(req.url ?? "/", origin);
  if (req.headers.host !== origin.host || url.origin !== origin.origin)
    throw new CorporateAccessError("corporate_denied");
  const headers = new Headers();
  for (const name of ["cookie", "origin", "sec-fetch-site"]) {
    const value = req.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }
  return new Request(url, { method: req.method, headers });
}

export function corporateErrorStatus(error: unknown) {
  if (error instanceof CorporateAccessError)
    return error.code === "corporate_login" ? 401 : error.code === "corporate_denied" ? 403 : 503;
  return 503;
}

const bindingsSchema = z.array(z.object({
  tenantId: directoryId,
  objectId: directoryId,
  subject: z.string().min(1).max(200),
}).strict()).min(1).max(100);

export async function bindFinancialIdentity(
  req: FinancialRequest,
  env: ServerEnvironment,
  identity: VerifiedIdentity,
  authorize = requireCorporateRead,
) {
  if (!corporatePreviewEnabled(env)) return;
  try {
    const principal = await authorize(corporateRequest(req, env));
    if (!principal) throw new CorporateAccessError("corporate_login");
    const production = env.VERCEL_ENV === "production";
    const bindings = bindingsSchema.parse(JSON.parse(
      (production ? env.GLOBAL_LIMIT_PRODUCTION_IDENTITY_BINDINGS : env.GLOBAL_LIMIT_PREVIEW_IDENTITY_BINDINGS) ?? "",
    ));
    const subjects = new Set(bindings.map(binding => binding.subject));
    const principals = new Set(bindings.map(binding => `${binding.tenantId}/${binding.objectId}`));
    if (subjects.size !== bindings.length || principals.size !== bindings.length)
      throw new Error("Vínculos de homologação duplicados.");
    if (identity.issuer !== (production ? env.FINANCIAL_AUTH_ISSUER : env.GLOBAL_LIMIT_PREVIEW_AUTH_ISSUER) ||
        !bindings.some(binding => binding.tenantId === principal.tenantId &&
          binding.objectId === principal.objectId && binding.subject === identity.subject))
      throw new CorporateAccessError("corporate_denied");
  } catch (error) {
    const status = corporateErrorStatus(error);
    throw new ServerError(status === 401 ? "UNAUTHENTICATED" : status === 403 ? "ACCESS_DENIED" : "CORPORATE_UNAVAILABLE",
      "Não foi possível confirmar a concessão corporativa.", status);
  }
}

export function createCorporateHandler(env: ServerEnvironment = process.env) {
  return async (req: FinancialRequest, res: FinancialResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!corporatePreviewEnabled(env)) {
      res.statusCode = 404;
      return res.end();
    }
    try {
      const path = new URL(req.url ?? "/", "https://request.invalid").pathname;
      const knownPaths: readonly string[] = Object.values(corporateAuthPaths);
      if (path !== "/api/corporate-auth/status" && !knownPaths.includes(path)) {
        res.statusCode = 404;
        return res.end();
      }
      const host = req.headers.host;
      if (req.method === "GET" && (path === corporateAuthPaths.login || path === "/api/corporate-auth/status")) {
        const canonical = typeof host === "string" && previewEntryOrigin(host, env);
        if (canonical) {
          if (path === corporateAuthPaths.login) {
            res.statusCode = 303;
            res.setHeader("Location", canonical.href);
            return res.end();
          }
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ code: "corporate_origin_mismatch", canonicalOrigin: canonical.origin }));
        }
      }
      const request = corporateRequest(req, env);
      if (path === "/api/corporate-auth/status" && req.method === "GET") {
        if (!(await requireCorporateRead(request))) throw new CorporateAccessError("corporate_login");
        res.statusCode = 204;
        return res.end();
      }
      const response = await corporateAuthResponse(request);
      if (!response) {
        res.statusCode = 404;
        return res.end();
      }
      for (const [name, value] of response.headers)
        if (name !== "set-cookie") res.setHeader(name, value);
      if (response.headers.has("set-cookie"))
        (res.setHeader as (name: string, value: unknown) => unknown)("Set-Cookie", response.headers.getSetCookie());
      res.statusCode = response.status;
      return res.end(await response.text());
    } catch (error) {
      res.statusCode = corporateErrorStatus(error);
      return res.end();
    }
  };
}
