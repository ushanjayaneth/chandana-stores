import {useTranslation} from "../lib/language";
import {useEffect,useState} from 'react';
import {getCloudSyncState,getLastCloudContact,type CloudSyncState} from '../lib/cloud-sync';
import {sharedCloudSource} from '../lib/cloud-shared';
import {getOfflineStatus,type CloudOfflineStatus} from '../lib/cloud-offline';
import '../styles/cloud-monitor.css';

export default function ConnectivityStatus(){
  const tr = useTranslation();
  const [online,setOnline]=useState(navigator.onLine),[state,setState]=useState<CloudSyncState|null>(null),[contact,setContact]=useState(getLastCloudContact),[clock,setClock]=useState(Date.now());
  const source=sharedCloudSource(),shared=Boolean(source);
  const [offlineState,setOfflineState]=useState<CloudOfflineStatus|null>(null);
  useEffect(()=>{
    const net=()=>setOnline(navigator.onLine);
    const load=()=>{if(source)void getOfflineStatus(source).then(setOfflineState).catch(()=>{});else void getCloudSyncState().then(setState).catch(()=>{});};
    const cloud=()=>setContact(Date.now());
    net();load();
    const failed=()=>setContact(0);
    window.addEventListener('online',net);window.addEventListener('offline',net);window.addEventListener('cloud-monitor-change',load);window.addEventListener('cloud-offline-change',load);window.addEventListener('cloud-contact',cloud);window.addEventListener('cloud-failure',failed);
    const timer=setInterval(()=>{setClock(Date.now());load();},15000);return()=>{clearInterval(timer);window.removeEventListener('online',net);window.removeEventListener('offline',net);window.removeEventListener('cloud-monitor-change',load);window.removeEventListener('cloud-offline-change',load);window.removeEventListener('cloud-contact',cloud);window.removeEventListener('cloud-failure',failed);};
  },[]);
  const recent=online&&(shared?contact>0&&clock-contact<90000:Boolean(state?.lastSeenAt&&clock-new Date(state.lastSeenAt).getTime()<90000&&!state.lastError));
  const pending=shared?offlineState?.pending??0:state?.pending??0;
  const label=shared?(pending?tr('{0} pending', pending):!online&&offlineState?.ready?tr('Offline ready'):recent?tr('Connected'):tr('Reconnecting')):!state?tr('Not connected'):state.needsReconnect?tr('Sign in again'):state.shared?tr('Shared POS'):pending?tr('{0} pending', pending):recent?tr('Synced'):tr('Offline');
  const templateLocal=!shared&&import.meta.env.VITE_ENABLE_CLOUD!=='true';
  const dotColor=pending||shared&&!online&&offlineState?.ready?'amber':!online?'red':recent?'green':'red';
  return <div className="cloud-dots" aria-label={tr("Connection status")}><span title={tr("This device’s network connection")}><i className={`cloud-dot ${online?'green':'red'}`}/><span>{online?tr("Online"):tr("Offline")}</span></span><span title={(!shared&&state?.lastError)||tr("Cloud status reflects the last successful server response. Sign in to the shop workspace to connect.")}><i className={`cloud-dot ${templateLocal?"green":dotColor}`}/><span>{templateLocal?tr("Device storage ready"):tr("Cloud {0}", label)}</span></span></div>;
}
