import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceConfiguration } from "../src/auth/workspace";

const development = "fa76845b-235f-48fc-a609-81134636f5b5";
const production = "b0000000-0000-4000-8000-000000000001";
test("workspace: Preview e Development preservam o UUID existente", () => {
  for (const environment of ["preview", "development"]) {
    const config = workspaceConfiguration(environment);
    assert.equal(config.defaultId, development);
    assert.equal(config.id("Biosaude"), development);
    assert.equal(config.label(development), "Biosaude");
  }
});
test("workspace: Production exige UUID explícito e alias não aponta ao desenvolvimento", () => {
  for (const value of [undefined, "", " ", "invalid"]) {
    const config = workspaceConfiguration("production", value);
    assert.equal(config.defaultId, "");
    assert.equal(config.id("Biosaude"), "");
    assert.equal(config.label(development), development);
  }
  const config = workspaceConfiguration("production", ` ${production.toUpperCase()} `);
  assert.equal(config.defaultId, production);
  assert.equal(config.id("Biosaude"), production);
  assert.equal(config.label(production), "Biosaude");
  assert.equal(config.label(development), development);
  assert.equal(workspaceConfiguration("preview").defaultId, development);
});
