const DEVELOPMENT_WORKSPACE_ID = "fa76845b-235f-48fc-a609-81134636f5b5";
export const workspacePattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** The deployment's public UUID selects an organization; authorization remains on the server. */
export function workspaceConfiguration(environment: string, configured?: string) {
  const value = configured?.trim() ?? "";
  const defaultId = value ? (workspacePattern.test(value) ? value.toLowerCase() : "")
    : environment === "production" ? "" : DEVELOPMENT_WORKSPACE_ID;
  return {
    defaultId,
    label: (id: string) => defaultId && id.toLowerCase() === defaultId ? "Biosaude" : id,
    id: (label: string) => label.trim().toLowerCase() === "biosaude" ? defaultId : label.trim(),
  };
}
