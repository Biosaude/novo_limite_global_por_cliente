import { accessDenied } from "../errors";
export type Permission =
  | "datasets:read"
  | "datasets:write"
  | "credit:read"
  | "credit:write";
export interface AuthorizedScope {
  readonly workspaceId: string;
  readonly subject: string;
}
/** A implementação futura deve verificar sessão/identidade e associação ao workspace no servidor. */
export interface AuthorizationGate {
  authorize(permission: Permission): Promise<AuthorizedScope>;
}
export const denyAll: AuthorizationGate = {
  async authorize() {
    throw accessDenied();
  },
};
export function validateScope(scope: AuthorizedScope): AuthorizedScope {
  if (
    !scope ||
    !/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(scope.workspaceId) ||
    !/^[0-9a-f-]+$/i.test(scope.workspaceId) ||
    typeof scope.subject !== "string" ||
    !scope.subject.trim() ||
    scope.subject.length > 300
  )
    throw accessDenied();
  return scope;
}
