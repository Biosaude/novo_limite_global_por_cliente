import { test, expect } from "@playwright/test";

test.skip(process.env.WORKSPACE_E2E !== "true", "Requer build remoto com VERCEL_ENV=production.");
test("Production: seleção usa apenas o workspace explícito do build", async ({ page }) => {
  const expected = process.env.EXPECTED_WORKSPACE ?? "";
  const subject = "synthetic-user";
  const user = { id: subject, email: "synthetic@example.invalid", name: "Synthetic", emailVerified: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const session = { id: "synthetic", userId: subject, token: "synthetic-session",
    expiresAt: new Date(Date.now() + 3600000).toISOString(), createdAt: user.createdAt, updatedAt: user.updatedAt };
  // Somente a barreira de troca de sessão do cliente é exercitada aqui; assinatura é testada na API.
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "RS256" })}.${encode({ sub: subject })}.synthetic`;
  await page.route("**/api/neon-auth/**", route => route.fulfill({ json:
    new URL(route.request().url()).pathname.endsWith("/token") ? { token } : { user, session } }));
  const workspaces: string[] = [];
  await page.route("**/api/financial/**", async route => {
    workspaces.push(route.request().headers()["x-workspace-id"]);
    await route.fulfill({ status: 403, json: { code: "ACCESS_DENIED" } });
  });
  await page.goto("/");
  const input = page.getByLabel("Identificador da organização");
  await expect(input).toHaveValue(expected ? "Biosaude" : "");
  if (!expected) {
    await input.fill("Biosaude");
    await expect(input).toHaveValue("");
    await page.getByRole("button", { name: "Abrir organização", exact: true }).click();
    expect(workspaces).toEqual([]);
    await input.fill("b0000000-0000-4000-8000-000000000001");
  }
  await page.getByRole("button", { name: "Abrir organização", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sem permissão");
  expect(workspaces.length).toBeGreaterThan(0);
  expect(new Set(workspaces)).toEqual(new Set([expected || "b0000000-0000-4000-8000-000000000001"]));
});
