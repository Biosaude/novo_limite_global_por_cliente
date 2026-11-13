import { gzipSync, gunzipSync } from "node:zlib";
import { badInput } from "./import-input.js";
import { ServerError } from "../errors.js";

const MAX_WIRE_BYTES = 3_000_000;
const MAX_EXPANDED_BYTES = 32_000_000;
const MARKER = "gzip-base64-v1";

export function decodeImportEnvelope(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !("__biosaude_transport" in input)) return input;
  const value = input as Record<string, unknown>;
  if (value.__biosaude_transport !== MARKER ||
      Object.keys(value).length !== 2 || typeof value.data !== "string" ||
      value.data.length > MAX_WIRE_BYTES || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data))
    throw badInput();
  try {
    const compressed = Buffer.from(value.data, "base64");
    if (!compressed.length || compressed.toString("base64") !== value.data)
      throw badInput();
    const decompressed = gunzipSync(compressed, { maxOutputLength: MAX_EXPANDED_BYTES });
    if (decompressed.length > MAX_EXPANDED_BYTES) throw badInput();
    return JSON.parse(decompressed.toString("utf8")) as unknown;
  } catch {
    throw badInput();
  }
}

export function encodeFinancialResponse(input: unknown): unknown {
  const json = JSON.stringify(input);
  const originalBytes = Buffer.byteLength(json, "utf8");
  if (originalBytes <= 2_500_000) return input;
  if (originalBytes > MAX_EXPANDED_BYTES)
    throw new ServerError("PAYLOAD_TOO_LARGE", "Resposta excede limite seguro.", 413);
  const compressed = gzipSync(json, { level: 6 }).toString("base64");
  const wrapped = { __biosaude_transport: MARKER, data: compressed };
  if (Buffer.byteLength(JSON.stringify(wrapped), "utf8") > MAX_WIRE_BYTES)
    throw new ServerError("PAYLOAD_TOO_LARGE", "Resposta compactada excede limite.", 413);
  return wrapped;
}
