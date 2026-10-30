/** Requires an external @vercel/node installation, never deployment credentials. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localRequire = createRequire(join(root, "package.json"));
const builderRequire = process.env.VERCEL_NODE_BUILDER_PATH
  ? createRequire(join(resolve(process.env.VERCEL_NODE_BUILDER_PATH), "package.json")) : localRequire;
let builderPath;
try { builderPath = builderRequire.resolve("@vercel/node"); }
catch { throw Error("Install @vercel/node@29.0.0 in a temporary directory and set VERCEL_NODE_BUILDER_PATH to that directory. No Vercel credentials are needed."); }
const { build, startDevServer } = builderRequire(builderPath);
const { FileFsRef, FileBlob } = createRequire(builderPath)("@vercel/build-utils");
const { generateKeyPair, exportJWK, SignJWT } = await import(pathToFileURL(localRequire.resolve("jose")).href);
const directory = await mkdtemp(join(tmpdir(), "biosaude-real-vercel-"));
let running;
try {
  const work = join(directory, "work"), artifact = join(directory, "artifact");
  await mkdir(work); await mkdir(artifact);
  const files = {};
  async function add(folder) {
    for (const file of await readdir(join(root, folder), { withFileTypes: true })) {
      const name = folder ? folder + "/" + file.name : file.name;
      if (file.isDirectory()) await add(name);
      else files[name] = new FileFsRef({ fsPath: join(root, name) });
    }
  }
  for (const folder of ["api", "server", "src", "migrations"]) await add(folder);
  for (const name of ["package.json", "package-lock.json", "tsconfig.json", "tsconfig.server.json"])
    files[name] = new FileFsRef({ fsPath: join(root, name) });
  // Build the actual dynamic API path with a test-only real JWT/PGlite bootstrap.
  const entrypoint = "api/financial/[operation].ts";
  files[entrypoint] = new FileFsRef({ fsPath: join(root, "tests/runtime/financial.ts") });
  await promisify(execFile)("cp", ["-a", join(root, "node_modules"), join(work, "node_modules")]);
  const { output } = await build({ files, entrypoint, workPath: work,
    config: { includeFiles: ["migrations/*.sql"], projectSettings: { installCommand: "", buildCommand: "true", nodeVersion: "24.x" } },
    meta: {}, considerBuildCommand: true });
  for (const [name, file] of Object.entries(output.files)) {
    const target = join(artifact, name); await mkdir(dirname(target), { recursive: true });
    const blob = await FileBlob.fromStream({ stream: await file.toStream() }); await writeFile(target, blob.data);
  }
  const keys = await generateKeyPair("EdDSA");
  const jwks = JSON.stringify({ keys: [{ ...(await exportJWK(keys.publicKey)), kid: "runtime-test", alg: "EdDSA" }] });
  const token = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA", kid: "runtime-test" }).setSubject("runtime-user")
    .setIssuer("https://runtime.synthetic.invalid/").setAudience("runtime-test").setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
  running = await startDevServer({ files: {}, entrypoint: output.handler, workPath: artifact, config: {},
    meta: { env: { FINANCIAL_TEST_PUBLIC_JWKS: jwks } } });
  async function get(query = "", headers = {}, body) {
    const started = performance.now();
    return new Promise((resolveRequest, reject) => {
      const req = request({ hostname: "127.0.0.1", port: running.port, path: "/api/financial/active" + query, method: "GET",
        headers: { authorization: "Bearer " + token, "x-workspace-id": "50000000-0000-4000-8000-000000000001", ...headers } }, res => {
        let raw = ""; res.setEncoding("utf8"); res.on("data", chunk => { raw += chunk; }); res.on("error", reject);
        res.on("end", () => { try { resolveRequest({ status: res.statusCode, data: JSON.parse(raw), reason: res.headers["x-test-validation"], kind: res.headers["x-test-body"], query: res.headers["x-test-query"], roundTripMs: Math.round(performance.now()-started), elapsedMs: Number(res.headers["x-test-elapsed"]), identityMs: Number(res.headers["x-test-identity"]), authorizationMs: Number(res.headers["x-test-authorization"]), loadMs: Number(res.headers["x-test-load"]) }); } catch { reject(Error("Official runtime returned a non-JSON response")); } });
      });
      req.on("error", reject); req.end(body);
    });
  }
  const normal = await get(); assert.equal(normal.status, 200); assert.deepEqual(normal.data, { dataset: null });
  const binary = await get("", { "content-type": "application/octet-stream", "content-length": "0" });
  assert.equal(binary.status, 200); assert.equal(binary.kind, "buffer_empty");
  const json = await get("", { "content-type": "application/json", "content-length": "0" });
  assert.equal(json.status, 400); assert.equal(json.reason, "body_nonempty"); assert.equal(json.kind, "object_empty");
  const routing = await get("?operation=active"); assert.equal(routing.status, 400); assert.equal(routing.reason, "query_unexpected");
  assert.equal(routing.query, "operation_only");
  const duplicate = await get("?operation=active&operation=active"); assert.equal(duplicate.reason, "query_duplicate");
  const workspace = await get("", { "x-workspace-id": "invalid" }); assert.equal(workspace.reason, "workspace_header");
  const content = await get("", { "content-type": "application/json", "content-length": "2" }, "{}");
  assert.equal(content.status, 400); assert.equal(content.reason, "body_nonempty");
  const hidden = await get("", { "content-type": "application/json", "content-length": "4" }, "null");
  assert.equal(hidden.status, 400); assert.ok(["body_nonempty", "body_framing"].includes(hidden.reason));
  console.log(JSON.stringify({event:"SYNTHETIC_RUNTIME_TIMING", roundTripMs:normal.roundTripMs,handlerMs:normal.elapsedMs,identityMs:normal.identityMs,authorizationMs:normal.authorizationMs,loadMs:normal.loadMs}));
  console.log("Official builder + official runtime helpers + signed Ed25519 JWT + disposable PostgreSQL: 8 cases passed.");
  console.log("Default GET: 200. Empty JSON and operation query: distinct reproduced 400s; neither is confirmed as the Preview request shape.");
} finally {
  if (running) await running.shutdown();
  await rm(directory, { recursive: true, force: true });
}
