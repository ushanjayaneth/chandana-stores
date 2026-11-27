import {useTranslation} from "../lib/language";
import {useEffect, useRef, useState} from 'react';
import {Search, X} from 'lucide-react';
import {bundledCatalogPhotos, isOnlineCatalogPhoto, relatedPhotoQuery, matchingCatalogPhotos, photoBarcode, photoCatalogs, photoQuery, type CatalogPhoto} from '../../shared/product-photo-catalog';
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
  const abort = useRef<AbortController | null>(null);
  useBackLayer(true, onClose, 'product-photo-catalogue');

  useEffect(() => {
    panel.current?.scrollIntoView({block: 'nearest'});
    const dispose = () => abort.current?.abort();
    return dispose;
  }, []);

  useEffect(() => {
    const query = photoQuery(search.query).slice(0, 120);
    const code = photoBarcode(search.barcode);
    setRemote([]);
    setOnlineMessage('');
    if (query.length < 2 && !code) return;
    if (navigator.onLine === false) {
      setOnlineMessage(tr("Online catalogues are available when you reconnect."));
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const params = new URLSearchParams({q: query, barcode: code});
    setLoading(true);
    fetch('/api/product-photos?' + params, {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(11_000)])})
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
  const matches = matchingCatalogPhotos([...bundledCatalogPhotos, ...ownPhotos, ...remote], search.query, search.barcode);
  const related = !matches.length && relatedPhotoQuery(search.query) !== photoQuery(search.query)
    ? matchingCatalogPhotos(remote.filter(photo => photo.retailer), relatedPhotoQuery(search.query), '') : [];
  const seen = new Set<string>();
  const results = [...matches, ...related].filter(photo => {
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
    {related.length > 0 && <p className="photo-catalogue-help">{tr("Related pack sizes")}</p>}
    {results.length > 0 && <ul className="photo-catalogue-grid">
      {results.map(photo => <li key={photo.image}>
        <button type="button" className="photo-catalogue-result" onClick={() => onChoose(photo)} aria-label={tr("Use photo of {0}", photo.name + (photo.size ? " · " + photo.size : ""))}>
          <span className="photo-catalogue-image"><ProductPhoto src={photo.image} loading="lazy" referrerPolicy="no-referrer" /></span>
          <strong>{photo.name}</strong>
          <small>{[photo.size, photo.localMarket ? 'Sri Lanka' : 'Catalogue match'].filter(Boolean).join(' · ')}</small>
        </button>
        {photo.retailer && /^https:\/\/hemasestore\.com\/product\/[\w-]+\/?$/.test(photo.retailer.productUrl) && <a className="photo-catalogue-credit" href={photo.retailer.productUrl} target="_blank" rel="noreferrer">{tr("Hemas Estore")}</a>}
        {photo.credit && <a className="photo-catalogue-credit" href={photoCatalogs[photo.credit.catalog].site + '/product/' + photo.credit.barcode} target="_blank" rel="noreferrer">
          {photoCatalogs[photo.credit.catalog].name}
        </a>}
      </li>)}
    </ul>}
    <small className="photo-catalogue-help" role="status">
      {loading ? tr("Searching online catalogues…") : onlineMessage || (results.length ? '' : tr("No matching photos. Try the brand and pack size, or add your own photo."))}
    </small>
  </section>;
}
