import type { ProposalRepository } from "../../src/persistencia/contracts";
import type { PolicyProposal } from "../../src/credito/types";
import { validateConfig } from "../../src/credito/policy";
import type { ScopedDatabase } from "../db/client";
import {
  denyAll,
  validateScope,
  type AuthorizationGate,
} from "../security/authorization";
import { ServerError } from "../errors";
export class PostgresProposalRepository implements ProposalRepository {
  constructor(
    private readonly db: ScopedDatabase,
    private readonly authorization: AuthorizationGate = denyAll,
  ) {}
  async list(): Promise<PolicyProposal[]> {
    const scope = validateScope(
      await this.authorization.authorize("credit:read"),
    );
    const [rows] = await this.db.transaction(scope.workspaceId, [
      {
        text: "SELECT id,version,created_at,reason,config,status FROM biosaude.credit_proposals WHERE workspace_id=$1 ORDER BY created_at DESC,id",
        values: [scope.workspaceId],
      },
    ]);
    return rows.map((r) => ({
      id: String(r.id),
      version: Number(r.version),
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : new Date(String(r.created_at)).toISOString(),
      reason: String(r.reason),
      config: r.config as PolicyProposal["config"],
      status: "draft",
    }));
  }
  async append(proposal: PolicyProposal): Promise<void> {
    const scope = validateScope(
      await this.authorization.authorize("credit:write"),
    );
    try {
      if (
        !proposal ||
        typeof proposal.id !== "string" ||
        !proposal.id ||
        !Number.isSafeInteger(proposal.version) ||
        proposal.version < 1 ||
        !Number.isFinite(Date.parse(proposal.createdAt)) ||
        typeof proposal.reason !== "string" ||
        !proposal.reason.trim() ||
        proposal.status !== "draft"
      )
        throw new Error();
      validateConfig(proposal.config);
    } catch {
      throw new ServerError(
        "PROPOSAL_INVALID",
        "Proposta de crédito inválida; somente rascunhos são aceitos.",
        400,
      );
    }
    await this.db.transaction(scope.workspaceId, [
      {
        text: "INSERT INTO biosaude.credit_proposals(workspace_id,id,version,created_at,reason,config,status,actor_subject) VALUES($1,$2,$3,$4,$5,$6::jsonb,'draft',$7)",
        values: [
          scope.workspaceId,
          proposal.id,
          proposal.version,
          proposal.createdAt,
          proposal.reason,
          JSON.stringify(proposal.config),
          scope.subject,
        ],
      },
      {
        text: "INSERT INTO biosaude.audit_events(workspace_id,actor_subject,action,metadata) VALUES($1,$2,'credit.proposal.append',$3::jsonb)",
        values: [
          scope.workspaceId,
          scope.subject,
          JSON.stringify({ proposalId: proposal.id }),
        ],
      },
    ]);
  }
}
