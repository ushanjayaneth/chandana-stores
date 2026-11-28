import {useTranslation} from "../lib/language";
import {lazy, Suspense, useEffect, useId, useImperativeHandle, useRef, useState, type Ref} from 'react';
import {Camera, ImagePlus, Link, Search, Upload, X} from 'lucide-react';
import {isLegacyInlineProductPhoto, isProductImageReference, MAX_PRODUCT_IMAGE_REFERENCE_LENGTH, mediaIdFromReference} from '../../shared/media';
import {bundledCatalogPhotos, catalogImageUrl, isOnlineCatalogPhoto, matchingCatalogPhotos, photoBarcode, photoQuery, photoSearchTimeoutMs, type CatalogPhoto} from '../../shared/product-photo-catalog';
import {compressFile} from '../lib/media';
import {isDeviceWorkspace} from '../lib/workspace-mode';
import {sharedCloudSource} from '../lib/cloud-shared';
import ProductPhoto from './ProductPhoto';
import '../styles/photos.css';

const ProductPhotoCatalogue = lazy(() => import('./ProductPhotoCatalogue'));

const uploadedReference = (value: string) => Boolean(mediaIdFromReference(value));

export interface PhotoPickerHandle {preparePhoto: () => Promise<string | undefined>}

type ProductSearch = {name: string; barcode: string};
type PhotoSearchResult = {key: string; photos: CatalogPhoto[]; failed: boolean};

export function PhotoPicker({ref, value, onChange, onBusyChange, disabled = false, suggestAutomatically = true}: {ref?: Ref<PhotoPickerHandle>; value: string; onChange: (value: string) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean; suggestAutomatically?: boolean}) {
  const tr = useTranslation();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scrollRequest, setScrollRequest] = useState(0);
  const [manualSearch, setManualSearch] = useState<string | null>(null);
  const [closedKey, setClosedKey] = useState('');
  const [product, setProduct] = useState<ProductSearch>({name: "", barcode: ""});
  const [online, setOnline] = useState(() => navigator.onLine);
  const [searchResult, setSearchResult] = useState<PhotoSearchResult | null>(null);
  const [dismissed, setDismissed] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<CatalogPhoto | null>(null);
  const searchText = manualSearch ?? product.name;
  const query = photoQuery(searchText.slice(0, 120));
  const barcode = manualSearch === null ? photoBarcode(product.barcode) : '';
  const searchKey = JSON.stringify([query, barcode]);
  const validSearch = query.length >= 2 || Boolean(barcode);
  const showCatalogue = scrollRequest > 0 || manualSearch !== null || (suggestAutomatically && !value && validSearch && closedKey !== searchKey);
  const currentResult = searchResult?.key === searchKey ? searchResult : null;
  const remote = online ? currentResult?.photos ?? [] : [];
  const searchPending = showCatalogue && validSearch && online && !currentResult;
  const suggestedPhoto = suggestAutomatically && showCatalogue && !value && manualSearch === null && dismissed !== searchKey
    ? matchingCatalogPhotos([...bundledCatalogPhotos, ...remote.filter(photo => !photo.related)], query, barcode)[0] ?? null
    : null;
  const legacyInline = isLegacyInlineProductPhoto(value);
  const preview = value || suggestedPhoto?.image || "";
  const previewPhoto = selectedPhoto ?? suggestedPhoto;
  const address = selectedPhoto?.image ?? (uploadedReference(value) || legacyInline ? '' : value);

  useEffect(() => {
    const form = picker.current?.closest("form");
    if (!form) return;
    const read = () => {
      const fields = new FormData(form);
      setProduct({name: String(fields.get("name") ?? "").trim(), barcode: String(fields.get("barcode") ?? "").trim()});
    };
    const update = (event: Event) => {
      if (event.target instanceof HTMLInputElement && ["name", "barcode"].includes(event.target.name)) {
        setManualSearch(null);
        read();
      }
    };
    const connection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) setSearchResult(result => result?.failed ? null : result);
    };
    read();
    form.addEventListener("input", update);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {form.removeEventListener("input", update); window.removeEventListener("online", connection); window.removeEventListener("offline", connection);};
  }, []);

  useEffect(() => {
    if (!searchPending || disabled || busy) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({q: query, barcode});
      try {
        const response = await fetch("/api/product-photos?" + params, {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(photoSearchTimeoutMs)])});
        if (!response.ok) throw new Error('Photo search unavailable');
        const data = await response.json();
        if (!Array.isArray(data.photos)) throw new Error('Invalid photo search response');
        if (!controller.signal.aborted) setSearchResult({key: searchKey, photos: data.photos.filter(isOnlineCatalogPhoto), failed: false});
      } catch {
        if (!controller.signal.aborted) setSearchResult({key: searchKey, photos: [], failed: true});
      }
    }, 425);
    return () => {window.clearTimeout(timer); controller.abort();};
  }, [barcode, busy, disabled, query, searchKey, searchPending]);

  function closeCatalogue() {
    setClosedKey(JSON.stringify([photoQuery(product.name.slice(0, 120)), photoBarcode(product.barcode)]));
    setManualSearch(null);
    setScrollRequest(0);
  }
  const uploaded = uploadedReference(value);
  const shared=Boolean(sharedCloudSource());
  async function select(file?: File) {
    if (!file || busy) return;
    setBusy(true); onBusyChange?.(true); setError('');
    try {
      const saved = await compressFile(file);
      setSelectedPhoto(null);
      onChange(saved);
      closeCatalogue();
    }
    catch (cause) {setError(cause instanceof Error ? cause.message : tr("This photo could not be saved."));}
    finally {setBusy(false); onBusyChange?.(false); if (input.current) input.current.value = ''; if (camera.current) camera.current.value = '';}
  }
  async function saveCataloguePhoto(photo: CatalogPhoto) {
    if (mediaIdFromReference(photo.image)) return photo.image;
    const url = photo.retailer || photo.commonsPageId ? '/api/product-photos?' + new URLSearchParams({image: photo.image})
      : photo.credit ? catalogImageUrl(photo.image, photo.credit.catalog) : photo.image;
    if (!url) throw new Error(tr("This photo source is unavailable."));
    const response = await fetch(url, {signal: AbortSignal.timeout(10_000), referrerPolicy: "no-referrer"});
    if (!response.ok || Number(response.headers.get("content-length")) > 5_000_000) throw new Error(tr("This photo could not be downloaded. Try another result."));
    const image = await response.blob();
    if (image.size > 5_000_000) throw new Error(tr("Choose a smaller photo."));
    return compressFile(new File([image], "catalogue-photo.jpg", {type: image.type}), photo.credit);
  }

  useImperativeHandle(ref, () => ({
    async preparePhoto() {
      const photo = selectedPhoto ?? suggestedPhoto;
      if (!photo) return undefined;
      try {
        const saved = await saveCataloguePhoto(photo);
        setSelectedPhoto(null);
        onChange(saved);
        return saved;
      } catch (cause) {
        if (selectedPhoto) throw cause;
        // An unselected suggestion should never block creating a product.
        return undefined;
      }
    },
  }));

  function chooseCataloguePhoto(photo: CatalogPhoto) {
    setSelectedPhoto(photo);
    onChange(photo.image);
    setError('');
    closeCatalogue();
  }
  return <div ref={picker} className="photo-picker product-field-full">
    <div className="photo-picker-heading"><span>{tr("Product photo")}</span><small>{tr("Camera, file or image link")}</small></div>
    <div className="photo-picker-content">
      <div className="photo-picker-preview">{preview && (legacyInline || isProductImageReference(preview)) ? <ProductPhoto src={preview} alt={tr("Product photo preview")} showCredit referrerPolicy="no-referrer" fallbackSrc={previewPhoto?.retailer || previewPhoto?.commonsPageId ? '/api/product-photos?' + new URLSearchParams({image: preview}) : undefined} onError={() => {if (suggestedPhoto) setDismissed(searchKey);}} /> : <ImagePlus size={28} />}</div>
      <div className="photo-picker-controls">
        <label className="photo-picker-link" htmlFor={`${id}-url`}><Link size={14} /><input id={`${id}-url`} className="input" aria-label={tr("Photo URL")} type="text" maxLength={MAX_PRODUCT_IMAGE_REFERENCE_LENGTH} placeholder="https://example.com/photo.jpg" value={address} disabled={disabled || busy} onChange={event => {setSelectedPhoto(null); onChange(event.target.value); setError('');}} /></label>
        <div className="photo-picker-buttons"><button type="button" className="button button-ghost" disabled={disabled || busy} onClick={() => camera.current?.click()}><Camera size={14} />{tr("Take photo")}</button><button type="button" className="button button-ghost" disabled={disabled || busy} onClick={() => input.current?.click()}><Upload size={14} />{busy ? tr("Preparing photo…") : tr("Choose photo")}</button>
        <button type="button" className="button button-ghost" disabled={disabled || busy} aria-expanded={showCatalogue} onClick={() => {
          if (currentResult?.failed) setSearchResult(null);
          setScrollRequest(request => request + 1);
        }}><Search size={14}/> {tr("Search images")}</button>
        {preview && <button type="button" className="icon-button" aria-label={tr("Remove photo")} disabled={disabled || busy} onClick={() => {setDismissed(searchKey); setSelectedPhoto(null); onChange('');}}><X size={15} /></button>}</div>
        <input ref={input} id={`${id}-file`} className="photo-picker-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label={tr("Upload product photo")} disabled={disabled || busy} onChange={event => {void select(event.target.files?.[0]);}} />
        <input ref={camera} id={`${id}-camera`} className="photo-picker-file" type="file" accept="image/*" capture="environment" aria-label={tr("Take product photo")} disabled={disabled || busy} onChange={event => {void select(event.target.files?.[0]);}} />
        {suggestedPhoto && <small>{tr("Suggested photo ·")} {suggestedPhoto.name}{suggestedPhoto.size ? " · " + suggestedPhoto.size : ""}</small>}
        <small role="status">{busy ? tr("Compressing and saving. Please keep this form open.") : uploaded ? shared ? tr("Saved on this device. Photos sync automatically when online.") : isDeviceWorkspace() ? tr("Saved on this device. Included in encrypted backups; cloud upload needs a connected hub.") : 'Compressed photo saved to the branch database.' : tr("JPEG, PNG or WebP. Optimized for clear product photos.")}</small>
      </div>
    </div>
    {showCatalogue && <Suspense fallback={<small role="status">{tr("Opening photo catalogue…")}</small>}>
      <ProductPhotoCatalogue
        name={searchText} query={query} barcode={barcode} remote={remote} loading={searchPending}
        online={online} unavailable={Boolean(currentResult?.failed)} scrollRequest={scrollRequest}
        onSearch={setManualSearch} onChoose={chooseCataloguePhoto} onClose={closeCatalogue}
      />
    </Suspense>}
    {value && !legacyInline && !isProductImageReference(value) && <p className="error-message" role="alert">{tr("Use an HTTPS image link or upload a photo.")}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}
export default PhotoPicker;
