import {lazy, Suspense, useEffect, useId, useImperativeHandle, useRef, useState, type Ref} from 'react';
import {Camera, ImagePlus, Link, Search, Upload, X} from 'lucide-react';
import {isProductImageReference, mediaIdFromReference} from '../../shared/media';
import {bundledCatalogPhotos, catalogImageUrl, googlePhotoSearchUrl, matchingCatalogPhotos, photoBarcode, photoQuery, type CatalogPhoto} from '../../shared/product-photo-catalog';
import {compressFile} from '../lib/media';
import {isDeviceWorkspace} from '../lib/workspace-mode';
import {sharedCloudSource} from '../lib/cloud-shared';
import ProductPhoto from './ProductPhoto';
import '../styles/photos.css';

const ProductPhotoCatalogue = lazy(() => import('./ProductPhotoCatalogue'));

export interface PhotoPickerHandle {preparePhoto: () => Promise<string | undefined>}

type ProductSearch = {name: string; barcode: string};

export function PhotoPicker({ref, value, onChange, onBusyChange, disabled = false}: {ref?: Ref<PhotoPickerHandle>; value: string; onChange: (value: string) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalogue, setCatalogue] = useState<ProductSearch | null>(null);
  const [product, setProduct] = useState<ProductSearch>({name: "", barcode: ""});
  const [online, setOnline] = useState(() => navigator.onLine);
  const [suggestion, setSuggestion] = useState<{key: string; photo: CatalogPhoto} | null>(null);
  const [dismissed, setDismissed] = useState("");
  const query = photoQuery(product.name);
  const barcode = photoBarcode(product.barcode);
  const searchKey = JSON.stringify([query, barcode]);
  const suggestedPhoto = !value && dismissed !== searchKey && suggestion?.key === searchKey ? suggestion.photo : null;
  const preview = value || suggestedPhoto?.image || "";

  useEffect(() => {
    const form = picker.current?.closest("form");
    if (!form) return;
    const read = () => {
      const fields = new FormData(form);
      setProduct({name: String(fields.get("name") ?? "").trim(), barcode: String(fields.get("barcode") ?? "").trim()});
    };
    const update = (event: Event) => {
      if (event.target instanceof HTMLInputElement && ["name", "barcode"].includes(event.target.name)) read();
    };
    const connection = () => setOnline(navigator.onLine);
    read();
    form.addEventListener("input", update);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {form.removeEventListener("input", update); window.removeEventListener("online", connection); window.removeEventListener("offline", connection);};
  }, []);

  useEffect(() => {
    if (!online || disabled || busy || value || catalogue || dismissed === searchKey || (query.length < 3 && !barcode)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const bundled = matchingCatalogPhotos(bundledCatalogPhotos, query, barcode);
      if (bundled.length && !barcode) {setSuggestion({key: searchKey, photo: bundled[0]}); return;}
      const params = new URLSearchParams({q: query, barcode});
      let onlinePhotos: CatalogPhoto[] = [];
      try {
        const response = await fetch("/api/product-photos?" + params, {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(11_000)])});
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.photos)) onlinePhotos = data.photos.filter((photo: CatalogPhoto) =>
            photo.credit && catalogImageUrl(photo.image, photo.credit.catalog));
        }
      } catch { /* Manual search is available and the product form stays usable. */ }
      if (controller.signal.aborted) return;
      const first = matchingCatalogPhotos([...bundled, ...onlinePhotos], query, barcode)[0];
      setSuggestion(first ? {key: searchKey, photo: first} : null);
    }, 850);
    return () => {window.clearTimeout(timer); controller.abort();};
  }, [barcode, busy, catalogue, disabled, dismissed, online, query, searchKey, value]);
  const uploaded = /^(?:local-image:|\/api\/media\/)/.test(value);
  const shared=Boolean(sharedCloudSource());
  async function select(file?: File) {
    if (!file || busy) return;
    setBusy(true); onBusyChange?.(true); setError('');
    try {onChange(await compressFile(file));}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'This photo could not be saved.');}
    finally {setBusy(false); onBusyChange?.(false); if (input.current) input.current.value = ''; if (camera.current) camera.current.value = '';}
  }
  async function saveCataloguePhoto(photo: CatalogPhoto) {
    if (mediaIdFromReference(photo.image)) return photo.image;
    const url = photo.credit ? catalogImageUrl(photo.image, photo.credit.catalog) : photo.image;
    if (!url) throw new Error("This photo source is unavailable.");
    const response = await fetch(url, {signal: AbortSignal.timeout(10_000), referrerPolicy: "no-referrer"});
    if (!response.ok || Number(response.headers.get("content-length")) > 5_000_000) throw new Error("This photo could not be downloaded. Try another result.");
    const image = await response.blob();
    if (image.size > 5_000_000) throw new Error("Choose a smaller photo.");
    return compressFile(new File([image], "catalogue-photo.jpg", {type: image.type}), photo.credit);
  }

  useImperativeHandle(ref, () => ({
    async preparePhoto() {
      if (!suggestedPhoto) return undefined;
      const saved = await saveCataloguePhoto(suggestedPhoto);
      onChange(saved);
      return saved;
    },
  }));

  async function chooseCataloguePhoto(photo: CatalogPhoto) {
    setBusy(true); onBusyChange?.(true); setError("");
    try {onChange(await saveCataloguePhoto(photo)); setCatalogue(null);}
    finally {setBusy(false); onBusyChange?.(false);}
  }
  return <div ref={picker} className="photo-picker product-field-full">
    <div className="photo-picker-heading"><span>Product photo</span><small>Camera, file or image link</small></div>
    <div className="photo-picker-content">
      <div className="photo-picker-preview">{preview && isProductImageReference(preview) ? <ProductPhoto src={preview} alt="Product photo preview" showCredit referrerPolicy="no-referrer" onError={() => {if (suggestedPhoto) setDismissed(searchKey);}} /> : <ImagePlus size={28} />}</div>
      <div className="photo-picker-controls">
        <label className="photo-picker-link" htmlFor={`${id}-url`}><Link size={14} /><input id={`${id}-url`} className="input" aria-label="Photo URL" type="text" maxLength={500} placeholder="https://example.com/photo.jpg" value={uploaded ? '' : value} disabled={disabled || busy} onChange={event => {onChange(event.target.value); setError('');}} /></label>
        <div className="photo-picker-buttons"><button type="button" className="button button-ghost" disabled={disabled || busy} onClick={() => camera.current?.click()}><Camera size={14} />Take photo</button><button type="button" className="button button-ghost" disabled={disabled || busy} onClick={() => input.current?.click()}><Upload size={14} />{busy ? 'Preparing photo…' : 'Choose photo'}</button>
        <button type="button" className="button button-ghost" disabled={disabled || busy} aria-expanded={!!catalogue} onClick={event => {
          if (catalogue) {setCatalogue(null); return;}
          const form = event.currentTarget.form;
          const fields = form ? new FormData(form) : null;
          setCatalogue({name: String(fields?.get("name") ?? "").trim(), barcode: String(fields?.get("barcode") ?? "").trim()});
        }}><Search size={14}/> Find product photo</button>
        {query.length >= 2 && <a className="button button-ghost" href={googlePhotoSearchUrl(product.name)} target="_blank" rel="noreferrer">Search Google Images</a>}
        {preview && <button type="button" className="icon-button" aria-label="Remove photo" disabled={disabled || busy} onClick={() => {setDismissed(searchKey); onChange('');}}><X size={15} /></button>}</div>
        <input ref={input} id={`${id}-file`} className="photo-picker-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload product photo" disabled={disabled || busy} onChange={event => {void select(event.target.files?.[0]);}} />
        <input ref={camera} id={`${id}-camera`} className="photo-picker-file" type="file" accept="image/*" capture="environment" aria-label="Take product photo" disabled={disabled || busy} onChange={event => {void select(event.target.files?.[0]);}} />
        {suggestedPhoto && <small>Suggested photo · {suggestedPhoto.name}{suggestedPhoto.size ? " · " + suggestedPhoto.size : ""}</small>}
        <small role="status">{busy ? 'Compressing and saving. Please keep this form open.' : uploaded ? shared ? 'Saved on this device. Photos sync automatically when online.' : isDeviceWorkspace() ? 'Saved on this device. Included in encrypted backups; cloud upload needs a connected hub.' : 'Compressed photo saved to the branch database.' : 'JPEG, PNG or WebP. Optimized for clear product photos.'}</small>
      </div>
    </div>
    {catalogue && <Suspense fallback={<small role="status">Opening photo catalogue…</small>}>
      <ProductPhotoCatalogue {...catalogue} onChoose={chooseCataloguePhoto} onClose={() => setCatalogue(null)} />
    </Suspense>}
    {value && !isProductImageReference(value) && <p className="error-message" role="alert">Use an HTTPS image link or upload a photo.</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}
export default PhotoPicker;
