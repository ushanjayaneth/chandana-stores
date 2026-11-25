import {useEffect, useRef, useState} from 'react';
import {Search, X} from 'lucide-react';
import {bundledCatalogPhotos, catalogImageUrl, matchingCatalogPhotos, photoBarcode, photoCatalogs, photoQuery, type CatalogPhoto} from '../../shared/product-photo-catalog';
import {mediaIdFromReference} from '../../shared/media';
import {usePOS} from '../lib/context';
import {useBackLayer} from '../lib/navigation';
import ProductPhoto from './ProductPhoto';

export default function ProductPhotoCatalogue({name, barcode, onChoose, onClose}: {
  name: string;
  barcode: string;
  onChoose: (photo: CatalogPhoto) => Promise<void>;
  onClose: () => void;
}) {
  const {data} = usePOS();
  const [input, setInput] = useState(name);
  const [search, setSearch] = useState({query: name, barcode});
  const [remote, setRemote] = useState<CatalogPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState('');
  const [selection, setSelection] = useState('');
  const [error, setError] = useState('');
  const panel = useRef<HTMLElement>(null);
  const choosing = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const close = () => {if (choosing.current) return false; onClose();};
  useBackLayer(true, close, 'product-photo-catalogue');

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
      setOnlineMessage('Online catalogues are available when you reconnect.');
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
        if (!controller.signal.aborted) setRemote(json.photos.filter(photo => photo.credit && photoCatalogs[photo.credit.catalog] && catalogImageUrl(photo.image, photo.credit.catalog)));
      })
      .catch(() => {if (!controller.signal.aborted) setOnlineMessage('Online catalogues are temporarily unavailable.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [search]);

  const ownPhotos: CatalogPhoto[] = data.menu.flatMap(item =>
    mediaIdFromReference(item.image) || /^\/images\/grocery\/[a-z-]+\.jpg$/.test(item.image) && !item.image.endsWith('/default.jpg')
      ? [{name: item.name, barcode: item.barcode, image: item.image, localMarket: true}] : []);
  const matches = matchingCatalogPhotos([...bundledCatalogPhotos, ...ownPhotos, ...remote], search.query, search.barcode);
  const seen = new Set<string>();
  const results = matches.filter(photo => {
    if (seen.has(photo.image)) return false;
    seen.add(photo.image);
    return true;
  }).slice(0, 36);

  function runSearch() {
    if (choosing.current) return;
    setLoading(false);
    setError('');
    setSearch({query: input.trim(), barcode: input.trim() === name.trim() ? barcode : ''});
  }

  async function choose(photo: CatalogPhoto) {
    if (choosing.current) return;
    choosing.current = true;
    setSelection(photo.image);
    setError('');
    try { await onChoose(photo); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This photo could not be added. Try another result.');
      setSelection('');
    } finally { choosing.current = false; }
  }

  return <section ref={panel} className="photo-catalogue" aria-label="Product photo catalogue" onKeyDown={event => {
    if (event.key === 'Escape') {event.stopPropagation(); event.preventDefault(); close();}
  }}>
    <div className="photo-catalogue-heading">
      <h3>Find product photo</h3>
      <button type="button" className="icon-button" aria-label="Close photo search" disabled={!!selection} onClick={close}><X size={16}/></button>
    </div>
    <div className="photo-catalogue-search">
      <input type="search" className="input" aria-label="Search product photos" value={input} maxLength={120} disabled={!!selection}
        placeholder="Product name, brand or pack size"
        onChange={event => setInput(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter') {event.preventDefault(); event.stopPropagation(); runSearch();}
        }}/>
      <button type="button" className="button" onClick={runSearch} disabled={!!selection || photoQuery(input).length < 2 && !photoBarcode(barcode)}><Search size={14}/> Search</button>
    </div>
    {results.length > 0 && <ul className="photo-catalogue-grid">
      {results.map(photo => <li key={photo.image}>
        <button type="button" className="photo-catalogue-result" onClick={() => void choose(photo)} disabled={!!selection} aria-label={'Use photo of ' + photo.name + (photo.size ? ' · ' + photo.size : '')}>
          <span className="photo-catalogue-image"><ProductPhoto src={photo.image} loading="lazy" referrerPolicy="no-referrer" /></span>
          <strong>{photo.name}</strong>
          <small>{[photo.size, photo.localMarket ? 'Sri Lanka' : 'Catalogue match'].filter(Boolean).join(' · ')}</small>
          {selection === photo.image && <small>Adding photo…</small>}
        </button>
        {photo.credit && <a className="photo-catalogue-credit" href={photoCatalogs[photo.credit.catalog].site + '/product/' + photo.credit.barcode} target="_blank" rel="noreferrer">
          {photoCatalogs[photo.credit.catalog].name}
        </a>}
      </li>)}
    </ul>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <small className="photo-catalogue-help" role="status">
      {loading ? 'Searching online catalogues…' : onlineMessage || (results.length ? '' : 'No matching photos. Try the brand and pack size, or add your own photo.')}
    </small>
    {photoQuery(search.query).length >= 2 && !selection &&
      <a className="photo-catalogue-credit" href={'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(photoQuery(search.query) + ' product package Sri Lanka')} target="_blank" rel="noreferrer">Search in browser</a>}
  </section>;
}
