import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { assertServerOnly, type ServerEnvironment } from "../config.js";
import { corporatePreviewEnabled } from "../corporate/auth.server.js";
import { ServerError } from "../errors.js";
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  actor: string;
}
export interface IdentityVerifier {
  verify(header: string | string[] | undefined): Promise<VerifiedIdentity>;
}
const invalid = () =>
  new ServerError("UNAUTHENTICATED", "Autenticação necessária.", 401);
/** Provedor externo real; não cria sessões, senhas, usuários ou tokens da aplicação. */
export function createIdentityVerifier(
  env: ServerEnvironment,
  suppliedKey?: JWTVerifyGetKey,
): IdentityVerifier {
  assertServerOnly();
  const corporate = env.VERCEL_ENV !== "production" && corporatePreviewEnabled(env);
  const issuer = (corporate ? env.GLOBAL_LIMIT_PREVIEW_AUTH_ISSUER : env.FINANCIAL_AUTH_ISSUER) ?? "";
  // Better Auth defaults the JWT audience to its issuer. Retain strict
  // audience validation even when the dedicated variable is not configured.
  // An explicit audience still takes precedence for customized providers.
  const audience = (corporate ? env.GLOBAL_LIMIT_PREVIEW_AUTH_AUDIENCE : env.FINANCIAL_AUTH_AUDIENCE)?.trim() || issuer;
  const jwks = (corporate ? env.GLOBAL_LIMIT_PREVIEW_AUTH_JWKS_URL : env.FINANCIAL_AUTH_JWKS_URL) ?? "";
  try {
    if (corporate && (!env.GLOBAL_LIMIT_PREVIEW_NEON_AUTH_BASE_URL ||
      new URL(env.GLOBAL_LIMIT_PREVIEW_NEON_AUTH_BASE_URL).origin !== new URL(issuer).origin ||
      new URL(jwks).origin !== new URL(issuer).origin ||
      (env.FINANCIAL_AUTH_ISSUER && new URL(env.FINANCIAL_AUTH_ISSUER).origin === new URL(issuer).origin)))
      throw Error();
    for (const value of [issuer, jwks]) {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hash ||
        url.search
      )
        throw Error();
    }
    if (!audience.trim() || audience.length > 300 || issuer.length > 500)
      throw Error();
  } catch {
    throw new ServerError(
      "IDENTITY_NOT_CONFIGURED",
      "Provedor de identidade não configurado.",
      503,
    );
  }
  // URL de chaves é fixa no servidor; nunca usa jku/x5u ou issuer vindo do token/requisição.
  const key =
    suppliedKey ??
    createRemoteJWKSet(new URL(jwks), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
    });
  return {
    async verify(header) {
      if (typeof header !== "string" || header.length > 16384) throw invalid();
      const match =
        /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(
          header,
        );
      if (!match) throw invalid();
      try {
        const { payload, protectedHeader } = await jwtVerify(match[1], key, {
          algorithms: ["RS256", "EdDSA"],
          issuer,
          audience,
          requiredClaims: ["exp", "iat", "sub", "iss", "aud"],
          clockTolerance: 5,
        });
        if (
          protectedHeader.jku ||
          protectedHeader.x5u ||
          !payload.sub?.trim() ||
          typeof payload.iat !== "number" ||
          payload.iat > Date.now() / 1000 + 5
        )
          throw invalid();
        const actor = JSON.stringify([issuer, payload.sub]);
        if (actor.length > 300) throw invalid();
        return { issuer, subject: payload.sub, actor };
      } catch {
        throw invalid();
      }
    },
  };
}
