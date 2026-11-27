import {useTranslation} from "../lib/language";
import {salePrice,lineAmount,type PriceMode} from '../../shared/retail';
import {useState} from 'react';
import {ArrowRight,PauseCircle,Search,Trash2} from 'lucide-react';
import type {HeldBill} from '../../shared/types';
import {usePOS} from '../lib/context';
import {browserDb} from '../lib/db';
import {commandId,dateTime,money} from '../lib/format';
import {deviceDraftId} from '../lib/workspace-mode';
import {EmptyState,Modal} from '../components/ui';

type HeldLine=HeldBill['lines'][number];

export default function HeldBills({onResume}:{onResume:(bill:HeldBill)=>void}){
  const tr = useTranslation();
  const {data,branchId,mutate,notify,navigate}=usePOS();
  const [search,setSearch]=useState('');
  const [discard,setDiscard]=useState<HeldBill|null>(null);
  const [resume,setResume]=useState<HeldBill|null>(null);
  const [busy,setBusy]=useState(false);
  const [discardCommand,setDiscardCommand]=useState(commandId);
  const bills=(data.heldBills||[]).filter(bill=>bill.branchId===branchId&&bill.status==='held'&&`${bill.label} ${bill.note} ${bill.lines.map(line=>data.menu.find(item=>item.id===line.menuItemId)?.name||'').join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const lineGross=(line:HeldLine,mode:PriceMode='retail')=>{const item=data.menu.find(item=>item.id===line.menuItemId);return item?lineAmount(salePrice(item,mode),line.quantity):0;};
  const lineDiscount=(line:HeldLine,mode:PriceMode='retail')=>Math.min(lineGross(line,mode),Math.max(0,line.discount||0));
  const lineNet=(line:HeldLine,mode:PriceMode='retail')=>lineGross(line,mode)-lineDiscount(line,mode);
  const itemDiscount=(bill:HeldBill)=>bill.lines.reduce((sum,line)=>sum+lineDiscount(line,bill.priceMode),0);
  const cartDiscount=(bill:HeldBill)=>Math.min(bill.lines.reduce((sum,line)=>sum+lineNet(line,bill.priceMode),0),Math.max(0,bill.discount));
  const subtotal=(bill:HeldBill)=>bill.lines.reduce((sum,line)=>sum+lineNet(line,bill.priceMode),0)-cartDiscount(bill);

  async function open(bill:HeldBill){
    const draft=await browserDb.drafts.get(deviceDraftId(branchId)).catch(()=>undefined);
    if(draft?.lines.length&&draft.heldBillId!==bill.id)setResume(bill);
    else onResume(bill);
  }
  async function remove(){
    if(!discard)return;
    setBusy(true);
    try{
      await mutate(`/held-bills/${discard.id}`,{commandId:discardCommand},'DELETE');
      notify(tr("Held bill discarded. No stock or payment was changed."));
      setDiscard(null);
    }catch(error){notify((error as Error).message,'error');}
    finally{setBusy(false);}
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">PAUSE NOW. PICK UP LATER.</div><h1>{tr("Held bills")}<span className="heading-period">.</span></h1><p className="page-subtitle">Saved customer bills awaiting confirmation. Stock changes only when sent.</p></div>
      <button className="button button-primary" onClick={()=>navigate('pos')}>{tr("Point of sale")} <ArrowRight size={14}/></button>
    </div>
    <div className="operations-toolbar">
      <span className="muted" style={{fontSize:12}}>{bills.length} {tr("held")} {bills.length===1?tr("bill"):tr("bills")} {tr("at this branch")}</span>
      <div className="search-input compact"><Search size={14}/><input value={search} onChange={event=>setSearch(event.target.value)} aria-label={tr("Search held bills")} placeholder={tr("Search held bills...")}/></div>
    </div>
    {bills.length?<div className="orders-grid held-bills-grid">{bills.map(bill=><article className="panel order-card" key={bill.id}>
      <div className="order-card-head"><span className="order-type-icon"><PauseCircle size={17}/></span><div><h3>{bill.label}</h3><span>{bill.priceMode==='wholesale'?tr("Wholesale"):tr("Retail")} / {bill.type==='takeaway'?tr("Counter sale"):tr("Delivery")} · {dateTime(bill.updatedAt)}</span></div><span className="badge">{tr("Held")}</span></div>
      <div className="order-card-items">
        {bill.lines.slice(0,4).map((line,index)=><div key={`${line.menuItemId}-${index}`}>
          <span className="order-line-qty">{line.quantity}×</span>
          <span>{data.menu.find(item=>item.id===line.menuItemId)?.name||tr("Unavailable product")}{lineDiscount(line,bill.priceMode)>0&&<small style={{display:'block'}}>{tr("Item discount −")} {money(lineDiscount(line,bill.priceMode))}</small>}</span>
          <span>{money(lineNet(line,bill.priceMode))}</span>
        </div>)}
        {bill.lines.length>4&&<small>+ {bill.lines.length-4} {tr("more items")}</small>}
      </div>
      {bill.note&&<p className="held-bill-note">{bill.note}</p>}
      {(itemDiscount(bill)>0||cartDiscount(bill)>0)&&<p className="held-price-note">{[itemDiscount(bill)>0?`Item discounts ${money(itemDiscount(bill))}`:'',cartDiscount(bill)>0?`Cart discount ${money(cartDiscount(bill))}`:''].filter(Boolean).join(' · ')}</p>}
      <div className="order-card-total"><span>{bill.lines.reduce((sum,line)=>sum+line.quantity,0)} {tr("items")}</span><strong>{money(subtotal(bill))}</strong></div>
      <p className="held-price-note">{tr("Current product prices · charges calculated on confirmation")}</p>
      <div className="order-card-actions">
        <button className="button button-primary button-small" onClick={()=>void open(bill)} disabled={!data.sync.hubOnline}>{tr("Resume bill")} <ArrowRight size={13}/></button>
        <button className="icon-button" aria-label={tr("Discard {0}", bill.label)} disabled={!data.sync.hubOnline} onClick={()=>{setDiscard(bill);setDiscardCommand(commandId());}}><Trash2 size={14}/></button>
      </div>
    </article>)}</div>:<div className="panel"><EmptyState title={tr("No bills on hold")} description={tr("Use Hold bill at the register to save an order without taking payment or deducting stock.")}/></div>}
    {discard&&<Modal title={tr("Discard held bill?")} subtitle={discard.label} onClose={()=>{if(busy)return false;setDiscard(null);}}>
      <p className="muted" style={{fontSize:12}}>{tr("This removes the saved draft from the held-bill list. It does not cancel a confirmed order, take a payment, or adjust stock.")}</p>
      <div className="form-actions"><button className="button button-ghost" onClick={()=>setDiscard(null)} disabled={busy}>{tr("Keep bill")}</button><button className="button button-danger" onClick={()=>void remove()} disabled={busy}>{busy?tr("Discarding..."):tr("Discard bill")}</button></div>
    </Modal>}
    {resume&&<Modal title={tr("A current draft is on this device")} subtitle={tr("Hold it from Point of sale first if you want to keep both orders.")} onClose={()=>setResume(null)}>
      <p className="muted" style={{fontSize:12}}>Resuming this bill will replace the current device draft. The held bill stays safely saved until you confirm its order.</p>
      <div className="form-actions"><button className="button button-ghost" onClick={()=>setResume(null)}>{tr("Keep current draft")}</button><button className="button button-primary" onClick={()=>{const selected=resume;setResume(null);onResume(selected);}}>{tr("Replace draft & resume")}</button></div>
    </Modal>}
  </>;
}
