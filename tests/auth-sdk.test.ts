import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla";
import { installEphemeralAuthChannel } from "../src/auth/broadcast";
import { createAuthProxy } from "../server/auth/proxy";
import { generateKeyPair, SignJWT } from "jose";
test("SDK oficial: login, sessão, JWT e logout passam pelo proxy de mesma origem",async()=>{
 installEphemeralAuthChannel();
 const origin="https://synthetic.vercel.app";
 const keys=await generateKeyPair("EdDSA");
 const jwt=await new SignJWT({}).setProtectedHeader({alg:"EdDSA",kid:"synthetic"}).setSubject("synthetic-user").setIssuer("https://auth.example.invalid").setAudience("https://auth.example.invalid").setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
 const calls:string[]=[];let signedIn=false;
 const user={id:"synthetic-user",email:"synthetic@example.invalid",name:"Synthetic",emailVerified:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 const data=()=>({user,session:{id:"synthetic-session",userId:user.id,token:"synthetic-session",expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});
 const proxy=createAuthProxy({VERCEL_ENV:"preview",AUTH_APP_ORIGIN:origin,NEON_AUTH_BASE_URL:"https://ep-synthetic.neonauth.us-east-2.aws.neon.build/neondb/auth"},async(url)=>{
  const path=new URL(String(url)).pathname.split("/auth/")[1];calls.push(path);
  if(path==="sign-in/email")signedIn=true;
  const value=path==="token" ? {token:jwt} : path==="sign-out" ? {success:true} : signedIn ? data() : null;
  if(path==="sign-out")signedIn=false;
  return new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
 });
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  const u=new URL(String(url));assert.equal(u.origin,origin);
  const response={statusCode:0,headers:new Headers(),body:"",setHeader(k:string,v:unknown){if(Array.isArray(v))for(const s of v)this.headers.append(k,s);else this.headers.set(k,String(v));},end(s?:string){this.body=s??"";}};
  const headers=Object.fromEntries(new Headers(init?.headers));headers.origin=origin;
  await proxy({url:u.href,method:init?.method??"GET",headers,body:init?.body??undefined},response);
  return new Response(response.body,{status:response.statusCode,headers:response.headers});
 };
 try {
  const auth=createAuthClient(origin+"/api/neon-auth",{adapter:BetterAuthVanillaAdapter({fetchOptions:{credentials:"same-origin",headers:{"X-Force-Fetch":"true"}}})});
  const login=await auth.signIn.email({email:user.email,password:"synthetic-not-real"});assert.equal(login.error,null);
  const session=await auth.getSession({query:{disableCookieCache:true}});assert.equal(session.data?.user.id,user.id);
  const token=await auth.token();assert.ok(token.data?.token===jwt, JSON.stringify({error:token.error,paths:calls,dataKeys:token.data?Object.keys(token.data):[]}));
  const logout=await auth.signOut();assert.equal(logout.error,null);
  assert.ok(calls.includes("sign-in/email"));assert.ok(calls.includes("get-session"));assert.ok(calls.includes("token"));assert.ok(calls.includes("sign-out"));assert.equal(signedIn,false);
 } finally {globalThis.fetch=original;}
});

test("SDK oficial: definição inicial de senha, recuperação e verificação usam as rotas gerenciadas",async()=>{
 const origin="https://synthetic.vercel.app",paths:string[]=[];
 const proxy=createAuthProxy({VERCEL_ENV:"preview",AUTH_APP_ORIGIN:origin,NEON_AUTH_BASE_URL:"https://ep-synthetic.neonauth.us-east-2.aws.neon.build/neondb/auth"},async(url,init)=>{
  const path=new URL(String(url)).pathname.split("/auth/")[1];paths.push(path);
  const body=JSON.parse(String(init?.body));
  if(path==="request-password-reset")assert.equal(body.redirectTo,origin+"/?access=reset");
  if(path==="send-verification-email")assert.equal(body.callbackURL,origin+"/?access=verified");
  if(path==="reset-password"){
   assert.equal(body.newPassword,"synthetic-not-real");
   if(body.token==="expired")return Response.json({code:"INVALID_TOKEN"},{status:400});
   assert.equal(body.token,"synthetic-reset");
  }
  if(path==="email-otp/verify-email")assert.equal(body.otp,"123456");
  return Response.json({status:true});
 });
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  const u=new URL(String(url));assert.equal(u.origin,origin);
  const response={statusCode:0,headers:new Headers(),body:"",setHeader(k:string,v:unknown){if(Array.isArray(v))for(const s of v)this.headers.append(k,s);else this.headers.set(k,String(v));},end(s?:string){this.body=s??"";}};
  const headers=Object.fromEntries(new Headers(init?.headers));headers.origin=origin;
  await proxy({url:u.href,method:init?.method??"GET",headers,body:init?.body??undefined},response);
  return new Response(response.body,{status:response.statusCode,headers:response.headers});
 };
 try{
  const auth=createAuthClient(origin+"/api/neon-auth",{adapter:BetterAuthVanillaAdapter({fetchOptions:{credentials:"same-origin",headers:{"X-Force-Fetch":"true"}}})});
  assert.equal((await auth.requestPasswordReset({email:"synthetic@example.invalid",redirectTo:origin+"/?access=reset"})).error,null);
  assert.equal((await auth.resetPassword({newPassword:"synthetic-not-real",token:"synthetic-reset"})).error,null);
  await assert.rejects(auth.resetPassword({newPassword:"synthetic-not-real",token:"expired"}),{code:"bad_jwt"});
  assert.equal((await auth.sendVerificationEmail({email:"synthetic@example.invalid",callbackURL:origin+"/?access=verified"})).error,null);
  assert.equal((await auth.emailOtp.verifyEmail({email:"synthetic@example.invalid",otp:"123456"})).error,null);
  assert.deepEqual(paths,["request-password-reset","reset-password","reset-password","send-verification-email","email-otp/verify-email"]);
 }finally{globalThis.fetch=original;}
});
