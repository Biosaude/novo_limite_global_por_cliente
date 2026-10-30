import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const exec = promisify(execFile);
async function entries(directory: string): Promise<string[]> {
  const files = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(files.map(file => file.isDirectory()
    ? entries(join(directory, file.name))
    : Promise.resolve(file.name.endsWith(".ts") ? [join(directory, file.name)] : [])))).flat();
}

test("serverless: JavaScript emitido carrega e executa todas as APIs em Node ESM sem loader TS", async () => {
  const root = resolve(".");
  const output = await mkdtemp(join(tmpdir(), "biosaude-server-runtime-"));
  try {
    const configFile = ts.readConfigFile(join(root, "tsconfig.server.json"), ts.sys.readFile);
    assert.equal(configFile.error, undefined);
    const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
    const api = await entries(join(root, "api"));
    const program = ts.createProgram(api, { ...config.options, noEmit: false, noEmitOnError: true, rootDir: root, outDir: output });
    const emitted = program.emit();
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root, getCanonicalFileName: name => name, getNewLine: () => "\n",
    }));
    assert.equal(emitted.emitSkipped, false);
    await writeFile(join(output, "package.json"), JSON.stringify({ type: "module" }));
    await symlink(join(root, "node_modules"), join(output, "node_modules"), "dir");
    const generated = api.map(file => relative(root, file).replace(/\.ts$/, ".js").replaceAll("\\", "/"));
    for (const file of generated) assert.ok((await readFile(join(output, file), "utf8")).length > 0);
    // Deliberately no tsx, loader, bundler or extension-resolution flag in this child.
    // Loading the financial entry also resolves its complete transitive shared-domain graph.
    await writeFile(join(output, "smoke.mjs"), `
      import assert from 'node:assert/strict';
      let send = async () => {throw Error('Unexpected external network access');};
      globalThis.fetch = (...args) => send(...args);
      const handlers = new Map();
      for (const file of ${JSON.stringify(generated)}) {
        const module = await import('./' + file);
        assert.equal(typeof module.default, 'function', file);
        handlers.set(file, module.default);
      }
      function response() { return {statusCode: 0, body: '', headers: {}, setHeader(k,v) {this.headers[k]=v;}, end(v) {this.body=v??'';}}; }
      process.env.VERCEL_ENV = 'production';
      process.env.FINANCIAL_API_ENABLED = 'true';
      send = async () => {throw Error('Unexpected external network access');};
      for (const [file, handler] of handlers) {
        const res = response();
        await handler({method:'GET', url:'/api/health', headers:{}}, res);
        assert.equal(res.statusCode, file === 'api/health.js' ? 200 : 404, file);
        if (file === 'api/health.js') assert.deepEqual(JSON.parse(res.body), {status:'ok', persistence:'local', financialApi:'disabled'});
      }
      process.env.VERCEL_ENV = 'preview';
      process.env.FINANCIAL_API_ENABLED = 'false';
      process.env.NEON_AUTH_BASE_URL = 'https://synthetic.neon.build/neondb/auth';
      process.env.AUTH_APP_ORIGIN = 'https://synthetic.vercel.app';
      const proxy = handlers.get('api/auth/proxy.js');
      let calls = 0;
      for (const path of ['get-session', 'request-password-reset', 'send-verification-email']) {
        send = async (url, init) => {
          calls++;
          assert.equal(String(url), process.env.NEON_AUTH_BASE_URL + '/' + path);
          assert.equal(init.method, path === 'get-session' ? 'GET' : 'POST');
          return Response.json(path === 'get-session' ? {session:null, user:null} : {status:true});
        };
        const res = response();
        await proxy({method:path==='get-session'?'GET':'POST', url:'/api/neon-auth/'+path,
          headers:{origin:process.env.AUTH_APP_ORIGIN, 'content-type':'application/json'},
          body: {email:'synthetic@example.invalid'}}, res);
        assert.equal(res.statusCode, 200, path);
      }
      assert.equal(calls, 3);
      send = async () => {throw Error('Unexpected external network access');};
      const denied = response();
      await handlers.get('api/financial/[operation].js')({method:'GET', url:'/api/financial/active', headers:{}}, denied);
      assert.equal(denied.statusCode, 404);
      const {createFinancialHandler} = await import('./server/financial/handler.js');
      const workspace = '50000000-0000-4000-8000-000000000001';
      const financial = createFinancialHandler({
        environment: {VERCEL_ENV:'preview', FINANCIAL_API_ENABLED:'true'},
        identity: {verify:async () => ({issuer:'https://synthetic.invalid',subject:'synthetic',actor:'synthetic'})},
        database: {transaction:async (scope, statements) => {
          assert.equal(scope, workspace);
          assert.ok(statements.every(s => s.text.startsWith('SELECT ')));
          return statements.map(s => s.text.startsWith('SELECT COALESCE(') ? [{revision:'0'}] : []);
        }},
      });
      for (const [body, framing, status] of [
        [Buffer.alloc(0), {}, 200], [Buffer.alloc(0), {'content-length':'0'}, 200],
        [Buffer.from('{}'), {}, 400], [Buffer.alloc(0), {'content-length':'2'}, 400],
        [null, {'content-length':'4'}, 400], [Buffer.alloc(0), {'transfer-encoding':'chunked'}, 400],
      ]) {
        const res = response();
        await financial({method:'GET',url:'/api/financial/active',body,
          headers:{authorization:'Bearer synthetic','x-workspace-id':workspace,...framing}}, res);
        assert.equal(res.statusCode,status);
        assert.deepEqual(JSON.parse(res.body), status===200 ? {dataset:null} : {code:'INVALID_INPUT'});
        if (status===200) assert.equal(res.headers.ETag, '"0"');
      }
      console.log('Node ESM: ' + handlers.size + ' API entries loaded; synthetic auth paths and environment gates verified');
    `);
    const result = await exec(process.execPath, [join(output, "smoke.mjs")], {
      env: { PATH: process.env.PATH }, timeout: 30_000, maxBuffer: 1024 * 1024,
    });
    assert.match(result.stdout, /API entries loaded/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
