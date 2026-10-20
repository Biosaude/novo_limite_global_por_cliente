import { test, expect } from '@playwright/test';

test('dashboard vazio preserva a ausência de dados financeiros', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Limite Global por Cliente');
  await expect(page.locator('.kpi')).toHaveCount(4);
  await expect(page.locator('.kpi-value')).toHaveText(['—BRL', '—BRL', '—BRL', '—BRL']);
  await expect(page.locator('.chart-panel')).toHaveCount(6);
  await expect(page.getByRole('combobox')).toHaveCount(5);
  for (const select of await page.getByRole('combobox').all()) await expect(select).toBeDisabled();
  expect(await page.locator('body').innerText()).not.toContain('93.286.081');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('navegação e pesquisa mostram estados vazios claros', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clientes');
  await page.getByRole('searchbox').fill('Hospital');
  await expect(page.getByText('Nenhuma base carregada para pesquisar “Hospital”.')).toBeVisible();
  await page.getByRole('button', { name: 'Representantes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Indicadores por representante' })).toBeVisible();
  await page.getByRole('button', { name: 'Auditoria', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Auditoria da base' })).toBeVisible();
  await expect(page.locator('.audit-summary strong')).toHaveText(['—', '—', '—']);
});

test('gerenciamento permite conferir a referência sem aceitar arquivos nesta fase', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') uploads.push(request.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Gerenciar Base', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Importar planilha financeira' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importação após aprovação visual' })).toBeDisabled();
  const date = page.getByLabel('Data de referência da posição');
  await expect(date).toHaveValue('2026-10-19');
  await date.fill('2026-10-20');
  await expect(date).toHaveValue('2026-10-20');
  await page.getByRole('button', { name: 'Voltar ao dashboard' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Limite Global por Cliente');
  expect(uploads).toEqual([]);
});

test('aviso fecha e páginas não ultrapassam a largura da tela', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
  await expect(page.getByText('Pronto para receber sua base financeira')).toHaveCount(0);
  for (const name of ['Clientes', 'Representantes', 'Auditoria', 'Gerenciar Base']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
