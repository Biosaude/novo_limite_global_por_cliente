import {test} from "node:test";
import assert from "node:assert/strict";
import {accessReturn} from "../src/auth/recovery";
import {createAuthProxy} from "../server/auth/proxy";
const origin="https://synthetic.vercel.app";
const env={VERCEL_ENV:"preview",AUTH_APP_ORIGIN:origin,NEON_AUTH_BASE_URL:"https://ep-synthetic.neonauth.us-east-2.aws.neon.build/neondb/auth"};
function response(){return{statusCode:0,body:"",headers:{} as Record<string,unknown>,setHeader(k:string,v:unknown){this.headers[k]=v;},end(value?:string){this.body=value??"";}};}
function req(path:string,body:unknown){return{method:"POST",url:`/api/auth/proxy?path=${path}`,headers:{origin,"content-type":"application/json"},body};}
test("retorno de acesso: token opaco sai da URL e não é validado no cliente",()=>{
 const r=accessReturn(origin+"/?access=reset&token=synthetic-reset&other=keep");assert.equal(r.step,"reset");assert.equal(r.token,"synthetic-reset");assert.equal(r.clean,"/?other=keep");
 for(const query of ["access=reset","access=reset&token=one&token=two","access=reset&token=synthetic&error=INVALID_TOKEN"]){const r=accessReturn(origin+"/?"+query);assert.equal(r.step,"request");assert.equal(r.token,"");assert.ok(!r.clean.includes("token"));}
 const verified=accessReturn(origin+"/?access=verified");assert.equal(verified.step,null);assert.match(verified.message,/serviço confirmará/);
});
test("recuperação: destino e retorno fixos; tokens e senha apenas em POST",async()=>{
 const res=response();await createAuthProxy(env,async(url,init)=>{
  assert.equal(String(url),env.NEON_AUTH_BASE_URL+"/request-password-reset");assert.deepEqual(JSON.parse(String(init?.body)),{email:"synthetic@example.invalid",redirectTo:origin+"/?access=reset"});return Response.json({status:true});
 })(req("request-password-reset",{email:"synthetic@example.invalid"}),res);assert.equal(res.statusCode,200);
 const reset=response();await createAuthProxy(env,async(url,init)=>{assert.ok(!String(url).includes("token="));assert.deepEqual(JSON.parse(String(init?.body)),{newPassword:"synthetic-not-real",token:"synthetic-reset"});return Response.json({status:true});})(req("reset-password",{newPassword:"synthetic-not-real",token:"synthetic-reset"}),reset);assert.equal(reset.statusCode,200);
});
test("recuperação: rejeita redirecionamento externo, senha inválida, token vazio e campos administrativos",async()=>{
 for(const request of [req("request-password-reset",{email:"synthetic@example.invalid",redirectTo:"https://attacker.invalid"}),req("send-verification-email",{email:"synthetic@example.invalid",callbackURL:origin+"/unexpected"}),req("reset-password",{newPassword:"short",token:"x"}),req("reset-password",{newPassword:"synthetic-not-real",token:""}),req("email-otp/verify-email",{email:"synthetic@example.invalid",otp:"123456",emailVerified:true})]) {
  let calls=0;const res=response();await createAuthProxy(env,async()=>{calls++;return Response.json({});})(request,res);assert.equal(res.statusCode,400);assert.equal(calls,0);
 }
});
test("e-mail: solicita método configurado e valida código somente no serviço",async()=>{
 for(const path of ["send-verification-email","email-otp/verify-email"]){const res=response();await createAuthProxy(env,async(url,init)=>{
  assert.equal(String(url),env.NEON_AUTH_BASE_URL+"/"+path);const value=JSON.parse(String(init?.body));assert.equal(value.email,"synthetic@example.invalid");
  if(path==="send-verification-email")assert.equal(value.callbackURL,origin+"/?access=verified");else assert.equal(value.otp,"123456");return Response.json({status:true});
 })(req(path,{email:"synthetic@example.invalid",...(path==="email-otp/verify-email"?{otp:"123456"}:{})}),res);assert.equal(res.statusCode,200);}
});
test("recuperação: e-mail desconhecido e já verificado têm resposta genérica",async()=>{
 for(const code of ["USER_NOT_FOUND","EMAIL_ALREADY_VERIFIED"]){const res=response();await createAuthProxy(env,async()=>Response.json({code,message:"private"},{status:400}))(req("request-password-reset",{email:"synthetic@example.invalid"}),res);assert.equal(res.statusCode,200);assert.deepEqual(JSON.parse(res.body),{status:true});}
});
test("recuperação: SMTP/configuração indisponível, limite e token expirado são sanitizados",async()=>{
 for(const [path,status,code,expected] of [["request-password-reset",400,"RESET_PASSWORD_DISABLED","EMAIL_SERVICE_UNAVAILABLE"],["send-verification-email",429,"RATE_LIMIT","TOO_MANY_REQUESTS"],["reset-password",400,"INVALID_TOKEN","INVALID_TOKEN"],["email-otp/verify-email",400,"INVALID_OTP","VERIFICATION_FAILED"]] as const){
  const res=response();await createAuthProxy(env,async()=>Response.json({code,message:"private details"},{status}))(req(path,path==="reset-password"?{newPassword:"synthetic-not-real",token:"synthetic-reset"}:path==="email-otp/verify-email"?{email:"synthetic@example.invalid",otp:"123456"}:{email:"synthetic@example.invalid"}),res);assert.equal(JSON.parse(res.body).code,expected);assert.ok(!res.body.includes("private"));
 }
});
test("login: verificação pendente é clara sem revelar senha ou estado do cadastro",async()=>{
 const res=response();await createAuthProxy(env,async()=>Response.json({code:"EMAIL_NOT_VERIFIED",message:"private"},{status:403}))(req("sign-in/email",{email:"synthetic@example.invalid",password:"synthetic-not-real"}),res);assert.equal(res.statusCode,403);assert.equal(JSON.parse(res.body).code,"EMAIL_NOT_VERIFIED");assert.ok(!res.body.includes("private"));
});
test("novos fluxos permanecem bloqueados em Production",async()=>{
 for(const path of ["request-password-reset","reset-password","send-verification-email","email-otp/verify-email"]){let calls=0;const res=response();await createAuthProxy({...env,VERCEL_ENV:"production"},async()=>{calls++;return Response.json({});})(req(path,{}),res);assert.equal(res.statusCode,404);assert.equal(calls,0);}
});
