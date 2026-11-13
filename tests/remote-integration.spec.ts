import {test,expect,type Page} from "@playwright/test";
import {PGlite} from "@electric-sql/pglite";
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from "jose";
import {migrationPlan} from "../server/db/migration-plan";
import {createDatabase,type Row} from "../server/db/client";
import {createIdentityVerifier} from "../server/security/identity";
import {createFinancialHandler} from "../server/financial/handler";
import {createAuthProxy} from "../server/auth/proxy";
import {fixture} from "./fixtures";
test.skip(process.env.REMOTE_E2E!=="true","Executar com build remoto e REMOTE_E2E=true.");
test("navegador: SDK, importação e outra sessão compartilham PostgreSQL sintético com isolamento",async({page,browser})=>{
 test.setTimeout(120000);
 const pg=new PGlite();
 const workspace=crypto.randomUUID(),issuer="https://auth.example.invalid";
 for(const m of await migrationPlan())await pg.exec(m.sql);
 await pg.exec("CREATE ROLE browser_test NOSUPERUSER NOBYPASSRLS NOLOGIN; GRANT USAGE ON SCHEMA biosaude TO browser_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA biosaude TO browser_test; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA biosaude TO browser_test;");
 await pg.query("INSERT INTO biosaude.workspaces(id,name) VALUES($1,'Synthetic')",[workspace]);
 await pg.query("INSERT INTO biosaude.identity_memberships(workspace_id,issuer,subject,permissions,provisioned_by) VALUES($1,$2,'synthetic-user',ARRAY['datasets:read','datasets:write','credit:read','credit:write'],'synthetic')",[workspace,issuer]);
 const keys=await generateKeyPair("EdDSA");
 const token=await new SignJWT({}).setProtectedHeader({alg:"EdDSA",kid:"synthetic"}).setIssuer(issuer).setAudience(issuer).setSubject("synthetic-user").setIssuedAt().setExpirationTime("10m").sign(keys.privateKey);
 const environment={VERCEL_ENV:"preview",FINANCIAL_API_ENABLED:"true",FINANCIAL_AUTH_ISSUER:issuer,FINANCIAL_AUTH_AUDIENCE:issuer,FINANCIAL_AUTH_JWKS_URL:issuer+"/jwks"};
 const db=createDatabase({DATABASE_URL:"postgresql://synthetic:NOT_REAL@synthetic.invalid/neondb?sslmode=require"},()=>({async transaction(statements){return pg.transaction(async tx=>{await tx.exec("SET LOCAL ROLE browser_test");const rows:Row[][]=[];for(const s of statements)rows.push((await tx.query(s.text,[...(s.values??[])])).rows as Row[]);return rows;});}}));
 const identity=createIdentityVerifier(environment,createLocalJWKSet({keys:[{...(await exportJWK(keys.publicKey)),kid:"synthetic",alg:"EdDSA"}]}));
 const handler=createFinancialHandler({environment,identity,database:db});
 const errors:string[]=[];
 async function routes(p:Page){
  p.on("pageerror",e=>errors.push(e.message));let signed=false;
  const proxy=createAuthProxy({VERCEL_ENV:"development",AUTH_APP_ORIGIN:"http://127.0.0.1:4173",NEON_AUTH_BASE_URL:"https://ep-synthetic.neonauth.us-east-2.aws.neon.build/neondb/auth"},async(url,init)=>{
   const path=new URL(String(url)).pathname.split("/auth/")[1];
   const user={id:"synthetic-user",email:"synthetic@example.invalid",name:"Synthetic",emailVerified:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   const headers=new Headers({"content-type":"application/json"});
   if(path==="sign-in/email"){signed=true;headers.append("set-cookie","__Secure-neon-auth.session_token=synthetic-session; Domain=.neon.build; Path=/; Secure; HttpOnly; SameSite=None");}
   const cookie=new Headers(init?.headers).get("cookie")??"";
   const authenticated=signed && (path==="sign-in/email" || cookie.includes("session_token=synthetic-session"));
   let value:unknown=authenticated ? {user,session:{id:"session",userId:user.id,token:"synthetic-session",expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}} : null;
   if(path==="token")value=authenticated ? {token} : null;
   if(path==="sign-out"){signed=false;value={success:true};}
   return new Response(JSON.stringify(value),{headers});
  });
  await p.route("**/api/neon-auth/**",async route=>{
   const req=route.request();const headers:Record<string,string>={};let body="",status=0;
   await proxy({method:req.method(),url:req.url(),headers:await req.allHeaders(),body:req.postData()??undefined},{statusCode:0,setHeader(k,v){headers[k]=Array.isArray(v)?v.join("\n"):String(v);},end(v){body=v??"";status=this.statusCode;}});
   await route.fulfill({status,headers,body});
  });
  await p.route("**/api/financial/**",async route=>{
   const req=route.request();const headers:Record<string,string>={};let body="",status=0;
   await handler({method:req.method(),url:req.url(),headers:req.headers(),body:req.postData()??undefined},{statusCode:0,setHeader(k,v){headers[k]=v;},end(v){body=v??"";status=this.statusCode;}});
   await route.fulfill({status,headers,body});
  });
 }
 async function login(p:Page){await p.goto("/");await p.getByLabel("E-mail",{exact:true}).fill("synthetic@example.invalid");await p.getByLabel("Senha",{exact:true}).fill("synthetic-not-real");await p.getByRole("button",{name:"Entrar",exact:true}).click();await p.getByLabel("Identificador da organização").fill(workspace);await p.getByRole("button",{name:"Abrir organização",exact:true}).click();await expect(p.getByRole("heading",{level:1,name:"Dashboard Limite Global por Cliente · Biosaúde"})).toBeVisible();}
 const second=await browser.newContext();
 try{
  await routes(page);await login(page);
  await page.getByRole("navigation").getByRole("button",{name:"Gerenciar Base",exact:true}).click();
  await page.getByLabel("Data de referência da posição").fill("2026-10-19");
  await page.getByLabel("Selecionar planilha Excel").setInputFiles({name:"SYNTHETIC.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:await fixture()});
  await page.getByRole("checkbox",{name:/Confirmar utilização da base/}).check();
  await page.getByRole("button",{name:"Atualizar Dashboard",exact:true}).click();
  await expect(page.getByText(/Dashboard atualizado com sucesso: 6 registros/)).toBeVisible({timeout:30000});
  await page.getByRole("button",{name:"Sair",exact:true}).click();await expect(page.getByRole("button",{name:"Entrar",exact:true})).toBeVisible();
  const other=await second.newPage();await routes(other);await login(other);
  await expect(other.locator(".update-data")).toContainText("6 registros");
  expect(await other.evaluate(()=>localStorage.getItem("better-auth.message"))).toBeNull();
  const names=await other.evaluate(async()=> (await indexedDB.databases()).map(d=>d.name));assertNoLegacy(names);
  await other.getByRole("button",{name:"Usar modo local isolado",exact:true}).click();
  await expect(other.locator(".update-data")).toContainText("0 registros");
  await other.getByRole("navigation").getByRole("button",{name:"Gerenciar Base",exact:true}).click();
  await other.getByLabel("Data de referência da posição").fill("2026-10-19");
  await other.getByLabel("Selecionar planilha Excel").setInputFiles({name:"LOCAL_SYNTHETIC.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:await fixture()});
  await other.getByLabel("Lembrar a nova base neste navegador").check();
  await other.getByRole("checkbox",{name:/Confirmar utilização da base/}).check();
  await other.getByRole("button",{name:"Atualizar Dashboard",exact:true}).click();
  await expect(other.getByText(/Dashboard atualizado com sucesso: 6 registros/)).toBeVisible();
  await other.getByLabel("Identificador da organização").fill(crypto.randomUUID());await other.getByRole("button",{name:"Abrir organização",exact:true}).click();
  await expect(other.getByRole("alert")).toContainText("Sem permissão");await expect(other.locator(".update-data")).toContainText("0 registros");
  await other.getByRole("button",{name:"Usar modo local isolado",exact:true}).click();
  await expect(other.locator(".update-data")).toContainText("0 registros");
  await other.getByLabel("Identificador da organização").fill(workspace);await other.getByRole("button",{name:"Abrir organização",exact:true}).click();
  await expect(other.locator(".update-data")).toContainText("6 registros");
  await pg.query("UPDATE biosaude.identity_memberships SET revoked_at=now() WHERE workspace_id=$1",[workspace]);
  await other.getByLabel("Identificador da organização").fill(workspace);await other.getByRole("button",{name:"Abrir organização",exact:true}).click();await expect(other.getByRole("alert")).toContainText("Sem permissão");
  await other.getByRole("button",{name:"Sair",exact:true}).click();await expect(other.getByRole("button",{name:"Entrar",exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 }finally{await second.close();await pg.close();}
});
function assertNoLegacy(names:(string|undefined)[]){expect(names).not.toContain("biosaude-financeiro");}
