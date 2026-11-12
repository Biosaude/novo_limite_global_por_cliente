import type { Dataset } from "../domain/types";
import type { PolicyProposal } from "../credito/types";
import type { DatasetRepository, ProposalRepository } from "./contracts";
import { refreshDayAnalysis } from "../importacao/dayAnalysis";

export class RemoteError extends Error {
  constructor(public readonly code: string) {
    super(code === "REVISION_CONFLICT"
      ? "A organização foi atualizada em outra sessão. Recarregue a base antes de continuar."
      : code === "ACCESS_DENIED" ? "Sem permissão para esta operação na organização."
      : code === "UNAUTHENTICATED" ? "A sessão expirou. Entre novamente."
      : code === "PAYLOAD_TOO_LARGE" ? "A base excede o limite de envio da API (3 MB de JSON)."
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
    const json = body === undefined ? undefined : JSON.stringify(body);
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
      const value = await response.json();
      this.assertActive();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new RemoteError("UNAVAILABLE");
      if (operation !== "validate") {
        const etag = response.headers.get("etag");
        if (!etag || !/^"(?:0|[1-9][0-9]{0,15})"$/.test(etag) || !Number.isSafeInteger(Number(etag.slice(1,-1))))
          throw new RemoteError("UNAVAILABLE");
        if (!write && this.revision !== null && etag !== this.revision) {
          this.blocked = true;
          throw new RemoteError("REVISION_CONFLICT");
        }
        this.revision = etag;
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
