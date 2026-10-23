import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { fixture } from './fixtures';
const menu = ['Visão geral', 'Análise de Crédito', 'Auditoria', 'Gerenciar Base'];
async function activate(page: Page, largeValues = false) {
  let buffer = await fixture();
  if (largeValues) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
    workbook.worksheets[0].getCell('E2').value = 25000000.10;
    workbook.worksheets[1].getCell('E2').value = 11000000.20;
    workbook.worksheets[2].getCell('E2').value = 57000000.30;
    buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  }
  await page.getByRole('navigation').getByRole('button',{name:'Gerenciar Base',exact:true}).click();
  await page.getByLabel('Data de referência da posição').fill('2026-10-19');
  await page.getByLabel('Selecionar planilha Excel').setInputFiles({name:'ARQUIVO_DE_TESTE_LAYOUT.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
  await expect(page.getByRole('heading',{name:'Conferência da nova base'})).toBeVisible();
  await page.getByRole('checkbox',{name:/Confirmar utilização da base/}).check();
  await page.getByRole('button',{name:'Atualizar Dashboard',exact:true}).click();
  await expect(page.getByText(/Dashboard atualizado com sucesso: 6 registros/)).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Visão geral',exact:true}).click();
}
test('cinco KPIs em grade uniforme, valores longos legíveis e menu com quatro itens',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await activate(page,true);
  const nav=page.getByRole('navigation',{name:'Navegação principal'});
  await expect(nav.getByRole('button')).toHaveText(menu);
  await expect(nav.getByRole('button',{name:'Clientes',exact:true})).toHaveCount(0);
  await expect(nav.getByRole('button',{name:'Representantes',exact:true})).toHaveCount(0);
  const cards=page.locator('.financial-kpis .kpi');
  await expect(cards).toHaveCount(5);
  await expect(cards.locator('.kpi-value')).toHaveText([/36\.000\.000,30/,/25\.000\.000,10/,/11\.000\.000,20/,/57\.000\.020,70/,'10 dias']);
  const boxes=await cards.evaluateAll(elements=>elements.map(element=>{
    const card=element.getBoundingClientRect(),value=element.querySelector('.kpi-value')!.getBoundingClientRect(),footer=element.querySelector('.kpi-footer')!.getBoundingClientRect();
    return {x:card.x,y:card.y,width:card.width,height:card.height,valueY:value.y,footerY:footer.y,valueFits:value.right<=card.right&&value.left>=card.left};
  }));
  expect(Math.max(...boxes.map(b=>b.height))-Math.min(...boxes.map(b=>b.height))).toBeLessThan(1);
  expect(boxes.every(b=>b.valueFits)).toBe(true);
  if(page.viewportSize()!.width>=1400){
    expect(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))).toBeLessThan(1);
    expect(Math.max(...boxes.map(b=>b.width))-Math.min(...boxes.map(b=>b.width))).toBeLessThan(1);
    expect(Math.max(...boxes.map(b=>b.valueY))-Math.min(...boxes.map(b=>b.valueY))).toBeLessThan(1);
    expect(Math.max(...boxes.map(b=>b.footerY))-Math.min(...boxes.map(b=>b.footerY))).toBeLessThan(1);
    const gaps=boxes.slice(1).map((box,i)=>box.x-(boxes[i].x+boxes[i].width));
    expect(Math.max(...gaps)-Math.min(...gaps)).toBeLessThan(1);
  }else expect(new Set(boxes.map(b=>Math.round(b.y))).size).toBeGreaterThan(1);
  expect(await cards.evaluateAll(elements=>elements.every(card=>card.scrollWidth<=card.clientWidth))).toBe(true);
  for(const element of await cards.locator('.kpi-formula, .kpi-value, .kpi-footer').all()){
    await expect(element).toBeVisible();
    expect(await element.evaluate(e=>e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight)).toBe(true);
  }
  await expect(page.locator('.chart-panel svg.recharts-surface')).toHaveCount(6);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(process.env.BIOSAUDE_CAPTURE_KPI_LAYOUT&&['desktop','mobile'].includes(testInfo.project.name)){
    await page.locator('.financial-kpis').screenshot({path:`docs/preview-kpi-row-${testInfo.project.name}.png`});
    if(testInfo.project.name==='desktop')await nav.screenshot({path:'docs/preview-navigation-four-items.png'});
  }
  expect(errors).toEqual([]);
});
test('navegação preserva base e filtros; cliente e representante continuam acessíveis na visão geral',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await activate(page);
  const nav=page.getByRole('navigation',{name:'Navegação principal'});
  await page.getByLabel('Mês de referência',{exact:true}).selectOption('09');
  await page.getByLabel('Cliente',{exact:true}).selectOption('Cliente Teste A');
  await page.getByLabel('Representante',{exact:true}).selectOption('Representante Teste');
  await page.getByLabel('Categoria financeira',{exact:true}).selectOption('overdue');
  const before=await page.locator('.financial-kpis .kpi-value').allTextContents();
  for(const name of ['Análise de Crédito','Auditoria','Gerenciar Base','Visão geral']){
    await nav.getByRole('button',{name,exact:true}).click();
    await expect(nav.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page');
    await expect(nav.locator('.active')).toHaveCount(1);
    expect(await nav.getByRole('button',{name,exact:true}).evaluate(e=>getComputedStyle(e).color)).toBe('rgb(199, 25, 37)');
    await expect(page.locator('.status')).toHaveText('Atualizada');
    await expect(page.locator('.base-caption')).toContainText('ARQUIVO_DE_TESTE_LAYOUT.xlsx');
    if(name==='Gerenciar Base')await expect(page.getByRole('heading',{name:'Base em utilização'})).toBeVisible();
    else {
      await expect(page.getByLabel('Cliente',{exact:true})).toHaveValue('Cliente Teste A');
      await expect(page.getByLabel('Representante',{exact:true})).toHaveValue('Representante Teste');
      await expect(page.getByLabel('Mês de referência',{exact:true})).toHaveValue('09');
      await expect(page.getByLabel('Categoria financeira',{exact:true})).toHaveValue('overdue');
    }
    if(name==='Auditoria')await expect(page.getByRole('heading',{name:'Auditoria da base'})).toBeVisible();
    if(name==='Análise de Crédito')await expect(page.locator('.credit-module')).toBeVisible();
  }
  await expect(page.locator('.financial-kpis .kpi-value')).toHaveText(before);
  await expect(page.locator('.kpi.exposure .kpi-value')).toHaveText(/50,20/);
  await page.getByRole('button',{name:'Cliente Teste A',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Representante Teste');
  await page.getByRole('button',{name:'Fechar detalhamento'}).click();
  await page.getByRole('button',{name:'Limpar filtros'}).click();
  await expect(page.locator('.kpi.exposure .kpi-value')).toHaveText(/150,30/);
  expect(errors).toEqual([]);
});
