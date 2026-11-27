import {useTranslation} from "../lib/language";
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArchiveRestore, Check, Database, Download, HardDrive, LoaderCircle, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { usePOS } from '../lib/context';
import { isDeviceWorkspace, useWorkspaceMode } from '../lib/workspace-mode';
import { sharedCloudSource } from '../lib/cloud-shared';
import { deviceStorageStatus, requestDevicePersistence, storageBytes, type DeviceStorageStatus } from '../lib/local/storage';
import { createEncryptedBackup, downloadBackupFile, inspectEncryptedBackup, markBackupDownloaded, restoreDeviceBackup } from '../lib/local/backup';
import { Modal } from './ui';
import {AppInstallSettings} from './InstallApp';
import '../styles/storage.css';

const dateLabel = (value: string) => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
type InspectedBackup = Awaited<ReturnType<typeof inspectEncryptedBackup>>;

export function DeviceStorage() {
  useWorkspaceMode();
  const sharedSource=sharedCloudSource();
  return isDeviceWorkspace()||sharedSource ? <DeviceStoragePanel sharedSource={sharedSource} /> : null;
}
export default DeviceStorage;

function DeviceStoragePanel({sharedSource}:{sharedSource:string|null}) {
  const tr = useTranslation();
  const { data, notify } = usePOS();
  const [status, setStatus] = useState<DeviceStorageStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [dialog, setDialog] = useState<'export' | 'restore' | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InspectedBackup | null>(null);
  const [replaceAccepted, setReplaceAccepted] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const owner = data.user.role === 'owner';
  const businessName = data.settings.businessName;
  const persistenceSupported = typeof navigator.storage?.persist === 'function';

  const refreshStorage = useCallback(async () => {
    setRefreshing(true);
    try {
      setStatus(await deviceStorageStatus());
      setStatusError('');
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : 'Storage information is unavailable.');
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => { void refreshStorage(); }, [refreshStorage, data.serverTime]);
  useEffect(() => {
    const refreshOnFocus = () => void refreshStorage();
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [refreshStorage]);

  function closeDialog() {
    if (busy) return false;
    setDialog(null); setPassword(''); setConfirmPassword(''); setFile(null); setPreview(null); setReplaceAccepted(false); setConfirmName(''); setError('');
    return true;
  }
  function openDialog(next: 'export' | 'restore') {
    setPassword(''); setConfirmPassword(''); setFile(null); setPreview(null); setReplaceAccepted(false); setConfirmName(''); setError(''); setDialog(next);
  }
  async function persist() {
    setPersisting(true);
    try {
      const allowed = await requestDevicePersistence(true);
      await refreshStorage();
      notify(allowed ? tr("Persistent storage is allowed for this workspace.") : tr("The browser did not grant persistent storage. Keep an encrypted backup of your workspace."), allowed ? 'success' : 'error');
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : 'Unable to request persistent storage.');
    } finally { setPersisting(false); }
  }
  async function exportBackup(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 10) { setError(tr("Use a backup password with at least 10 characters.")); return; }
    if (password !== confirmPassword) { setError(tr("The backup passwords do not match.")); return; }
    setBusy(true); setError('');
    try {
      const backup = await createEncryptedBackup(password);
      downloadBackupFile(backup.text, backup.filename);
      await markBackupDownloaded(backup.recordCount).catch(()=>{});
      setDialog(null); setPassword(''); setConfirmPassword('');
      await refreshStorage();
      notify(tr("Encrypted backup download requested. Check your browser’s downloads."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create the encrypted backup.'); }
    finally { setBusy(false); }
  }
  async function inspectBackup(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!file) { setError(tr("Choose an encrypted .retailbackup file.")); return; }
    setBusy(true); setError('');
    try {
      setPreview(await inspectEncryptedBackup(file, password));
      setPassword(''); setReplaceAccepted(false); setConfirmName('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Unable to open this backup. Check the file and password.")); }
    finally { setBusy(false); }
  }
  async function restoreBackup(event: FormEvent) {
    event.preventDefault();
    if (!preview || busy || !replaceAccepted || confirmName.trim() !== businessName) return;
    setBusy(true); setError('');
    try {
      await restoreDeviceBackup(preview.payload);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Unable to restore this backup."));
      setBusy(false);
    }
  }
  const percent = status?.usage !== null && status?.usage !== undefined && status.quota !== null && status.quota > 0 ? Math.min(100, status.usage / status.quota * 100) : null;
  const almostFull = percent !== null && percent >= 90;
  return <section className="panel preference-card device-storage" aria-label={tr("Device storage and backups")}>
    <div className="preference-heading">
      <div className="preference-icon"><HardDrive size={20} /></div>
      <div><h2>{tr("Device storage & backups")}</h2><p>{sharedSource?tr("Bills, payments, products and photos are saved on this device and upload automatically when connected."):tr("Your workspace is saved in this browser on this device.")}</p></div>
      <span className="badge">{sharedSource?tr("Shared cloud workspace"):tr("Device workspace")}</span>
    </div>
    <div className="storage-scope-note"><Database size={16} /><p>{sharedSource?tr("Your devices share Firebase records automatically. You can bill, print and manage products offline after opening this device online once. Keep this app open after reconnecting until pending updates finish. Clearing browser data before upload loses those pending changes."):'This is the original device copy. Open the normal app address and enter your staff PIN to connect your shop data automatically. Keep an encrypted backup outside this browser.'}</p></div>
    <div className="storage-meter-heading"><span>{tr("Browser storage for this website")}</span><button type="button" className="icon-button" aria-label={tr("Refresh device storage")} onClick={() => void refreshStorage()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /></button></div>
    <div className="storage-meter-values"><strong>{status ? storageBytes(status.usage) : tr("Checking storage…")}</strong><span>{status?.quota !== null && status?.quota !== undefined ? tr("of {0} browser quota", storageBytes(status.quota)) : tr("Browser quota not reported")}</span></div>
    {percent !== null && <div className={`storage-meter ${almostFull ? 'storage-meter-high' : ''}`} role="progressbar" aria-label={tr("Browser storage used")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{width:`${percent}%`}} /></div>}
    {almostFull && <p className="storage-quota-note">{tr("Browser storage is nearly full. Save a backup and make room on this device for new transactions.")}</p>}
    <div className="storage-facts">
      {!sharedSource&&<div><span>{tr("Saved records")}</span><strong>{status ? status.records.toLocaleString('en-GB') : '—'}</strong></div>}
      {!sharedSource&&<div><span>{tr("Journal entries")}</span><strong>{status ? status.journal.toLocaleString('en-GB') : '—'}</strong></div>}
      <div><span>{tr("Persistent storage")}</span><strong className={status?.persistent ? 'storage-positive' : ''}>{status ? status.persistent ? tr("Allowed") : tr("Not granted") : tr("Checking…")}</strong></div>
      {sharedSource?<div><span>{tr("Recovery access")}</span><strong>{tr("Your staff PIN")}</strong><small>Open this app to recover confirmed Firebase records.</small></div>:<div><span>{tr("Last backup download requested")}</span><strong>{status?.lastBackup ? dateLabel(status.lastBackup) : tr("No backup recorded")}</strong>{status?.lastBackup ? <small>{status.lastBackupRecords.toLocaleString('en-GB')} {tr("records included")}</small> : null}</div>}
    </div>
    <div className="storage-persistence"><div><ShieldCheck size={17} /><p>{status?.persistent ? tr("This browser has granted persistent storage. Keep an external backup for recovery.") : tr("Persistent storage helps protect this workspace from automatic browser eviction.")}</p></div>{!status?.persistent && <button type="button" className="button button-small" onClick={() => void persist()} disabled={persisting || !persistenceSupported || !status?.available}>{persisting ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />}{persistenceSupported ? tr("Request persistent storage") : tr("Not supported by this browser")}</button>}</div>
    {(statusError || status && !status.available) && <div className="error-message" role="alert">{statusError || tr("This browser’s workspace storage could not be opened. Keep the app open and try refreshing the storage information.")}</div>}
    <p className="storage-footnote">{tr("Usage includes this website’s cached app and saved data. The browser sets the available quota. Persistent storage protects against automatic eviction; it does not prevent deliberate site-data clearing, formatting or device loss. Installing the PWA does not provide that protection either.")}</p>
    {sharedSource?<p className="storage-owner-note">Local .retailbackup export and replacement apply to the original device workspace, not this shared cloud workspace. Keep the original encrypted backup and a separate cloud recovery plan.</p>:owner ? <div className="storage-backup-actions"><button type="button" className="button button-primary" onClick={() => openDialog('export')} disabled={!status?.available}><Download size={15} /> {tr("Export encrypted backup")}</button><button type="button" className="button" onClick={() => openDialog('restore')} disabled={!status?.available}><ArchiveRestore size={15} /> {tr("Restore backup")}</button></div> : <p className="storage-owner-note">Ask the workspace owner to export or restore an encrypted backup.</p>}
    <AppInstallSettings />

    {dialog === 'export' && <Modal title={tr("Export encrypted backup")} subtitle={tr("Save a password-protected copy of this device’s workspace.")} onClose={closeDialog}>
      <form className="storage-backup-form" onSubmit={exportBackup}>
        <div className="storage-dialog-note"><ShieldCheck size={18} /><p>{tr("The backup includes business records, staff credentials, the journal and saved device drafts. Sessions are excluded.")}</p></div>
        <label className="field"><span>{tr("Backup password")}</span><input className="input" type="password" autoComplete="new-password" minLength={10} required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /><small>{tr("Use at least 10 characters. This password cannot be recovered.")}</small></label>
        <label className="field"><span>{tr("Confirm backup password")}</span><input className="input" type="password" autoComplete="new-password" minLength={10} required value={confirmPassword} disabled={busy} onChange={event => setConfirmPassword(event.target.value)} /></label>
        <p className="storage-footnote">{tr("Keep the downloaded file somewhere outside this browser and store its password safely.")}</p>
        {error && <div className="error-message" role="alert">{error}</div>}
        <div className="form-actions"><button type="button" className="button button-ghost" onClick={closeDialog} disabled={busy}>{tr("Cancel")}</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}{busy ? tr("Encrypting backup…") : tr("Download encrypted backup")}</button></div>
      </form>
    </Modal>}
    {dialog === 'restore' && <Modal title={tr("Restore encrypted backup")} subtitle={preview ? tr("Review the backup before replacing this device’s saved workspace.") : tr("Choose a backup file and enter its password to review it.")} onClose={closeDialog}>
      {!preview ? <form className="storage-backup-form" onSubmit={inspectBackup}>
        <label className="field"><span>{tr("Encrypted backup file")}</span><input className="input storage-file-input" type="file" accept=".retailbackup,application/octet-stream" required disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); }} /></label>
        <label className="field"><span>{tr("Backup password")}</span><input className="input" type="password" autoComplete="off" required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <p className="storage-footnote">{tr("Your current data remains in place while the backup is decrypted and checked.")}</p>
        {error && <div className="error-message" role="alert">{error}</div>}
        <div className="form-actions"><button type="button" className="button button-ghost" onClick={closeDialog} disabled={busy}>{tr("Cancel")}</button><button className="button button-primary" disabled={busy || !file}>{busy ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}{busy ? tr("Checking backup…") : tr("Review backup")}</button></div>
      </form> : <form className="storage-backup-form" onSubmit={restoreBackup}>
        <div className="storage-backup-preview"><span className="storage-preview-label">{tr("BACKUP CONTENTS")}</span><h3>{preview.workspace.businessName}</h3><dl><div><dt>{tr("Created")}</dt><dd>{dateLabel(preview.createdAt)}</dd></div><div><dt>{tr("Business records")}</dt><dd>{preview.records.toLocaleString('en-GB')}</dd></div><div><dt>{tr("Journal entries")}</dt><dd>{preview.payload.tables.journal.length.toLocaleString('en-GB')}</dd></div><div><dt>{tr("Staff credentials")}</dt><dd>{preview.payload.tables.credentials.length.toLocaleString('en-GB')}</dd></div><div><dt>{tr("Saved drafts")}</dt><dd>{preview.payload.drafts.length.toLocaleString('en-GB')}</dd></div></dl></div>
        <p className="storage-restore-notice">Restoring replaces this device’s saved workspace. You will need to sign in using a staff PIN from the backup.</p>
        <label className="storage-replace-checkbox"><input type="checkbox" checked={replaceAccepted} disabled={busy} onChange={event => setReplaceAccepted(event.target.checked)} /><span>{tr("Replace the workspace stored on this device with this backup.")}</span></label>
        <label className="field"><span>{tr("Type")} {businessName} {tr("to confirm")}</span><input className="input" autoComplete="off" required disabled={busy} value={confirmName} onChange={event => setConfirmName(event.target.value)} /></label>
        {error && <div className="error-message" role="alert">{error}</div>}
        <div className="form-actions"><button type="button" className="button button-ghost" disabled={busy} onClick={() => { setPreview(null); setFile(null); setPassword(''); setReplaceAccepted(false); setConfirmName(''); setError(''); }}>{tr("Choose another backup")}</button><button className="button button-danger" disabled={busy || !replaceAccepted || confirmName.trim() !== businessName}>{busy ? <LoaderCircle size={15} className="spin" /> : <ArchiveRestore size={15} />}{busy ? tr("Restoring workspace…") : tr("Replace and restore")}</button></div>
      </form>}
    </Modal>}
  </section>;
}
