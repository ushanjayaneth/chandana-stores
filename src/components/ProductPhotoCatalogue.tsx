import {useTranslation} from "../lib/language";
import {useEffect, useRef} from 'react';
import {ExternalLink, X} from 'lucide-react';
import {bundledCatalogPhotos, googlePhotoSearchUrl, relatedPhotoQuery, retailerProductUrl, matchingCatalogPhotos, photoCatalogs, type CatalogPhoto} from '../../shared/product-photo-catalog';
import {mediaIdFromReference} from '../../shared/media';
import {usePOS} from '../lib/context';
import {useBackLayer} from '../lib/navigation';
import ProductPhoto from './ProductPhoto';

export default function ProductPhotoCatalogue({name, query, barcode, remote, loading, online, unavailable, scrollRequest, onSearch, onChoose, onClose}: {
  name: string;
  query: string;
  barcode: string;
  remote: CatalogPhoto[];
  loading: boolean;
  online: boolean;
  unavailable: boolean;
  scrollRequest: number;
  onSearch: (name: string) => void;
  onChoose: (photo: CatalogPhoto) => void;
  onClose: () => void;
}) {
  const tr = useTranslation();
  const {data} = usePOS();
  const panel = useRef<HTMLElement>(null);

  useBackLayer(true, onClose, 'product-photo-catalogue');

  useEffect(() => {
    if (scrollRequest) panel.current?.scrollIntoView({block: 'nearest'});
  }, [scrollRequest]);

  const ownPhotos: CatalogPhoto[] = data.menu.flatMap(item =>
    mediaIdFromReference(item.image) || /^\/images\/grocery\/[a-z-]+\.jpg$/.test(item.image) && !item.image.endsWith('/default.jpg')
      ? [{name: item.name, keywords: item.nameSi, barcode: item.barcode, image: item.image, localMarket: true}] : []);
  const matches = matchingCatalogPhotos([...bundledCatalogPhotos, ...ownPhotos, ...remote.filter(photo => !photo.related)], query, barcode);
  const related = remote.filter(photo => photo.related);
  const relatedQuery = relatedPhotoQuery(query);
  const smallPacks = !matches.length && relatedQuery !== query
    ? matchingCatalogPhotos(remote.filter(photo => photo.retailer), relatedQuery, '') : [];
  const hasRelated = related.length > 0 || smallPacks.length > 0;
  const seen = new Set<string>();
  const results = [...matches, ...related, ...smallPacks].filter(photo => {
    if (seen.has(photo.image)) return false;
    seen.add(photo.image);
    return true;
  }).slice(0, 36);

  const canSearch = query.length >= 2 || Boolean(barcode);
  const status = !canSearch ? tr('Enter a product name to find photos.')
    : loading ? tr('Searching online catalogues…')
    : !online ? tr('Online catalogues are available when you reconnect.')
    : unavailable ? tr('Online catalogues are temporarily unavailable.')
    : results.length ? '' : tr('No matching photos in the catalogues. Try Google Images or refine the name.');

  return <section ref={panel} className="photo-catalogue" aria-label={tr("Product photo catalogue")} onKeyDown={event => {
    if (event.key === 'Escape') {event.stopPropagation(); event.preventDefault(); onClose();}
  }}>
    <div className="photo-catalogue-heading">
      <h3>{tr("Search images")}</h3>
      <button type="button" className="icon-button" aria-label={tr("Close photo search")} onClick={onClose}><X size={16}/></button>
    </div>
    <div className="photo-catalogue-search">
      <input type="search" className="input" aria-label={tr("Search product photos")} value={name} maxLength={120}
        placeholder={tr("Product name, brand or pack size")}
        onChange={event => onSearch(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter') {event.preventDefault(); event.stopPropagation();}
        }}/>
      {online && query.length >= 2 && <a className="button button-ghost" href={googlePhotoSearchUrl(query)}
        target="_blank" rel="noreferrer"><ExternalLink size={14}/> {tr('Google Images')}</a>}
    </div>
    {hasRelated && <p className="photo-catalogue-help">{relatedQuery !== query
      ? tr("Related pack sizes") : tr("Related images. Check the product before selecting.")}</p>}
    {results.length > 0 && <ul className="photo-catalogue-grid">
      {results.map(photo => {
        const retailer = photo.retailer && retailerProductUrl(photo.retailer.productUrl);
        const fallbackSrc = retailer || photo.commonsPageId
          ? '/api/product-photos?' + new URLSearchParams({image: photo.image}) : undefined;
        return <li key={photo.image}>
          <button type="button" className="photo-catalogue-result" onClick={() => onChoose(photo)} aria-label={tr("Use photo of {0}", photo.name + (photo.size ? " · " + photo.size : ""))}>
            <span className="photo-catalogue-image"><ProductPhoto src={photo.image} fallbackSrc={fallbackSrc} loading="lazy" referrerPolicy="no-referrer" /></span>
            <strong>{photo.name}</strong>
            <small>{[photo.size, photo.localMarket ? tr('Sri Lanka') : tr('Catalogue match')].filter(Boolean).join(' · ')}</small>
          </button>
          {retailer && <a className="photo-catalogue-credit" href={retailer.href} target="_blank" rel="noreferrer">{retailer.name}</a>}
        {photo.commonsPageId && <a className="photo-catalogue-credit" href={'https://commons.wikimedia.org/?curid=' + photo.commonsPageId} target="_blank" rel="noreferrer">Wikimedia Commons</a>}
        {photo.credit && <a className="photo-catalogue-credit" href={photoCatalogs[photo.credit.catalog].site + '/product/' + photo.credit.barcode} target="_blank" rel="noreferrer">
          {photoCatalogs[photo.credit.catalog].name}
        </a>}
        </li>;
      })}
    </ul>}
    <small className="photo-catalogue-help" role="status">{status}</small>
  </section>;
}
