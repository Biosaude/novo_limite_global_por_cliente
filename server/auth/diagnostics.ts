/** Closed vocabulary: never log a provider string merely because it resembles a code. */
const configurationCodes = new Set([
  "RESET_PASSWORD_DISABLED", "VERIFICATION_EMAIL_NOT_ENABLED",
  "INVALID_ORIGIN", "INVALID_CALLBACK_URL", "INVALID_REDIRECT_URL",
  "MISSING_OR_NULL_ORIGIN", "CALLBACK_URL_REQUIRED",
]);
const rateCodes = new Set(["RATE_LIMIT", "RATE_LIMIT_EXCEEDED", "TOO_MANY_REQUESTS"]);
const providerCodes = new Set([
  ...configurationCodes, ...rateCodes,
  "USER_NOT_FOUND", "EMAIL_ALREADY_VERIFIED", "EMAIL_NOT_VERIFIED",
  "INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_NOT_FOUND", "INVALID_OTP",
  "INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD", "CREDENTIAL_ACCOUNT_NOT_FOUND",
  "INTERNAL_SERVER_ERROR", "SERVICE_UNAVAILABLE", "FAILED_TO_SEND_EMAIL",
  "FAILED_TO_CREATE_VERIFICATION", "FAILED_TO_GET_SESSION",
]);
export interface AuthDiagnostic { readonly status: number | null; readonly code: string; }
export type AuthDiagnosticLogger = (entry: AuthDiagnostic) => void;
export const logAuthDiagnostic: AuthDiagnosticLogger = entry => {
  console.warn(JSON.stringify({ status: entry.status, code: entry.code }));
};
export function providerErrorCode(detail: unknown): string {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return "UNRECOGNIZED_PROVIDER_ERROR";
  const nested = "error" in detail && detail.error && typeof detail.error === "object" && !Array.isArray(detail.error)
    ? detail.error : undefined;
  const code = "code" in detail ? detail.code : nested && "code" in nested ? nested.code : undefined;
  return typeof code === "string" && providerCodes.has(code) ? code : "UNRECOGNIZED_PROVIDER_ERROR";
}
export const isConfigurationError = (code: string): boolean => configurationCodes.has(code);
export const isRateLimit = (status: number, code: string): boolean => status === 429 || rateCodes.has(code);
