import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {downloadCataloguePhoto, findProductPhotos} from '../server/product-photos';
import {bundledCatalogPhotos, googlePhotoSearchUrl, matchingCatalogPhotos, photoQuery} from '../shared/product-photo-catalog';

test('Sinhala grocery aliases retain brands and weights and can match bundled photos', () => {
  assert.equal(photoQuery('බිත්තර'), 'eggs');
  assert.equal(photoQuery('SPAR පාන් පිටි 1 කිලෝ'), 'spar wheat flour 1kg');
  assert.equal(photoQuery('ක්ලෝගාඩ් මිනි දත් බෙහෙත්'), 'clogard mini toothpaste');
  assert.equal(photoQuery('චොකලට් බිස්කට් 50 ග්‍රෑම්'), 'chocolate biscuits 50g');
  assert.equal(photoQuery('අත් ඔරලෝසුව'), 'අත් ඔරලෝසුව');
  assert.equal(matchingCatalogPhotos(bundledCatalogPhotos, 'බිත්තර', '')[0]?.image, '/images/grocery/eggs.jpg');
  assert.equal(matchingCatalogPhotos(bundledCatalogPhotos, 'පාන් පිටි', '')[0]?.image, '/images/grocery/flour.jpg');
  const google = new URL(googlePhotoSearchUrl('අත් ඔරලෝසුව'));
  assert.equal(google.searchParams.get('q'), 'අත් ඔරලෝසුව Sri Lanka');
  assert.equal(google.searchParams.get('tbm'), 'isch');
});

test('product photo search broadens to a grocery retailer and a general photo catalogue', async t => {
  const biscuit = 'https://onlinekade.lk/wp-content/uploads/Tiger-Chocolate-Biscuit-53.2G.webp';
  const rake = 'https://upload.wikimedia.org/wikipedia/commons/9/95/Rake.jpg';
  const lookup = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname.endsWith('.webp') || url.pathname.endsWith('.jpg')) {
      return new Response(new Uint8Array([1, 2, 3]), {headers: {'Content-Type': 'image/jpeg'}});
    }
    if (url.hostname === 'onlinekade.lk' && url.searchParams.get('search') === 'chocolate biscuit') {
      return Response.json([
        {name: 'Tiger Chocolate Biscuits 53.2G', permalink: 'https://onlinekade.lk/product/tiger-chocolate-biscuit/', images: [
          {src: 'https://i0.wp.com/onlinekade.lk/wp-content/uploads/Tiger-Chocolate-Biscuit-53.2G.webp?fit=500%2C500'},
        ]},
        {name: 'Chocolate Cake 500G', permalink: 'https://onlinekade.lk/product/chocolate-cake/', images: [{src: biscuit}]},
      ]);
    }
    if (url.hostname === 'commons.wikimedia.org') {
      return Response.json({query: {pages: [
        {pageid: 542046, title: 'File:Rake.jpg', imageinfo: [
          {thumburl: rake, mime: 'image/jpeg', extmetadata: {LicenseShortName: {value: 'Public domain'}}},
        ]},
        {pageid: 23, title: 'File:Unknown rake.jpg', imageinfo: [{thumburl: rake, mime: 'image/jpeg'}]},
      ]}});
    }
    return Response.json(url.pathname.endsWith('/products') ? [] : {});
  });

  assert.equal(photoQuery('choclat biscut'), 'chocolate biscuit');
  const snacks = await findProductPhotos({query: 'choclat biscut', barcode: ''});
  assert.deepEqual(snacks.map(({name, image}) => [name, image]), [['Tiger Chocolate Biscuits 53.2G', biscuit]]);
  const tools = await findProductPhotos({query: 'garden rake', barcode: ''});
  assert.deepEqual(tools.map(({name, related, commonsPageId}) => [name, related, commonsPageId]), [['Rake', true, 542046]]);
  assert.equal((await downloadCataloguePhoto(rake))?.bytes.length, 3);
  const callCount = lookup.mock.callCount();
  assert.equal(await downloadCataloguePhoto('https://i0.wp.com/example.org/wp-content/uploads/photo.jpg'), null);
  assert.equal(await downloadCataloguePhoto('https://onlinekade.lk/wp-content/uploads/photo%2foutside.jpg'), null);
  assert.equal(lookup.mock.callCount(), callCount);
});
