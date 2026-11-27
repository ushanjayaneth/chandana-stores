import {useTranslation} from "../lib/language";
import {useEffect, useRef, useState} from 'react';
import {Search, X} from 'lucide-react';
import {bundledCatalogPhotos, isOnlineCatalogPhoto, relatedPhotoQuery, retailerProductUrl, matchingCatalogPhotos, photoBarcode, photoCatalogs, photoQuery, photoSearchTimeoutMs, type CatalogPhoto} from '../../shared/product-photo-catalog';
import {mediaIdFromReference} from '../../shared/media';
import {usePOS} from '../lib/context';
import {useBackLayer} from '../lib/navigation';
import ProductPhoto from './ProductPhoto';

export default function ProductPhotoCatalogue({name, barcode, onChoose, onClose}: {
  name: string;
  barcode: string;
  onChoose: (photo: CatalogPhoto) => void;
  onClose: () => void;
}) {
  const tr = useTranslation();
  const {data} = usePOS();
  const [input, setInput] = useState(name);
  const [search, setSearch] = useState({query: name, barcode});
  const [remote, setRemote] = useState<CatalogPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState('');
  const panel = useRef<HTMLElement>(null);

  useBackLayer(true, onClose, 'product-photo-catalogue');

  useEffect(() => {
    panel.current?.scrollIntoView({block: 'nearest'});

  }, []);

  useEffect(() => {
    const query = photoQuery(search.query).slice(0, 120);
    const code = photoBarcode(search.barcode);
    setRemote([]);
    setOnlineMessage('');
    setLoading(false);
    if (query.length < 2 && !code) return;
    if (navigator.onLine === false) {
      setOnlineMessage(tr("Online catalogues are available when you reconnect."));
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({q: query, barcode: code});
    setLoading(true);
    fetch('/api/product-photos?' + params, {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(photoSearchTimeoutMs)])})
      .then(async response => {
        if (!response.ok) throw new Error('Search unavailable');
        const json = await response.json() as {photos: CatalogPhoto[]};
        if (!Array.isArray(json.photos)) throw new Error('Search unavailable');
        if (!controller.signal.aborted) setRemote(json.photos.filter(isOnlineCatalogPhoto));
      })
      .catch(() => {if (!controller.signal.aborted) setOnlineMessage(tr("Online catalogues are temporarily unavailable."));})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [search]);

  const ownPhotos: CatalogPhoto[] = data.menu.flatMap(item =>
    mediaIdFromReference(item.image) || /^\/images\/grocery\/[a-z-]+\.jpg$/.test(item.image) && !item.image.endsWith('/default.jpg')
      ? [{name: item.name, barcode: item.barcode, image: item.image, localMarket: true}] : []);
  const matches = matchingCatalogPhotos([...bundledCatalogPhotos, ...ownPhotos, ...remote.filter(photo => !photo.related)], search.query, search.barcode);
  const related = remote.filter(photo => photo.related);
  const relatedQuery = relatedPhotoQuery(search.query);
  const smallPacks = !matches.length && relatedQuery !== photoQuery(search.query)
    ? matchingCatalogPhotos(remote.filter(photo => photo.retailer), relatedQuery, '') : [];
  const hasRelated = related.length > 0 || smallPacks.length > 0;
  const seen = new Set<string>();
  const results = [...matches, ...related, ...smallPacks].filter(photo => {
    if (seen.has(photo.image)) return false;
    seen.add(photo.image);
    return true;
  }).slice(0, 36);

  function runSearch() {
    setLoading(false);
    setSearch({query: input.trim(), barcode: input.trim() === name.trim() ? barcode : ''});
  }

  return <section ref={panel} className="photo-catalogue" aria-label={tr("Product photo catalogue")} onKeyDown={event => {
    if (event.key === 'Escape') {event.stopPropagation(); event.preventDefault(); onClose();}
  }}>
    <div className="photo-catalogue-heading">
      <h3>{tr("Search images")}</h3>
      <button type="button" className="icon-button" aria-label={tr("Close photo search")} onClick={onClose}><X size={16}/></button>
    </div>
    <div className="photo-catalogue-search">
      <input type="search" className="input" aria-label={tr("Search product photos")} value={input} maxLength={120}
        placeholder={tr("Product name, brand or pack size")}
        onChange={event => setInput(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter') {event.preventDefault(); event.stopPropagation(); runSearch();}
        }}/>
      <button type="button" className="button" onClick={runSearch} disabled={photoQuery(input).length < 2 && !photoBarcode(barcode)}><Search size={14}/> {tr("Search")}</button>
    </div>
    {hasRelated && <p className="photo-catalogue-help">{relatedQuery !== photoQuery(search.query)
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
    <small className="photo-catalogue-help" role="status">
      {loading ? tr("Searching online catalogues…") : onlineMessage || (results.length ? '' : tr("No matching photos. Try the brand and pack size, or add your own photo."))}
    </small>
  </section>;
}
