import {test} from "node:test";
import assert from "node:assert/strict";
import {createAuthProxy} from "../server/auth/proxy";
const env={VERCEL_ENV:"preview",NEON_AUTH_BASE_URL:"https://ep-synthetic.neonauth.us-east-2.aws.neon.build/neondb/auth",AUTH_APP_ORIGIN:"https://synthetic.vercel.app"};
function response(){return {statusCode:0,headers:{} as Record<string,unknown>,body:"",setHeader(k:string,v:unknown){this.headers[k]=v;},end(v?:string){this.body=v??"";}};}
const request=(path="get-session",method="GET",headers:Record<string,string>={},body?:unknown)=>({method,url:`/api/auth/proxy?path=${path}`,headers,body});
test("Auth proxy: Production e configuração ausente não abrem rede",async()=>{
 for(const config of [{...env,VERCEL_ENV:"production"},{VERCEL_ENV:"preview"}]){
  let calls=0;const res=response();await createAuthProxy(config,async()=>{calls++;throw Error();})(request(),res);assert.equal(res.statusCode,404);assert.equal(calls,0);
 }
});
test("Auth proxy: destino fixo, cookies limitados, headers e cookies seguros",async()=>{
 const res=response();await createAuthProxy(env,async(url,init)=>{
  assert.equal(String(url),env.NEON_AUTH_BASE_URL+"/get-session");assert.equal(init?.redirect,"error");
  const h=new Headers(init?.headers);assert.equal(h.get("cookie"),"__Secure-neon-auth.session_token=synthetic");assert.equal(h.get("x-neon-auth-middleware"),"true");
  return new Response(JSON.stringify({session:{},user:{id:"synthetic"}}),{headers:{"content-type":"application/json","set-cookie":"__Secure-neon-auth.session_token=synthetic; Domain=.neon.build; Path=/; Secure; HttpOnly; SameSite=None"}});
 })(request("get-session","GET",{cookie:"other=private; __Secure-neon-auth.session_token=synthetic"}),res);
 assert.equal(res.statusCode,200);const cookie=String(res.headers["Set-Cookie"]);assert.ok(!cookie.includes("Domain="));assert.match(cookie,/Path=\/api\/neon-auth/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
});
test("Auth proxy: rejeita CSRF, cadastro, traversal e callback arbitrário",async()=>{
 for(const req of [request("sign-in/email","POST",{"content-type":"application/json"},{email:"synthetic",password:"not-real"}),request("sign-in/email","POST",{origin:"https://attacker.invalid","content-type":"application/json"},{}),request("sign-up/email","POST"),request("../token"),request("sign-in/email","POST",{origin:env.AUTH_APP_ORIGIN,"content-type":"application/json"},{callbackURL:"https://attacker.invalid"})]){
  let calls=0;const res=response();await createAuthProxy(env,async()=>{calls++;throw Error();})(req,res);assert.ok(res.statusCode>=400);assert.equal(calls,0);
 }
});
test("Auth proxy: falhas não expõem detalhes do upstream",async()=>{
 const res=response();await createAuthProxy(env,async()=>{throw Error("private synthetic details");})(request(),res);assert.equal(res.statusCode,503);assert.ok(!res.body.includes("private"));
});
test("Auth proxy: logout limpa os cookies mesmo quando o serviço remoto falha",async()=>{
 const res=response();await createAuthProxy(env,async()=>{throw Error("synthetic outage");})(request("sign-out","POST",{origin:env.AUTH_APP_ORIGIN,"content-type":"application/json",cookie:"__Secure-neon-auth.session_token=synthetic"},{}),res);
 assert.equal(res.statusCode,503);assert.match(String(res.headers["Set-Cookie"]),/Max-Age=0/);
});
