import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { officialDaysFormulaFixture, syntheticDaysFormulaFixture } from './days-formula-fixture';
async function stage(page: Page, buffer: Buffer, reference: string) {
  await page.getByRole('navigation').getByRole('button',{name:'Gerenciar Base',exact:true}).click();
  await page.getByLabel('Data de referência da posição').fill(reference);
  await page.getByLabel('Selecionar planilha Excel').setInputFiles({name:'COPIA_DE_TESTE_FORMULAS.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
  await expect(page.getByRole('heading',{name:'Conferência da nova base'})).toBeVisible({timeout:30000});
}
async function activate(page: Page, remember = false) {
  if(remember) await page.getByLabel('Lembrar a nova base neste navegador').check();
  await page.getByRole('checkbox',{name:/Confirmar utilização da base/}).check();
  await page.getByRole('button',{name:'Atualizar Dashboard',exact:true}).click();
  await expect(page.getByText(/Dashboard atualizado com sucesso/)).toBeVisible();
  await page.getByRole('button',{name:'Voltar ao dashboard'}).click();
}
test('fórmulas oficiais sem cache importam sem falsos alertas; referência e dias persistem após avanço do relógio',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'Gerenciar Base',exact:true}).click();
  await expect(page.getByLabel('Data de referência da posição')).toHaveValue('2026-10-23');
  await stage(page,await syntheticDaysFormulaFixture(),'2026-10-23');
  await expect(page.locator('.validation-panel')).toContainText('3 registros preservados · 0 advertências · 0 erros bloqueantes');
  await expect(page.locator('.preview-totals')).toContainText('150,00');
  await activate(page,true);
  await expect(page.locator('.aging-average .kpi-value')).toHaveText('2 dias');
  await page.getByRole('button',{name:'CLIENTE SINTÉTICO FÓRMULAS',exact:true}).click();
  await page.getByRole('button',{name:'Linha 2: ver original'}).first().click();
  await expect(page.locator('.original-record')).toContainText('Dias originais/cache: não informado. Dias recalculados: 2.');
  await expect(page.locator('.original-record')).toContainText('E2-TODAY()');
  await page.getByRole('button',{name:'Fechar detalhamento'}).click();
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00Z'));
  await page.reload();
  await expect(page.locator('.aging-average .kpi-value')).toHaveText('2 dias');
  await expect(page.locator('.base-caption')).toContainText('23/10/2026');
  await expect(page.locator('.kpi.exposure .kpi-value')).toHaveText(/150,00/);
  expect(errors).toEqual([]);
});
test('referência incorreta na fórmula mantém advertência e rastreabilidade sem bloquear os saldos válidos',async({page})=>{
  await page.goto('/');
  await stage(page,await syntheticDaysFormulaFixture(true),'2026-10-23');
  await expect(page.locator('.validation-panel')).toContainText('3 registros preservados · 1 advertências · 0 erros bloqueantes');
  await expect(page.locator('.audit-message')).toContainText('Referência de célula incorreta');
  await activate(page);
  await expect(page.locator('.kpi.exposure .kpi-value')).toHaveText(/150,00/);
  await expect(page.locator('.aging-average .kpi-value')).toHaveText('2 dias');
  await page.getByRole('navigation').getByRole('button',{name:'Auditoria',exact:true}).click();
  await expect(page.locator('.audit-message')).toContainText('Referência de célula incorreta');
});
test('cópia da planilha oficial com novas fórmulas: seis advertências legítimas e KPIs preservados',async({page})=>{
  test.skip(!process.env.BIOSAUDE_TEST_WORKBOOK,'Planilha oficial externa ao repositório.');
  const errors:string[]=[], external:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173')&&!request.url().startsWith('data:')) external.push(request.url());});
  await page.goto('/');
  await stage(page,officialDaysFormulaFixture(await readFile(process.env.BIOSAUDE_TEST_WORKBOOK!)),'2026-10-19');
  await expect(page.locator('.validation-panel')).toContainText('5.099 registros preservados · 6 advertências · 0 erros bloqueantes');
  await activate(page);
  await expect(page.locator('.kpi.exposure .kpi-value')).toHaveText(/36\.286\.262,45/);
  await expect(page.locator('.kpi.upcoming .kpi-value')).toHaveText(/25\.711\.247,24/);
  await expect(page.locator('.kpi.overdue .kpi-value')).toHaveText(/10\.575\.015,21/);
  await expect(page.locator('.kpi.received .kpi-value')).toHaveText(/56\.999\.819,30/);
  await expect(page.locator('.aging-average .kpi-value')).toHaveText('423,74 dias');
  await expect(page.locator('.critical-concentration > strong')).toHaveText('67,51%');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('nova planilha enviada: 5.212 registros reais, 11 advertências de +1 e aging de 401,31 dias',async({page})=>{
  test.skip(!process.env.BIOSAUDE_UPDATED_WORKBOOK,'Nova planilha real externa ao repositório.');
  const errors:string[]=[],external:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173')&&!request.url().startsWith('data:')) external.push(request.url());});
  await page.goto('/');
  await stage(page,await readFile(process.env.BIOSAUDE_UPDATED_WORKBOOK!),'2026-10-23');
  await expect(page.locator('.validation-panel')).toContainText('5.212 registros preservados · 11 advertências · 0 erros bloqueantes');
  await expect(page.locator('.audit-message').first()).toContainText('Fórmula incompatível');
  await activate(page,true);
  await expect(page.locator('.kpi.exposure .kpi-value')).toHaveText(/36\.056\.572,20/);
  await expect(page.locator('.kpi.upcoming .kpi-value')).toHaveText(/24\.950\.832,48/);
  await expect(page.locator('.kpi.overdue .kpi-value')).toHaveText(/11\.105\.739,72/);
  await expect(page.locator('.kpi.received .kpi-value')).toHaveText(/57\.902\.017,98/);
  await expect(page.locator('.aging-average .kpi-value')).toHaveText('401,31 dias');
  await page.reload();
  await expect(page.locator('.aging-average .kpi-value')).toHaveText('401,31 dias');
  await expect(page.locator('.base-caption')).toContainText('23/10/2026');
  await page.getByRole('navigation').getByRole('button',{name:'Auditoria',exact:true}).click();
  await expect(page.locator('.audit-table tbody tr')).toHaveCount(11);
  expect(errors).toEqual([]);expect(external).toEqual([]);
});
