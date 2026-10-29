import { assertServerOnly, type ServerEnvironment } from "../server/config";
export function previewEndpoint(input: string): URL {
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".vercel.app") ||
      url.hostname === ".vercel.app" ||
      url.username ||
      url.password ||
      url.port ||
      !["", "/"].includes(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new Error();
    url.pathname = "/api/diagnostics/neon";
    return url;
  } catch {
    throw new Error("PREVIEW_URL_INVALID");
  }
}
const acceptedCodes = new Set([
  "NEON_CONNECTIVITY_OK",
  "NEON_CONNECTIVITY_UNAVAILABLE",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "METHOD_NOT_ALLOWED",
  "INPUT_NOT_ALLOWED",
]);
export async function runPreviewProbe(
  input: string,
  environment: ServerEnvironment,
  send: typeof fetch = fetch,
): Promise<{
  success: boolean;
  code: string;
  httpStatus?: number;
  checkedAt?: string;
}> {
  assertServerOnly();
  let url: URL;
  try {
    url = previewEndpoint(input);
  } catch {
    return { success: false, code: "PREVIEW_URL_INVALID" };
  }
  const token = environment.NEON_DIAGNOSTIC_TOKEN ?? "";
  if (!/^[a-f0-9]{64}$/i.test(token))
    return { success: false, code: "DIAGNOSTIC_TOKEN_MISSING_OR_INVALID" };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (environment.VERCEL_AUTOMATION_BYPASS_SECRET)
    headers["x-vercel-protection-bypass"] =
      environment.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    const response = await send(url, {
      method: "POST",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      return {
        success: false,
        code: "PREVIEW_RESPONSE_NOT_JSON",
        httpStatus: response.status,
      };
    const body = (await response.json()) as Record<string, unknown>;
    const verified =
      response.status === 200 &&
      body.code === "NEON_CONNECTIVITY_OK" &&
      body.connected === true &&
      body.readOnly === true &&
      body.persistence === "local" &&
      body.financialApi === "disabled";
    const checkedAt =
      typeof body.checkedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.checkedAt) &&
      Number.isFinite(Date.parse(body.checkedAt))
        ? body.checkedAt
        : undefined;
    if (verified && checkedAt)
      return {
        success: true,
        code: "NEON_CONNECTIVITY_OK",
        httpStatus: 200,
        checkedAt,
      };
    return {
      success: false,
      code:
        typeof body.code === "string" &&
        body.code !== "NEON_CONNECTIVITY_OK" &&
        acceptedCodes.has(body.code)
          ? body.code
          : "PREVIEW_CHECK_FAILED",
      httpStatus: response.status,
    };
  } catch {
    return { success: false, code: "PREVIEW_REQUEST_FAILED" };
  }
}
