import type { ServerEnvironment } from "./config.js";

/** Production stays fail-closed until separately enabled on the server.
 * Preview/Development retain their existing behavior.
 */
export function remoteEnvironmentAllowed(env: ServerEnvironment): boolean {
  if (env.VERCEL_ENV === "production")
    return env.FINANCIAL_PRODUCTION_ENABLED === "true";
  return env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development";
}
