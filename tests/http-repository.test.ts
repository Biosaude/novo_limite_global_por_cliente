import { test } from "node:test";
import assert from "node:assert/strict";
import { FinancialHttpClient, HttpDatasetRepository } from "../src/persistencia/http";
const workspace="a0000000-0000-4000-8000-000000000001";
const ok=(value:unknown,etag='"0"')=>new Response(JSON.stringify(value),{headers:{"content-type":"application/json",etag}});
function client(send:typeof fetch, extra={}) {return new FinancialHttpClient({workspace,token:async()=>"synthetic-token",active:()=>true,send,...extra});}
test("HTTP: token e organização em headers, ETag forte e confirmação da importação",async()=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const c=client(async(url,init)=>{calls.push({url:String(url),init});return ok({},init?.method==="POST"?'"1"':'"0"');});
 await c.request("active");await c.request("imports","POST",{confirm:true});
 assert.equal(calls[1].url,"/api/financial/imports");
 const h=new Headers(calls[1].init?.headers);
 assert.equal(h.get("authorization"),"Bearer synthetic-token");assert.equal(h.get("x-workspace-id"),workspace);assert.equal(h.get("if-match"),'"0"');
 assert.equal(calls[1].init?.redirect,"error");assert.equal(calls[1].init?.credentials,"same-origin");
});
test("HTTP: conflito e falha de transporte bloqueiam novas escritas sem retry",async()=>{
 for(const failure of [()=>new Response("{}",{status:409}),()=>{throw Error("synthetic transport");}]) {
  let calls=0;const c=client(async()=>{if(calls++===0)return ok({});return failure();});
  await c.request("active");await assert.rejects(c.request("active","DELETE"));
  await assert.rejects(c.request("active","DELETE"),{code:"REVISION_CONFLICT"});assert.equal(calls,2);
 }
});
test("HTTP: leitura de revisão diferente não substitui silenciosamente o contexto",async()=>{
 let n=0;const c=client(async()=>ok({},`"${n++}"`));await c.request("active");
 await assert.rejects(c.request("versions"),{code:"REVISION_CONFLICT"});
 await assert.rejects(c.request("active","DELETE"),{code:"REVISION_CONFLICT"});
});
test("HTTP: nega escrita sem revisão, ETag fraco e payload excessivo",async()=>{
 const c=client(async()=>ok({},'W/"0"'));
 await assert.rejects(c.request("active","DELETE"),{code:"PRECONDITION_REQUIRED"});
 await assert.rejects(c.request("active"),{code:"UNAVAILABLE"});
 const good=client(async()=>ok({}));await good.request("active");
 await assert.rejects(good.request("imports","POST",{value:"x".repeat(3_000_001)}),{code:"PAYLOAD_TOO_LARGE"});
});
test("HTTP: sessão invalidada descarta respostas pendentes, sem gravar cache local",async()=>{
 let active=true;const c=client(async()=>{active=false;return ok({dataset:{}});},{active:()=>active});
 await assert.rejects(c.request("active"),{code:"UNAUTHENTICATED"});
});
test("HTTP: erros são sanitizados e 401 invalida a sessão",async()=>{
 let invalidated=false;
 const c=client(async()=>new Response("private synthetic details",{status:401}),{onUnauthorized:()=>{invalidated=true;}});
 await assert.rejects(c.request("active"),error=>String(error).includes("sessão expirou")&&!String(error).includes("private"));assert.ok(invalidated);
 const denied=client(async()=>new Response("private",{status:403}));await assert.rejects(denied.request("active"),{code:"ACCESS_DENIED"});
});
test("HTTP: paginação do histórico e envio de notas no contrato de revisão",async()=>{
 const urls:string[]=[];let body:unknown;
 const c=client(async(url,init)=>{
  urls.push(String(url));if(init?.method==="PATCH"){body=JSON.parse(String(init.body));return ok({},'"1"');}
  return ok({versions:[]});
 });
 const repo=new HttpDatasetRepository(c);assert.deepEqual(await repo.history(),[]);
 await repo.updateReviews({id:"v1",reviews:{i:{note:"conferido",reviewedAt:"2026-01-01"}}} as never);
 assert.equal(urls[0],"/api/financial/versions?limit=100&offset=0");assert.deepEqual(body,{versionId:"v1",reviews:{i:"conferido"}});
});
