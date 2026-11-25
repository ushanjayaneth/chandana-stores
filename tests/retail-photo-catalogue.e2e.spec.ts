import {expect, test} from '@playwright/test';
import {readFileSync} from 'node:fs';

test.use({serviceWorkers: 'allow'});
test.setTimeout(90_000);

test('product photo finder recognizes Sunlight, keeps the product draft and saves the selected photo offline', async ({page, context}) => {
  await page.setViewportSize({width: 390, height: 844});
  const remoteImage = 'https://images.openproductsfacts.org/images/products/123/456/789/0123/front_en.1.400.jpg';
  const raster = readFileSync('public/images/grocery/soap.jpg');
  await page.route('**/api/product-photos?*', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    expect(query).toBe('sunlight');
    await route.fulfill({json: {photos: [
      {name: 'Sunlight Washing Powder', brand: 'Sunlight', size: '500 g', image: remoteImage, credit: {catalog: 'products', barcode: '1234567890123'}},
      {name: 'Sun in the sky', image: remoteImage, credit: {catalog: 'products', barcode: '1234567890123'}},
    ]}});
  });
  await page.route(remoteImage, route => route.fulfill({
    status: 200, headers: {'Access-Control-Allow-Origin': '*'}, contentType: 'image/jpeg', body: raster,
  }));
  await page.goto('/?local=1');
  await page.getByRole('button', {name: 'Create your store', exact: true}).click();
  const setup = page.getByRole('dialog', {name: 'Set up this device', exact: true});
  await setup.getByLabel(/^Owner PIN/).fill('98765432');
  await setup.getByLabel('Confirm owner PIN', {exact: true}).fill('98765432');
  await setup.getByRole('checkbox').check();
  await setup.getByRole('button', {name: 'Create device workspace', exact: true}).click();

  await page.getByRole('button', {name: 'Add product', exact: true}).click();
  const product = page.getByRole('dialog', {name: 'Add product', exact: true});
  await product.getByLabel('Product name', {exact: true}).fill('sun light');
  await product.getByLabel('Selling price (LKR)', {exact: true}).fill('150');
  await product.getByLabel('Opening stock quantity', {exact: true}).fill('8');
  const find = product.getByRole('button', {name: 'Find product photo', exact: true});
  await find.click();
  const gallery = product.getByRole('region', {name: 'Product photo catalogue'});
  await expect(gallery.getByRole('searchbox')).toHaveValue('sun light');
  await expect(gallery.getByRole('button', {name: /Use photo of Sunlight Lemon/})).toBeVisible();
  await expect(gallery.getByText('Sun in the sky')).toHaveCount(0);
  await gallery.getByRole('button', {name: /Use photo of Sunlight Washing Powder/}).click();
  await expect(gallery).toHaveCount(0);
  await expect(product.getByLabel('Product name', {exact: true})).toHaveValue('sun light');
  await expect(product.getByLabel('Selling price (LKR)', {exact: true})).toHaveValue('150');
  await expect(product.getByLabel('Opening stock quantity', {exact: true})).toHaveValue('8');
  const preview = product.getByAltText('Product photo preview', {exact: true});
  await expect(preview).toHaveAttribute('src', /^blob:/);
  await expect(product.getByRole('link', {name: 'Photo credit'})).toHaveAttribute('href', /openproductsfacts\.org\/product\/1234567890123/);
  await product.getByRole('button', {name: 'Add product', exact: true}).click();
  await expect(product).toHaveCount(0);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  const card = page.locator('.product-card').filter({has: page.getByRole('heading', {name: 'sun light', exact: true})});
  await expect(card.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => card.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
