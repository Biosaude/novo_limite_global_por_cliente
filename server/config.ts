import { ServerError } from "./errors.js";
export type ServerEnvironment = Readonly<Record<string, string | undefined>>;
export function assertServerOnly() {
  if (
    "window" in globalThis ||
    typeof process === "undefined" ||
    !process.versions?.node
  )
    throw new ServerError(
      "SERVER_ONLY",
      "Módulo disponível somente no servidor.",
    );
}
/** Nunca retornar esta string em respostas, logs ou diagnósticos. Sem conexão de rede. */
export function readDatabaseUrl(environment?: ServerEnvironment): string {
  assertServerOnly();
  const env = environment ?? process.env;
  if (env.VITE_DATABASE_URL?.trim())
    throw new ServerError(
      "PUBLIC_DATABASE_URL_FORBIDDEN",
      "Remova a variável pública de conexão; use somente DATABASE_URL no servidor.",
    );
  const value = env.DATABASE_URL?.trim();
  if (!value)
    throw new ServerError(
      "DATABASE_URL_MISSING",
      "DATABASE_URL não configurada no servidor.",
    );
  try {
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.password ||
      url.pathname.length <= 1 ||
      url.hash ||
      !["require", "verify-full", "verify-ca"].includes(
        url.searchParams.get("sslmode") ?? "",
      )
    )
      throw new Error();
  } catch {
    throw new ServerError(
      "DATABASE_URL_INVALID",
      "Configuração de banco inválida: use uma URL PostgreSQL com TLS obrigatório.",
    );
  }
  return value;
}
export function databaseConfiguration(environment?: ServerEnvironment): {
  configured: boolean;
  code: string;
} {
  try {
    readDatabaseUrl(environment);
    return { configured: true, code: "CONFIGURATION_VALID_NOT_CONNECTED" };
  } catch (error) {
    return {
      configured: false,
      code: error instanceof ServerError ? error.code : "CONFIGURATION_INVALID",
    };
  }
}
