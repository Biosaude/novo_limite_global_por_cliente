import type { Dataset } from "../domain/types";
import type { PolicyProposal } from "../credito/types";
import type { DatasetRepository, ProposalRepository } from "./contracts";
import { refreshDayAnalysis } from "../importacao/dayAnalysis";
import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";

const MAX_JSON_BYTES = 32_000_000;
const MAX_WIRE_BYTES = 3_000_000;
const MARKER = "gzip-base64-v1";
function base64Of(bytes: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
}
function bytesOfBase64(value: string): Uint8Array {
  const text = atob(value);
  const result = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) result[i] = text.charCodeAt(i);
  return result;
}
export function encodeLargeRequest(json: string): string {
  const bytes = strToU8(json);
  if (bytes.length <= MAX_WIRE_BYTES) return json;
  if (bytes.length > MAX_JSON_BYTES) throw new RemoteError("PAYLOAD_TOO_LARGE");
  const data = base64Of(gzipSync(bytes, { level: 6 }));
  const wrapped = JSON.stringify({ __biosaude_transport: MARKER, data });
  if (strToU8(wrapped).length > MAX_WIRE_BYTES) throw new RemoteError("PAYLOAD_TOO_LARGE");
  return wrapped;
}
export function decodeLargeResponse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RemoteError("UNAVAILABLE");
  const data = value as Record<string, unknown>;
  if (!("__biosaude_transport" in data)) return data;
  if (data.__biosaude_transport !== MARKER || Object.keys(data).length !== 2 ||
      typeof data.data !== "string" || data.data.length > MAX_WIRE_BYTES)
    throw new RemoteError("UNAVAILABLE");
  try {
    const decoded = gunzipSync(bytesOfBase64(data.data));
    if (decoded.length > MAX_JSON_BYTES) throw Error("expanded response too large");
    const parsed: unknown = JSON.parse(strFromU8(decoded));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw Error("invalid response");
    return parsed as Record<string, unknown>;
  } catch { throw new RemoteError("UNAVAILABLE"); }
}



export class RemoteError extends Error {
  constructor(public readonly code: string) {
    super(code === "REVISION_CONFLICT"
      ? "A organização foi atualizada em outra sessão. Recarregue a base antes de continuar."
      : code === "ACCESS_DENIED" ? "Sem permissão para esta operação na organização."
      : code === "UNAUTHENTICATED" ? "A sessão expirou. Entre novamente."
      : code === "PAYLOAD_TOO_LARGE" ? "A base excede o limite seguro mesmo após compactação (3 MB por requisição)."
      : code === "NOT_FOUND" ? "API financeira indisponível ou desabilitada neste ambiente."
      : "Não foi possível concluir a operação remota. Recarregue antes de tentar novamente.");
  }
}
export interface RemoteOptions {
  workspace: string;
  token: () => Promise<string>;
  active: () => boolean;
  send?: typeof fetch;
  onUnauthorized?: () => void;
}
/** Um cliente por sessão/organização. Sem cache persistente e sem fallback automático. */
export class FinancialHttpClient {
  private revision: string | null = null;
  private blocked = false;
  private busy = false;
  constructor(private readonly options: RemoteOptions) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(options.workspace))
      throw new RemoteError("INVALID_INPUT");
  }
  private assertActive() {
    if (!this.options.active()) throw new RemoteError("UNAUTHENTICATED");
  }
  async request(operation: string, method = "GET", body?: unknown): Promise<Record<string, unknown>> {
    this.assertActive();
    const write = method !== "GET" && operation !== "validate";
    if (this.blocked) throw new RemoteError("REVISION_CONFLICT");
    // Escritas concorrentes no mesmo cliente são recusadas, nunca repetidas automaticamente.
    if (this.busy) throw new RemoteError("REVISION_CONFLICT");
    if (write && this.revision === null) throw new RemoteError("PRECONDITION_REQUIRED");
    const json = body === undefined ? undefined :
      (operation === "imports" || operation === "validate" ? encodeLargeRequest(JSON.stringify(body)) : JSON.stringify(body));
    if (json && new TextEncoder().encode(json).length > 3_000_000) throw new RemoteError("PAYLOAD_TOO_LARGE");
    if (write) this.busy = true;
    try {
      const token = await this.options.token();
      this.assertActive();
      if (!token) throw new RemoteError("UNAUTHENTICATED");
      const response = await (this.options.send ?? fetch)(`/api/financial/${operation}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Workspace-Id": this.options.workspace,
          ...(json === undefined ? {} : { "Content-Type": "application/json" }),
          ...(write ? { "If-Match": this.revision! } : {}),
        },
        body: json,
        credentials: "same-origin",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      this.assertActive();
      if (response.status === 401) {
        this.options.onUnauthorized?.();
        throw new RemoteError("UNAUTHENTICATED");
      }
      if (!response.ok) {
        if (response.status === 409 || response.status === 428) this.blocked = true;
        throw new RemoteError(response.status === 403 ? "ACCESS_DENIED"
          : response.status === 404 ? "NOT_FOUND"
          : response.status === 413 ? "PAYLOAD_TOO_LARGE"
          : response.status === 409 || response.status === 428 ? "REVISION_CONFLICT" : "UNAVAILABLE");
      }
      if (!response.headers.get("content-type")?.includes("application/json")) throw new RemoteError("UNAVAILABLE");
      const value = decodeLargeResponse(await response.json());
      this.assertActive();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new RemoteError("UNAVAILABLE");
      if (operation !== "validate") {
        const rawRevision = response.headers.get("x-biosaude-revision");
        const etag = response.headers.get("etag");
        // O runtime Vercel pode enfraquecer o cabeçalho para W/"3".
        // Nunca encaminhar W/ ao If-Match: ele requer revisão forte.
        const match = etag?.match(/^(?:W\/)?"(0|[1-9][0-9]{0,15})"$/);
        const headerRevision = rawRevision !== null && /^(?:0|[1-9][0-9]{0,15})$/.test(rawRevision)
          ? Number(rawRevision) : null;
        const etagRevision = match ? Number(match[1]) : null;
        if ((rawRevision !== null && headerRevision === null) ||
            (etag !== null && etagRevision === null) ||
            (headerRevision === null && etagRevision === null) ||
            (headerRevision !== null && !Number.isSafeInteger(headerRevision)) ||
            (etagRevision !== null && !Number.isSafeInteger(etagRevision)) ||
            (headerRevision !== null && etagRevision !== null && headerRevision !== etagRevision))
          throw new RemoteError("UNAVAILABLE");
        const canonical = `"${headerRevision ?? etagRevision}"`;
        if (!write && this.revision !== null && canonical !== this.revision) {
          this.blocked = true;
          throw new RemoteError("REVISION_CONFLICT");
        }
        this.revision = canonical;
      }
      return value;
    } catch (error) {
      // Após falha de transporte numa escrita, o commit pode ter ocorrido. Exigir recarga evita duplicação.
      if (write) this.blocked = true;
      if (error instanceof RemoteError) throw error;
      throw new RemoteError("UNAVAILABLE");
    } finally {
      if (write) this.busy = false;
    }
  }
}
function dataset(value: unknown): Dataset {
  const d = value as Dataset;
  if (!d || d.version !== 1 || typeof d.id !== "string" || !Array.isArray(d.records)
    || !d.source || !Array.isArray(d.issues) || !d.reviews) throw new RemoteError("UNAVAILABLE");
  return refreshDayAnalysis(d);
}
export class HttpDatasetRepository implements DatasetRepository {
  constructor(readonly client: FinancialHttpClient) {}
  async load() {
    const value = await this.client.request("active");
    return value.dataset === null ? null : dataset(value.dataset);
  }
  private input(d: Dataset) {
    return { source: d.source, mappings: d.mappings, reference: d.reference, filename: d.filename, confirm: true };
  }
  async validate(d: Dataset) { return this.client.request("validate", "POST", this.input(d)); }
  async save(d: Dataset) { await this.client.request("imports", "POST", this.input(d)); }
  async activate(id: string) { await this.client.request("active", "PUT", { versionId: id }); }
  async updateReviews(d: Dataset) {
    await this.client.request("reviews", "PATCH", {
      versionId: d.id,
      reviews: Object.fromEntries(Object.entries(d.reviews).map(([key,value]) => [key,value.note])),
    });
  }
  async clear() { await this.client.request("active", "DELETE"); }
  async history(): Promise<Dataset[]> {
    const result: Dataset[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.client.request(`versions?limit=100&offset=${offset}`);
      if (!Array.isArray(page.versions)) throw new RemoteError("UNAVAILABLE");
      for (const item of page.versions) {
        if (typeof item.id !== "string") throw new RemoteError("UNAVAILABLE");
        const value = await this.client.request(`version?versionId=${encodeURIComponent(item.id)}`);
        result.push(dataset(value.dataset));
      }
      if (page.versions.length < 100) return result;
    }
  }
}
export class HttpProposalRepository implements ProposalRepository {
  constructor(private readonly client: FinancialHttpClient) {}
  async list(): Promise<PolicyProposal[]> {
    const value = await this.client.request("proposals");
    if (!Array.isArray(value.proposals)) throw new RemoteError("UNAVAILABLE");
    return value.proposals;
  }
  async append(p: PolicyProposal) { await this.client.request("proposals", "POST", p); }
}
