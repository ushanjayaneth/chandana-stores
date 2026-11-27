import {commonsPhotoUrl, retailerPhotoUrl, retailerProductUrl, relatedPhotoQuery, catalogImageUrl, matchingCatalogPhotos, photoBarcode, photoCatalogs, photoQuery, type CatalogPhoto, type CatalogPhotoCredit, type PhotoRetailer} from '../shared/product-photo-catalog.js';

type Catalog = CatalogPhotoCredit['catalog'];
const photoUserAgent = 'Chandana Stores POS (https://github.com/ushanjayaneth/chandana-stores)';
const profiles: Catalog[] = ['food', 'products'];
const cache = new Map<string, {expires: number; result: Promise<CatalogPhoto[]>}>();

async function catalogSearch(catalog: Catalog, query: string, barcode: string, fuzzy = false): Promise<CatalogPhoto[]> {
  const foodSearch = catalog === 'food' && !barcode;
  const root = photoCatalogs[catalog].site;
  const url = barcode ? new URL('/api/v2/product/' + barcode, root) : foodSearch
    ? new URL('https://search.openfoodfacts.org/search') : new URL('/cgi/search.pl', root);
  const fields = 'code,product_name,product_name_en,brands,quantity,image_front_url';
  url.searchParams.set('fields', fields + (foodSearch ? ',countries' : ',countries_tags'));
  if (foodSearch) {
    const search = fuzzy ? query.split(' ').map(term => /^[a-z]{4,}$/.test(term) ? term + '~1' : term).join(' ') : query;
    url.searchParams.set('q', search);
    url.searchParams.set('page_size', '36');
  } else if (!barcode) {
    for (const [key, value] of Object.entries({search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '24'})) {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url, {
    headers: {Accept: 'application/json', 'User-Agent': photoUserAgent},
    signal: AbortSignal.timeout(4_000),
    redirect: 'error',
  });
  if (response.status === 404 && barcode) return [];
  if (!response.ok) throw new Error('Photo catalog unavailable');
  const data = await response.json() as {product?: unknown; products?: unknown[]; hits?: unknown[]};
  const rows = barcode ? [data.product] : (foodSearch ? data.hits : data.products)?.slice(0, 36) ?? [];
  return rows.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const english = typeof row.product_name_en === 'string' ? row.product_name_en.trim() : '';
    const original = typeof row.product_name === 'string' ? row.product_name.trim() : '';
    const name = (english || original).slice(0, 160);
    const brand = typeof row.brands === 'string' ? row.brands : Array.isArray(row.brands)
      ? row.brands.filter((value): value is string => typeof value === 'string').map(value => value.replace(/^[a-z]{2}:/, '')).join(' ') : undefined;
    const code = typeof row.code === 'string' ? photoBarcode(row.code) : '';
    const image = typeof row.image_front_url === 'string' ? catalogImageUrl(row.image_front_url, catalog) : null;
    if (!name || !image || !code) return [];
    return [{
      name, image, barcode: code, credit: {catalog, barcode: code},
      brand: brand?.slice(0, 100),
      size: typeof row.quantity === 'string' ? row.quantity.slice(0, 48) : undefined,
      localMarket: [row.countries_tags, row.countries].some(countries => Array.isArray(countries) && countries.includes('en:sri-lanka')),
    }];
  });
}

async function retailerSearch(retailer: PhotoRetailer, query: string): Promise<CatalogPhoto[]> {
  if (query.length < 2) return [];
  const url = new URL('/wp-json/wc/store/v1/products', 'https://' + retailer);
  url.search = new URLSearchParams({search: query, per_page: '24', _fields: 'name,permalink,images'}).toString();
  const response = await fetch(url, {headers: {Accept: 'application/json', 'User-Agent': photoUserAgent}, signal: AbortSignal.timeout(4_000), redirect: 'error'});
  if (!response.ok) throw new Error('Retail catalogue unavailable');
  const rows = await response.json() as {name?: unknown; permalink?: unknown; images?: {src?: unknown}[]}[];
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 24).flatMap(row => {
    if (!row || typeof row.name !== 'string') return [];
    const name = row.name.replace(/&amp;/g, '&').replace(/&#8211;/g, '-')
      .replace(/(\p{L})(\d+(?:\.\d+)?(?:kg|g|ml|l)\b)/giu, '$1 $2').replace(/\s+/g, ' ').trim().slice(0, 160);
    const sourceImage = row.images?.[0]?.src;
    const image = typeof sourceImage === 'string' ? retailerPhotoUrl(sourceImage) : null;
    const source = typeof row.permalink === 'string' ? retailerProductUrl(row.permalink) : null;
    if (!name || !image || !source) return [];
    return [{name, image, localMarket: true, retailer: {productUrl: source.href}}];
  });
}

function settledPhotos(searches: PromiseSettledResult<CatalogPhoto[]>[]) {
  return searches.flatMap(search => search.status === 'fulfilled' ? search.value : []);
}

function smallPacks(photos: CatalogPhoto[], query: string) {
  const small = photos.filter(photo => photo.retailer && /\b(?:[1-3]?\d|4\d)g\b/i.test(photoQuery(photo.name)) &&
    !/\b(?:free|bundle|toothbrush|mouthwash)\b/i.test(photo.name));
  return matchingCatalogPhotos(small, query, '').slice(0, 12).map(photo => ({...photo, related: true}));
}

async function commonsSearch(query: string): Promise<CatalogPhoto[]> {
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: query + ' filetype:bitmap', gsrnamespace: '6',
    gsrlimit: '30', prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName',
    iiurlwidth: '500', formatversion: '2', format: 'json',
  });
  const response = await fetch('https://commons.wikimedia.org/w/api.php?' + params, {
    headers: {Accept: 'application/json', 'User-Agent': photoUserAgent}, signal: AbortSignal.timeout(4_000), redirect: 'error',
  });
  if (!response.ok) throw new Error('General photo catalogue unavailable');
  type Result = {title: string; pageid: number; imageinfo?: {
    mime?: string; thumburl?: string; extmetadata?: {LicenseShortName?: {value?: string}};
  }[]};
  const data = await response.json() as {query?: {pages?: Result[]}};
  const photos = (data.query?.pages ?? []).flatMap(row => {
    const info = row.imageinfo?.[0];
    const license = info?.extmetadata?.LicenseShortName?.value ?? '';
    if (!/^(CC0(?: 1\.0)?|Public domain)$/i.test(license) || !info?.mime ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) return [];
    const image = info.thumburl && commonsPhotoUrl(info.thumburl);
    if (!image || !Number.isSafeInteger(row.pageid) || row.pageid < 1) return [];
    const name = row.title.replace(/^File:/i, '').replace(/\.[^.]+$/, '').replaceAll('_', ' ').slice(0, 160);
    return [{name, image, commonsPageId: row.pageid}];
  });
  const matches = matchingCatalogPhotos(photos, query, '', true);
  if (matches.length) return matches.slice(0, 10);
  // The API already searched the full phrase. A generic item can be useful when the file title omits a qualifier.
  const subject = query.split(' ').at(-1) ?? '';
  if (subject.length < 4 || /\d/.test(subject) || subject === query) return [];
  return matchingCatalogPhotos(photos, subject, '').slice(0, 8);
}

async function searchByName(query: string) {
  const related = relatedPhotoQuery(query);
  const terms = query.split(' ');
  const requests = [
    ...profiles.map(catalog => catalogSearch(catalog, query, '')),
    retailerSearch('hemasestore.com', (related || query).split(' ')[0]),
    retailerSearch('onlinekade.lk', related || query),
  ];
  const searches = await Promise.allSettled(requests);
  const candidates = settledPhotos(searches);
  const matches = matchingCatalogPhotos(candidates, query, '');
  if (matches.length) return matches.slice(0, 30);
  if (related && related !== query) {
    const packs = smallPacks(candidates, related);
    if (packs.length) return packs;
  }

  const fallbackRequests = [catalogSearch('food', query, '', true), commonsSearch(query)];
  if (terms.length > 1 && related === query) fallbackRequests.push(retailerSearch('onlinekade.lk', terms[0]));
  if (terms.length > 2 && terms.slice(-2).every(term => /^[a-z]{3,}$/.test(term))) {
    fallbackRequests.push(commonsSearch(terms.slice(-2).join(' ')));
  }
  const fallback = await Promise.allSettled(fallbackRequests);
  if ([...searches, ...fallback].every(search => search.status === 'rejected')) {
    throw new Error('Photo catalogs are temporarily unavailable.');
  }
  const results = [...candidates, ...settledPhotos(fallback)];
  const closeMatches = matchingCatalogPhotos(results, query, '', true);
  const general = results.filter(photo => photo.commonsPageId && !closeMatches.includes(photo));
  return [...closeMatches, ...general].slice(0, 24).map(photo => ({...photo, related: true}));
}

export async function findProductPhotos(input: {query: string; barcode: string}): Promise<CatalogPhoto[]> {
  const query = photoQuery(input.query.slice(0, 120));
  const barcode = photoBarcode(input.barcode.slice(0, 32));
  if (query.length < 2 && !barcode) return [];
  const key = JSON.stringify([query, barcode]);
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.result;
  const result = (async () => {
    if (!barcode) return searchByName(query);
    const searches = await Promise.allSettled(profiles.map(catalog => catalogSearch(catalog, '', barcode)));
    const matches = matchingCatalogPhotos(settledPhotos(searches), '', barcode);
    if (matches.length || query.length < 2) return matches;
    return findProductPhotos({query, barcode: ''});
  })();
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, {result, expires: Date.now() + 300_000});
  void result.then(photos => {
    if (!photos.length && cache.get(key)?.result === result) cache.delete(key);
  }, () => { if (cache.get(key)?.result === result) cache.delete(key); });
  return result;
}

export async function downloadCataloguePhoto(image: string) {
  const url = retailerPhotoUrl(image) ?? commonsPhotoUrl(image);
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
