import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@neondatabase/serverless";
import { createDatabase } from "../server/db/client.js";

const workspace = "6aa0ef36-66d5-4b16-8acc-2846586458ec";
const env = {
  VERCEL_ENV: "production",
  FINANCIAL_DB_TRANSPORT: "websocket",
  DATABASE_URL: "postgresql://biosaude_runtime_prod:synthetic@ep-synthetic.example.invalid/neondb?sslmode=require",
};

test("WebSocket opt-in: BEGIN, security guard, scoped SQL, COMMIT and connection closing", async t => {
  const events: string[] = [];
  const prototype = Client.prototype as unknown as {
    connect(): Promise<void>;
    query(text: string, values?: unknown[]): Promise<{rows: Record<string, unknown>[]}>;
    end(): Promise<void>;
  };
  t.mock.method(prototype, "connect", async () => { events.push("connect"); });
  t.mock.method(prototype, "query", async (text: string, values?: unknown[]) => {
    events.push(text.startsWith("DO $runtime$") ? "guard" : text.startsWith("SELECT set_config") ? "scope" : text);
    if (text.startsWith("SELECT set_config")) assert.deepEqual(values, [workspace]);
    return { rows: text === "SELECT 1 AS ok" ? [{ ok: 1 }] : [] };
  });
  t.mock.method(prototype, "end", async () => { events.push("end"); });
  const db = createDatabase(env);
  const rows = await db.transaction(workspace, [{ text: "SELECT 1 AS ok" }]);
  assert.deepEqual(rows, [[{ ok: 1 }]]);
  assert.deepEqual(events, ["connect", "BEGIN ISOLATION LEVEL SERIALIZABLE", "guard", "scope", "SELECT 1 AS ok", "COMMIT", "end"]);
});

test("WebSocket opt-in: failed authorization is rolled back and never committed", async t => {
  const events: string[] = [];
  const prototype = Client.prototype as unknown as {
    connect(): Promise<void>;
    query(text: string, values?: unknown[]): Promise<{rows: Record<string, unknown>[]}>;
    end(): Promise<void>;
  };
  t.mock.method(prototype, "connect", async () => { events.push("connect"); });
  t.mock.method(prototype, "query", async (text: string) => {
    events.push(text.startsWith("DO $runtime$") ? "guard" : text.startsWith("SELECT set_config") ? "scope" : text);
    if (text === "SELECT biosaude.require_permission($1,$2,$3,$4)") {
      const error = new Error("synthetic permission denial") as Error & {code: string};
      error.code = "42501";
      throw error;
    }
    return { rows: [] };
  });
  t.mock.method(prototype, "end", async () => { events.push("end"); });
  const db = createDatabase(env, undefined, () => {});
  await assert.rejects(db.transaction(workspace, [{text: "SELECT biosaude.require_permission($1,$2,$3,$4)", values: [workspace,"synthetic","synthetic","datasets:read"]}]), {code:"ACCESS_DENIED"});
  assert.deepEqual(events, ["connect", "BEGIN ISOLATION LEVEL SERIALIZABLE", "guard", "scope", "SELECT biosaude.require_permission($1,$2,$3,$4)", "ROLLBACK", "end"]);
});
