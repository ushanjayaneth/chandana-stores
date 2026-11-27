export const photoCatalogs = {
  food: {name: 'Open Food Facts', site: 'https://world.openfoodfacts.org', images: 'images.openfoodfacts.org'},
  products: {name: 'Open Products Facts', site: 'https://world.openproductsfacts.org', images: 'images.openproductsfacts.org'},
} as const;

export const photoRetailers = {
  'hemasestore.com': 'Hemas Estore',
  'onlinekade.lk': 'OnlineKade',
} as const;

export type PhotoRetailer = keyof typeof photoRetailers;

export const photoSearchTimeoutMs = 15_000;

export interface CatalogPhotoCredit {
  catalog: keyof typeof photoCatalogs;
  barcode: string;
}

export interface CatalogPhoto {
  name: string;
  brand?: string;
  size?: string;
  barcode?: string;
  keywords?: string;
  image: string;
  localMarket?: boolean;
  credit?: CatalogPhotoCredit;
  retailer?: {productUrl: string};
  related?: boolean;
  commonsPageId?: number;
}

export const photoBarcode = (value: string) => /^\d{8,14}$/.test(value.trim()) ? value.trim() : '';

const grocerySpellings: Record<string, string> = {
  choclat: 'chocolate', choclate: 'chocolate', chocolte: 'chocolate', chocalate: 'chocolate',
  biscut: 'biscuit', biscuts: 'biscuit', biskut: 'biscuit', biscuites: 'biscuit', biscit: 'biscuit',
  suger: 'sugar', suagr: 'sugar', shampu: 'shampoo', shampo: 'shampoo', toothpast: 'toothpaste',
  nodles: 'noodle', noodls: 'noodle', detegent: 'detergent', deteregent: 'detergent', batery: 'battery', brom: 'broom',
};

const groceryPlurals: Record<string, string> = {
  biscuits: 'biscuit', cookies: 'cookie', batteries: 'battery', noodles: 'noodle',
  lentils: 'lentil', soaps: 'soap', chips: 'chip', eggs: 'egg', brushes: 'brush',
  tomatoes: 'tomato', potatoes: 'potato', onions: 'onion', packets: 'packet',
};

export function photoQuery(value: string) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/sun[\s-]+light|\u0dc3\u0db1\u0dca\s*\u0dbd\u0dba\u0dd2\u0da7\u0dca/gu, 'sunlight')
    .replace(/\u0dc3\u0db6\u0db1\u0dca\s*\u0d9a\u0dd4\u0da9\u0dd4|soap\s+powder|wash\s+powder|laundry\s+detergent/gu, 'washing powder')
    .replace(/\u0dc3\u0db6\u0db1\u0dca/gu, 'soap')
    .replace(/(\d)\s+(kg|g|ml|l)\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}\p{M}.]+/gu, ' ')
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
    .trim().split(/\s+/).map(word => Object.hasOwn(grocerySpellings, word) ? grocerySpellings[word] : word).join(' ');
}

export const bundledCatalogPhotos: CatalogPhoto[] = [
  {name: 'Sunlight Lemon Laundry Soap', brand: 'Sunlight', size: 'Bar', keywords: 'soap bar laundry washing', image: '/images/grocery/soap.jpg', localMarket: true},
  {name: 'Surf Excel Washing Powder Aloe Vera', brand: 'Surf Excel', size: '500 g', keywords: 'laundry detergent soap powder', image: '/images/grocery/detergent.jpg', localMarket: true},
  {name: 'Maliban Custard Cream Biscuits', brand: 'Maliban', size: '200 g', keywords: 'cream biscuit biscuits cookies', image: '/images/grocery/biscuits.jpg', localMarket: true},
  {name: 'Rancrisp Potato Chips Lightly Sea Salted', brand: 'Rancrisp', keywords: 'crisps chips salt', image: '/images/grocery/chips.jpg', localMarket: true},
  {name: 'Signal Strong Teeth Toothpaste', brand: 'Signal', image: '/images/grocery/toothpaste.jpg', localMarket: true},
  {name: 'Sunsilk Soft & Smooth Shampoo', brand: 'Sunsilk', size: '180 ml', image: '/images/grocery/shampoo.jpg', localMarket: true},
];

function photoWords(text: string) {
  return photoQuery(text).split(' ').filter(Boolean)
    .map(word => Object.hasOwn(groceryPlurals, word) ? groceryPlurals[word] : word);
}

function closeSpelling(a: string, b: string) {
  if (!/^[a-z]{4,}$/.test(a) || !/^[a-z]{4,}$/.test(b) || a[0] !== b[0]) return false;
  if (a.length > b.length) [a, b] = [b, a];
  if (b.length - a.length > 1) return false;
  let offset = 0;
  while (offset < a.length && a[offset] === b[offset]) offset++;
  if (a.length !== b.length) return a.slice(offset) === b.slice(offset + 1);
  return a.slice(offset + 1) === b.slice(offset + 1) ||
    (a[offset] === b[offset + 1] && a[offset + 1] === b[offset] && a.slice(offset + 2) === b.slice(offset + 2));
}

export function matchingCatalogPhotos(photos: CatalogPhoto[], query: string, barcode: string, allowCloseSpelling = false) {
  const expected = photoBarcode(barcode);
  const terms = photoWords(query);
  return photos.flatMap(photo => {
    const exact = Boolean(expected && photoBarcode(photo.barcode ?? '') === expected);
    const haystack = photoWords([photo.name, photo.brand, photo.size, photo.keywords].filter(Boolean).join(' '));
    const words = new Set(haystack);
    const unmatched = terms.filter(term => !words.has(term));
    if (!exact && (!terms.length || unmatched.some(term =>
      !allowCloseSpelling || !haystack.some(word => closeSpelling(term, word))))) return [];
    const name = photoWords(photo.name).filter(word => !/^\d+(?:\.\d+)?(?:g|kg|ml|l)$/.test(word));
    const topicMatch = name.join(' ') === terms.join(' ') ? 32
      : name.slice(0, terms.length).join(' ') === terms.join(' ') ? 6 : 0;
    const preferred = topicMatch + (photo.localMarket ? 12 : 0) + (photo.retailer ? 7 : 0) + (photo.credit ? 0 : 2);
    return [{photo, score: (exact ? 100 : 0) + preferred - 15 * unmatched.length}];
  }).sort((a, b) => b.score - a.score).map(item => item.photo);
}

export function catalogImageUrl(image: string, catalog: CatalogPhotoCredit['catalog']) {
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && url.hostname === photoCatalogs[catalog]?.images && !url.port && !url.username && !url.password && !url.search && !url.hash &&
      /^\/images\/products\/(?:\d+\/)+front_[a-z-]+\.\d+\.(?:400|full)\.jpg$/i.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function retailerProductUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !Object.hasOwn(photoRetailers, url.hostname) ||
        !/^\/product\/[\w%-]+\/?$/i.test(url.pathname)) return null;
    return {name: photoRetailers[url.hostname as PhotoRetailer], href: url.origin + url.pathname};
  } catch { return null; }
}

export function retailerPhotoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    // Some OnlineKade photos are resized by WordPress. Use the fixed retailer origin.
    const onlineKadePath = url.hostname === 'i0.wp.com' && url.pathname.startsWith('/onlinekade.lk/');
    const host = onlineKadePath ? 'onlinekade.lk' : url.hostname;
    const path = onlineKadePath ? url.pathname.slice('/onlinekade.lk'.length) : url.pathname;
    if (!Object.hasOwn(photoRetailers, host) || /%(?:2e|2f|5c|00)/i.test(path) ||
        !/^\/wp-content\/uploads\/(?:\d{4}\/\d{2}\/)?[\w.%()-]+\.(?:jpe?g|png|webp)$/i.test(path)) return null;
    return 'https://' + host + path;
  } catch { return null; }
}

export function commonsPhotoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
        !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) ||
        /%(?:2e|2f|5c|00)/i.test(url.pathname) ||
        !/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/[^/]+(?:\/\d+px-[^/]+)?\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}

export function isOnlineCatalogPhoto(photo: CatalogPhoto) {
  return Boolean((photo.credit && catalogImageUrl(photo.image, photo.credit.catalog)) ||
    (photo.retailer && retailerPhotoUrl(photo.image) && retailerProductUrl(photo.retailer.productUrl)) ||
    (Number.isSafeInteger(photo.commonsPageId) && Number(photo.commonsPageId) > 0 && commonsPhotoUrl(photo.image)));
}

export function relatedPhotoQuery(value: string) {
  return photoQuery(value).replace(/\b(mini|small)\b/g, '').trim();
}
