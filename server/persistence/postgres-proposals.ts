import type { ProposalRepository } from "../../src/persistencia/contracts";
import type { PolicyProposal } from "../../src/credito/types";
import type { ScopedDatabase } from "../db/client";
import {
  denyAll,
  validateScope,
  type AuthorizationGate,
} from "../security/authorization";
import { validateProposal } from "./proposal-codec";
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
  async append(value: PolicyProposal): Promise<void> {
    const scope = validateScope(
      await this.authorization.authorize("credit:write"),
    );
    const proposal = validateProposal(value);
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
