export const photoCatalogs = {
  food: {name: 'Open Food Facts', site: 'https://world.openfoodfacts.org', images: 'images.openfoodfacts.org'},
  products: {name: 'Open Products Facts', site: 'https://world.openproductsfacts.org', images: 'images.openproductsfacts.org'},
} as const;

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
}

export const photoBarcode = (value: string) => /^\d{8,14}$/.test(value.trim()) ? value.trim() : '';

export function photoQuery(value: string) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/sun[\s-]+light|සන්\s*ලයිට්/gu, 'sunlight')
    .replace(/සබන්\s*කුඩු|soap\s+powder|wash\s+powder|laundry\s+detergent/gu, 'washing powder')
    .replace(/සබන්/gu, 'soap')
    .replace(/(\d)\s+(kg|g|ml|l)\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
}

export const bundledCatalogPhotos: CatalogPhoto[] = [
  {name: 'Sunlight Lemon Laundry Soap', brand: 'Sunlight', size: 'Bar', keywords: 'soap bar laundry washing', image: '/images/grocery/soap.jpg', localMarket: true},
  {name: 'Surf Excel Washing Powder Aloe Vera', brand: 'Surf Excel', size: '500 g', keywords: 'laundry detergent soap powder', image: '/images/grocery/detergent.jpg', localMarket: true},
  {name: 'Maliban Custard Cream Biscuits', brand: 'Maliban', size: '200 g', keywords: 'cream biscuit biscuits cookies', image: '/images/grocery/biscuits.jpg', localMarket: true},
  {name: 'Rancrisp Potato Chips Lightly Sea Salted', brand: 'Rancrisp', keywords: 'crisps chips salt', image: '/images/grocery/chips.jpg', localMarket: true},
  {name: 'Signal Strong Teeth Toothpaste', brand: 'Signal', image: '/images/grocery/toothpaste.jpg', localMarket: true},
  {name: 'Sunsilk Soft & Smooth Shampoo', brand: 'Sunsilk', size: '180 ml', image: '/images/grocery/shampoo.jpg', localMarket: true},
];

export function matchingCatalogPhotos(photos: CatalogPhoto[], query: string, barcode: string) {
  const expected = photoBarcode(barcode);
  const terms = photoQuery(query).split(' ').filter(Boolean);
  return photos.flatMap(photo => {
    const exact = Boolean(expected && photoBarcode(photo.barcode ?? '') === expected);
    const haystack = photoQuery([photo.name, photo.brand, photo.size, photo.keywords].filter(Boolean).join(' '));
    const words = new Set(haystack.split(' '));
    if (!exact && (!terms.length || terms.some(term => !words.has(term)))) return [];
    return [{photo, score: (exact ? 100 : 0) + (photo.localMarket ? 10 : 0) + (photo.credit ? 0 : 2)}];
  }).sort((a, b) => b.score - a.score).map(item => item.photo);
}

export function catalogImageUrl(image: string, catalog: CatalogPhotoCredit['catalog']) {
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && url.hostname === photoCatalogs[catalog].images &&
      !url.port && !url.username && !url.password && !url.search && !url.hash &&
      /^\/images\/products\/(?:\d+\/)+front_[a-z-]+\.\d+\.(?:400|full)\.jpg$/i.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function googlePhotoSearchUrl(name: string) {
  const query = photoQuery(name);
  return "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(query + " product package Sri Lanka");
}
