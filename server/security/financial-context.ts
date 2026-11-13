import type { ScopedDatabase, Statement } from "../db/client.js";
import { ServerError, accessDenied } from "../errors.js";
import {
  validateScope,
  type AuthorizationGate,
  type Permission,
} from "./authorization.js";
import type { VerifiedIdentity } from "./identity.js";
/** Verifica associação no servidor e novamente dentro de cada transação financeira. */
export function financialContext(
  base: ScopedDatabase,
  identity: VerifiedIdentity,
  workspaceId: string,
  permission: Permission,
  expectedRevision?: number,
) {
  const scope = validateScope({ workspaceId, subject: identity.actor });
  const check: Statement = {
    text: "SELECT biosaude.require_permission($1,$2,$3,$4)",
    values: [workspaceId, identity.issuer, identity.subject, permission],
  };
  const write = permission.endsWith(":write");
  let revision = 0;
  const gate: AuthorizationGate = {
    async authorize(requested) {
      if (requested !== permission) throw accessDenied();
      await base.transaction(workspaceId, [check]);
      return scope;
    },
  };
  const db: ScopedDatabase = {
    async transaction(w, statements) {
      if (w !== workspaceId) throw accessDenied();
      if (
        write &&
        (!Number.isSafeInteger(expectedRevision) || expectedRevision! < 0)
      )
        throw new ServerError(
          "PRECONDITION_REQUIRED",
          "Informe a revisão atual em If-Match.",
          428,
        );
      const rows = await base.transaction(workspaceId, [
        check,
        ...(write
          ? [
              {
                text: "SELECT biosaude.advance_revision($1,$2)",
                values: [workspaceId, expectedRevision!],
              },
            ]
          : []),
        ...statements,
        {
          text: "SELECT COALESCE((SELECT revision FROM biosaude.workspace_state WHERE workspace_id=$1),0)::text AS revision",
          values: [workspaceId],
        },
      ]);
      revision = Number(rows.at(-1)?.[0]?.revision);
      return rows.slice(write ? 2 : 1, -1);
    },
  };
  return { gate, db, revision: () => revision };
}
