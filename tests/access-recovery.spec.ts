import {test,expect,type Page} from "@playwright/test";
import {createAuthProxy} from "../server/auth/proxy";
test.skip(process.env.REMOTE_E2E!=="true","Requer build remoto; serviço Auth simulado, sem e-mails reais.");
const email="synthetic@example.invalid",newPassword="synthetic-new-password";
async function service(page:Page,options:{mail?:boolean;password?:string|null}={}){
 const state={password:options.password??null,verified:false,used:false,financial:0,mail:options.mail!==false,callback:"",resets:0};let signed=false;
 const proxy=createAuthProxy({VERCEL_ENV:"development",AUTH_APP_ORIGIN:"http://127.0.0.1:4173",NEON_AUTH_BASE_URL:"https://ep-synthetic.neonauth.us-east-2.aws.neon.build/neondb/auth"},async(url,init)=>{
  const path=new URL(String(url)).pathname.split("/auth/")[1],body=init?.body?JSON.parse(String(init.body)):{};
  if(path==="request-password-reset"||path==="send-verification-email"){
   if(!state.mail)return Response.json({code:"RESET_PASSWORD_DISABLED",message:"private config"},{status:400});
   state.callback=body.redirectTo??body.callbackURL;return Response.json({status:true});
  }
  if(path==="reset-password"){
   if(body.token!=="synthetic-reset"||state.used)return Response.json({code:"INVALID_TOKEN"},{status:400});
   state.password=body.newPassword;state.used=true;state.resets++;return Response.json({status:true});
  }
  if(path==="email-otp/verify-email"){
   if(body.otp!=="123456")return Response.json({code:"INVALID_OTP"},{status:400});
   state.verified=true;return Response.json({status:true});
  }
  if(path==="sign-in/email"){
   if(!state.password||body.password!==state.password)return Response.json({code:"INVALID_EMAIL_OR_PASSWORD"},{status:401});
   if(!state.verified)return Response.json({code:"EMAIL_NOT_VERIFIED"},{status:403});signed=true;
  }
  if(path==="sign-out")signed=false;
  const user={id:"synthetic-user",email,name:"Synthetic",emailVerified:state.verified,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  return Response.json(signed?{user,session:{id:"synthetic",userId:user.id,token:"synthetic-session",expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}:null);
 });
 await page.route("**/api/neon-auth/**",async route=>{
  const req=route.request(),headers:Record<string,string>={};let body="",status=0;
  await proxy({method:req.method(),url:req.url(),headers:await req.allHeaders(),body:req.postData()??undefined},{statusCode:0,setHeader(k,v){headers[k]=Array.isArray(v)?v.join("\n"):String(v);},end(v){body=v??"";status=this.statusCode;}});
  await route.fulfill({status,headers,body});
 });
 await page.route("**/api/financial/**",async route=>{state.financial++;await route.fulfill({status:403,contentType:"application/json",body:'{"code":"ACCESS_DENIED"}'});});
 return state;
}
test("primeiro acesso: conta sem senha define senha por link e verifica e-mail por código",async({page})=>{
 const state=await service(page);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");await page.getByRole("button",{name:"Definir ou recuperar senha",exact:true}).click();
 await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByRole("button",{name:"Solicitar link de senha",exact:true}).click();
 await expect(page.getByRole("status")).toContainText("Se o endereço estiver cadastrado");expect(state.callback).toBe("http://127.0.0.1:4173/?access=reset");
 await page.goto("/?access=reset&token=synthetic-reset");await expect(page.getByLabel("Nova senha",{exact:true})).toBeVisible();expect(page.url()).not.toContain("token=");
 await page.getByLabel("Nova senha",{exact:true}).fill(newPassword);await page.getByLabel("Confirmar nova senha").fill("synthetic-different");await page.getByRole("button",{name:"Salvar nova senha",exact:true}).click();await expect(page.getByRole("alert")).toContainText("coincidir");expect(state.resets).toBe(0);
 await page.getByLabel("Confirmar nova senha").fill(newPassword);await page.getByRole("button",{name:"Salvar nova senha",exact:true}).click();await expect(page.getByRole("status")).toContainText("Senha definida pelo serviço");expect(state.password).toBe(newPassword);
 await page.getByRole("button",{name:"Verificar meu e-mail",exact:true}).click();await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByRole("button",{name:"Enviar ou reenviar verificação"}).click();await expect(page.getByRole("status")).toContainText("Se o endereço estiver cadastrado");expect(state.callback).toBe("http://127.0.0.1:4173/?access=verified");
 await page.getByLabel("Código de verificação").fill("000000");await page.getByRole("button",{name:"Confirmar código"}).click();await expect(page.getByRole("alert")).toContainText("confirmar o código");
 await page.getByLabel("Código de verificação").fill("123456");await page.getByRole("button",{name:"Confirmar código"}).click();await expect(page.getByRole("status")).toContainText("E-mail verificado pelo serviço");
 await page.getByRole("button",{name:"Voltar ao login"}).click();await page.getByLabel("Senha",{exact:true}).fill(newPassword);await page.getByRole("button",{name:"Entrar",exact:true}).click();await expect(page.getByLabel("Identificador da organização")).toBeVisible();expect(state.financial).toBe(0);expect(errors).toEqual([]);
});
test("recuperação: link expirado ou reutilizado não define senha",async({page})=>{
 const state=await service(page);
 for(const token of ["expired","synthetic-reset"]){
  if(token==="synthetic-reset")state.used=true;
  await page.goto("/?access=reset&token="+token);await page.getByLabel("Nova senha",{exact:true}).fill(newPassword);await page.getByLabel("Confirmar nova senha").fill(newPassword);await page.getByRole("button",{name:"Salvar nova senha"}).click();
  await expect(page.getByRole("alert")).toContainText("Link inválido, expirado ou já utilizado");expect(page.url()).not.toContain("token=");
 }
 expect(state.resets).toBe(0);expect(state.financial).toBe(0);
});
test("recuperação: envio indisponível informa bloqueio sem afirmar entrega de e-mail",async({page})=>{
 const state=await service(page,{mail:false});await page.goto("/");await page.getByRole("button",{name:"Definir ou recuperar senha",exact:true}).click();await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByRole("button",{name:"Solicitar link de senha"}).click();await expect(page.getByRole("alert")).toContainText("Envio indisponível");await expect(page.getByRole("status")).toHaveCount(0);expect(state.password).toBeNull();expect(state.financial).toBe(0);
});
test("verificação pendente: login exige confirmação e retorno de link não concede acesso",async({page})=>{
 const state=await service(page,{password:newPassword});await page.goto("/?access=verified");await expect(page.getByRole("status")).toContainText("serviço confirmará");await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByLabel("Senha",{exact:true}).fill(newPassword);await page.getByRole("button",{name:"Entrar",exact:true}).click();await expect(page.getByLabel("Código de verificação")).toBeVisible();expect(state.verified).toBe(false);expect(state.financial).toBe(0);
});
