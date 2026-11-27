import {hemasPhotoUrl, relatedPhotoQuery, catalogImageUrl, matchingCatalogPhotos, photoBarcode, photoCatalogs, photoQuery, type CatalogPhoto, type CatalogPhotoCredit} from '../shared/product-photo-catalog.js';

type Catalog = CatalogPhotoCredit['catalog'];
const fields = 'code,product_name,brands,quantity,image_front_url,countries_tags';
const profiles: Catalog[] = ['food', 'products'];
const cache = new Map<string, {expires: number; result: Promise<CatalogPhoto[]>}>();

async function catalogSearch(catalog: Catalog, query: string, barcode: string): Promise<CatalogPhoto[]> {
  const foodSearch = catalog === 'food' && !barcode;
  const root = photoCatalogs[catalog].site;
  const url = barcode ? new URL('/api/v2/product/' + barcode, root) : foodSearch
    ? new URL('https://search.openfoodfacts.org/search') : new URL('/cgi/search.pl', root);
  if (!foodSearch) url.searchParams.set('fields', fields);
  if (foodSearch) {
    url.searchParams.set('q', query);
    url.searchParams.set('page_size', '24');
  } else if (!barcode) {
    for (const [key, value] of Object.entries({search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '24'})) {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url, {
    headers: {Accept: 'application/json', 'User-Agent': 'Retail POS product photo picker/1.0 (https://github.com/ushanjayaneth/chandana-stores)'},
    signal: AbortSignal.timeout(4500),
    redirect: 'error',
  });
  if (response.status === 404 && barcode) return [];
  if (!response.ok) throw new Error('Photo catalog unavailable');
  const data = await response.json() as {product?: unknown; products?: unknown[]; hits?: unknown[]};
  const rows = barcode ? [data.product] : (foodSearch ? data.hits : data.products)?.slice(0, 24) ?? [];
  return rows.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const name = typeof row.product_name === 'string' ? row.product_name.trim().slice(0, 160) : '';
    const code = typeof row.code === 'string' ? photoBarcode(row.code) : '';
    const image = typeof row.image_front_url === 'string' ? catalogImageUrl(row.image_front_url, catalog) : null;
    if (!name || !image || !code) return [];
    return [{
      name, image, barcode: code, credit: {catalog, barcode: code},
      brand: typeof row.brands === 'string' ? row.brands.slice(0, 80) : undefined,
      size: typeof row.quantity === 'string' ? row.quantity.slice(0, 48) : undefined,
      localMarket: [row.countries_tags, row.countries].some(countries => Array.isArray(countries) && countries.includes('en:sri-lanka')),
    }];
  });
}

async function retailerSearch(query: string): Promise<CatalogPhoto[]> {
  const brand = relatedPhotoQuery(query).split(' ')[0];
  if (brand.length < 3) return [];
  const url = new URL('https://hemasestore.com/wp-json/wc/store/v1/products');
  url.search = new URLSearchParams({search: brand, per_page: '24', _fields: 'name,permalink,images'}).toString();
  const response = await fetch(url, {signal: AbortSignal.timeout(4_500), redirect: 'error'});
  if (!response.ok) return [];
  const rows = await response.json() as {name?: string; permalink?: string; images?: {src?: string}[]}[];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const name = (row.name ?? '').trim().replace(/(\p{L})(\d)/gu, '$1 $2').slice(0, 160);
    const image = hemasPhotoUrl(row.images?.[0]?.src ?? '');
    const productUrl = row.permalink ?? '';
    if (!name || !image || !/^https:\/\/hemasestore\.com\/product\/[\w-]+\/?$/.test(productUrl)) return [];
    return [{name, image, localMarket: true, retailer: {productUrl}}];
  });
}

export async function findProductPhotos(input: {query: string; barcode: string}): Promise<CatalogPhoto[]> {
  const query = photoQuery(input.query.slice(0, 120));
  const barcode = photoBarcode(input.barcode.slice(0, 32));
  if (query.length < 2 && !barcode) return [];
  const key = JSON.stringify([query, barcode]);
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.result;
  const result = (async () => {
    const requests = profiles.map(catalog => catalogSearch(catalog, query, barcode));
    if (query.length >= 3 && !barcode) requests.push(retailerSearch(query));
    const searches = await Promise.allSettled(requests);
    const results = searches.flatMap(search => search.status === 'fulfilled' ? search.value : []);
    if (barcode && !results.length && query.length >= 2) return findProductPhotos({query, barcode: ''});
    if (searches.every(search => search.status === 'rejected')) throw new Error('Photo catalogs are temporarily unavailable.');
    const matches = matchingCatalogPhotos(results, query, barcode);
    const related = relatedPhotoQuery(query);
    if (!matches.length && related && related !== query) {
      const smallPacks = results.filter(photo => photo.retailer && /\b\d{1,2}g\b/i.test(photoQuery(photo.name)) &&
        !/\b(?:free|bundle|toothbrush)\b/i.test(photo.name));
      return matchingCatalogPhotos(smallPacks, related, '').slice(0, 12);
    }
    return matches.slice(0, 30);
  })();
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, {result, expires: Date.now() + 300_000});
  void result.catch(() => { if (cache.get(key)?.result === result) cache.delete(key); });
  return result;
}

export async function downloadRetailerPhoto(image: string) {
  const url = hemasPhotoUrl(image);
  if (!url) return null;
  const response = await fetch(url, {signal: AbortSignal.timeout(5_000), redirect: 'error'});
  const mime = response.headers.get('content-type')?.split(';')[0];
  const maximum = 5_000_000;
  if (!response.ok || !response.body || !mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime) ||
      Number(response.headers.get('content-length')) > maximum) return null;
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return {mime, bytes: Buffer.concat(chunks, size)};
}
