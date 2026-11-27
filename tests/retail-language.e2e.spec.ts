import {expect, test} from '@playwright/test';

test.use({serviceWorkers: 'allow'});

test('the cashier can change to Sinhala and return to English while offline', async ({page, context}) => {
  await page.setViewportSize({width: 360, height: 800});
  await page.goto('/?local=1');
  await page.getByRole('button', {name: 'Create your store', exact: true}).click();
  const setup = page.getByRole('dialog', {name: 'Set up this device', exact: true});
  await setup.getByLabel(/^Owner PIN/).fill('98765432');
  await setup.getByLabel('Confirm owner PIN', {exact: true}).fill('98765432');
  await setup.getByRole('checkbox').check();
  await setup.getByRole('button', {name: 'Create device workspace', exact: true}).click();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const product = page.locator('.product-card').filter({hasText: 'Potato chips'});
  await product.getByRole('button', {name: 'Add Potato chips', exact: true}).click();

  await context.setOffline(true);
  await page.getByRole('button', {name: 'සිංහල', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'si');
  await expect(page.getByRole('heading', {name: /^විකුණුම් කවුන්ටරය/})).toBeVisible();
  await expect(page.getByRole('heading', {name: /^භාණ්ඩ ලැයිස්තුව/, level: 2})).toBeVisible();
  expect(await page.locator('.topbar').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'si');
  await expect(page.getByRole('heading', {name: /^භාණ්ඩ ලැයිස්තුව/, level: 2})).toBeVisible();
  await expect(product).toContainText('එක් කළා');
  await page.getByRole('button', {name: 'English', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(product).toContainText('added');
});
