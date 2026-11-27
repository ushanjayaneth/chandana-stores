import {useLanguage, useTranslation} from "../lib/language";
import {isWeightedUnit,lineAmount,roundSaleQuantity,salePrice,type PriceMode} from '../../shared/retail';
import ProductPhoto from '../components/ProductPhoto';
import NumberPad from '../components/NumberPad';
import MeasuredSaleDialog from '../components/MeasuredSaleDialog';
import {deviceDraftId} from '../lib/workspace-mode';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Coffee,
  CookingPot,
  CupSoda,
  Flame,
  Grid2X2,
  IceCreamBowl,
  Leaf,
  Minus,
  NotebookPen,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Package,
  SlidersHorizontal,
  Trash2,
  Truck,
  UtensilsCrossed,
  Wallet,
  X,
  CheckCircle2,
  Send,
  ShieldCheck,
  PauseCircle,
  Tag,
  Users,
} from "lucide-react";
import type { CartLine, MenuItem, Order } from "../../shared/types";
import { usePOS } from "../lib/context";
import { ApiError } from "../lib/api";
import { browserDb } from "../lib/db";
import { commandId, money, number, time } from "../lib/format";
import {productStockState} from '../../shared/stock';
import { Modal, Spinner, StatusBadge } from "../components/ui";
import { useBackLayer } from "../lib/navigation";
import { useDevicePreferences, type ShortcutAction } from "../lib/preferences";
import {registerAppUpdateGuard, saveDraftBeforeUpdate} from '../lib/update-safety';

const CategoryDialog=lazy(()=>import('./Products').then(module=>({default:module.CategoryDialog})));
const ProductDialog=lazy(()=>import('./Products').then(module=>({default:module.ProductDialog})));

const categoryIcons: Record<string, typeof Grid2X2> = {
  rice: CookingPot,
  kottu: Flame,
  noodles: UtensilsCrossed,
  "short-eats": Leaf,
  beverages: CupSoda,
  desserts: IceCreamBowl,
};
export default function POS({
  selectedOrderId,
  onSelectOrder,
  onReceipt,
}: {
  selectedOrderId: string | null;
  onSelectOrder: (id: string | null) => void;
  onReceipt: (id: string, print?: boolean) => void;
}) {
  const tr = useTranslation();
  const { data, branchId, mutate, notify, navigate } = usePOS();
  const {locale} = useLanguage();
  const displayName = (item: {name: string; nameSi?: string}) => locale === "si" && item.nameSi ? item.nameSi : item.name;
  const preferences = useDevicePreferences();
  const [priceMode,setPriceMode]=useState<PriceMode>(()=>{try{return localStorage.getItem('retail-price-mode')==='wholesale'?'wholesale':'retail';}catch{return 'retail';}});
  const pricedMenu=useMemo(()=>data.menu.map(item=>({...item,price:salePrice(item,priceMode)})),[data.menu,priceMode]);
  function changePriceMode(mode:PriceMode){if(busy||activeOrder||mode===priceMode)return;setPriceMode(mode);setOrderCommand(commandId());try{localStorage.setItem('retail-price-mode',mode);}catch{}}
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("featured");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [type, setType] = useState<Order["type"]>("takeaway");
  const [tableId, setTableId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState(0);
  const [orderCommand, setOrderCommand] = useState(commandId);
  const [loadedBranch, setLoadedBranch] = useState("");
  const [draftSaveError,setDraftSaveError]=useState('');
  const [busy, setBusy] = useState(false);
  const checkoutRef = useRef<HTMLButtonElement>(null);
  const savingOrder = useRef(false);
  const [paymentOrder, setPaymentOrder] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState(false);
  const [discountDialog, setDiscountDialog] = useState(false);
  const [itemDiscount, setItemDiscount] = useState<string|null>(null);
  const [creditCustomerDialog,setCreditCustomerDialog]=useState(false);
  const [addCustomerDialog,setAddCustomerDialog]=useState(false);
  const [paymentMethod,setPaymentMethod]=useState<'cash'|'credit'>('cash');
  const [mobileCart, setMobileCart] = useState(false);
  const [heldBillId, setHeldBillId] = useState("");
  const [heldBillUpdatedAt, setHeldBillUpdatedAt] = useState("");
  const [holdDialog, setHoldDialog] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [holdCommand, setHoldCommand] = useState(commandId);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [newOrderDialog, setNewOrderDialog] = useState(false);
  const [itemNote, setItemNote] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [quantityItem,setQuantityItem]=useState<string|null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef({ text: "", start: 0, last: 0 });
  const draftReadyBranch = useRef('');
  const pendingProductAdds = useRef<Array<{branchId:string;item:MenuItem}>>([]);
  useBackLayer(mobileCart, () => setMobileCart(false), "order-drawer");
  useBackLayer(!!search, () => setSearch(""), "menu-search");
  useBackLayer(category !== "all", () => setCategory("all"), "menu-category");
  const order = data.orders.find((o) => o.id === selectedOrderId);
  const activeOrder =
    order && !["completed", "cancelled"].includes(order.status) ? order : null;
  useEffect(()=>{if(activeOrder?.priceMode)setPriceMode(activeOrder.priceMode);},[activeOrder?.id,activeOrder?.priceMode]);
  const canTakePayment = ["owner", "manager", "cashier"].includes(
    data.user.role,
  );
  const canManageCatalog = ["owner", "manager"].includes(data.user.role);
  useEffect(() => {
    let active = true;
    setLoadedBranch("");
    draftReadyBranch.current = "";
    void browserDb.drafts
      .get(deviceDraftId(branchId))
      .then((draft) => {
        if (!active) return;
        setLines(draft?.lines || []);
        if(draft?.priceMode)setPriceMode(draft.priceMode);
        setType(draft?.type || 'takeaway');
        setTableId(draft?.tableId || "");
        setCustomerId(draft?.customerId || "");
        setHeldBillId(draft?.heldBillId || "");
        setHeldBillUpdatedAt(draft?.heldBillUpdatedAt || "");
        setNote(draft?.note || "");
        setDiscount(draft?.discount || 0);
        setOrderCommand(draft?.commandId || commandId());
        const resumeId = sessionStorage.getItem("retail-resume-held");
        if (resumeId) {
          sessionStorage.removeItem("retail-resume-held");
          const bill = (data.heldBills || []).find(
            (item) =>
              item.id === resumeId &&
              item.branchId === branchId &&
              item.status === "held",
          );
          if (bill) {
            setLines(bill.lines);
            setPriceMode(bill.priceMode || "retail");
            setType(bill.type);
            setTableId(bill.tableId || "");
            setCustomerId(bill.customerId || "");
            setNote(bill.note);
            setDiscount(bill.discount);
            setHeldBillId(bill.id);
            setHeldBillUpdatedAt(bill.updatedAt);
            setOrderCommand(commandId());
          } else
            notify(
              tr("This held bill is no longer available at this branch."),
              "error",
            );
        }
        const newTable = sessionStorage.getItem("retail-new-table");
        if (newTable) {
          setType("dine-in");
          setTableId(newTable);
          sessionStorage.removeItem("retail-new-table");
        }
        // Apply input received while IndexedDB was opening after the saved draft.
        // A quick scanner burst must survive the asynchronous draft restore.
        draftReadyBranch.current = branchId;
        const pending = pendingProductAdds.current.filter(entry=>entry.branchId===branchId);
        pendingProductAdds.current = pendingProductAdds.current.filter(entry=>entry.branchId!==branchId);
        for(const entry of pending)add(entry.item);
        setLoadedBranch(branchId);
      })
      .catch(() => {
        if (active) {
          setLines([]);
          setLoadedBranch('');
          setDraftSaveError(tr("Device draft storage is unavailable. Keep this page open until your order has been saved."));
          notify(
            tr("Device storage is unavailable. Keep this page open until your order is sent."),
            "error",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [branchId, notify]);
  const currentDraft = useMemo(() => loadedBranch === branchId ? {
        id: deviceDraftId(branchId),
        lines,
        priceMode,
        type,
        tableId,
        customerId,
        heldBillId,
        heldBillUpdatedAt,
        note,
        discount,
        commandId: orderCommand,
        updatedAt: new Date().toISOString(),
      } : null, [lines,priceMode,type,tableId,customerId,heldBillId,heldBillUpdatedAt,note,discount,orderCommand,loadedBranch,branchId]);
  const currentDraftRef = useRef(currentDraft);
  currentDraftRef.current = currentDraft;
  useLayoutEffect(() => registerAppUpdateGuard(async signal => {
    while (!signal.aborted) {
      const draft = currentDraftRef.current;
      if (!draft) throw new Error('The current draft is still opening. Wait before reloading the app.');
      try {await saveDraftBeforeUpdate(draft);}
      catch {
        setDraftSaveError(tr("This draft could not be saved on this device. Keep this page open and free storage before leaving."));
        throw new Error('Reload stopped because the current draft could not be saved. Free device storage and try again.');
      }
      if (signal.aborted) return;
      if (currentDraftRef.current === draft) {setDraftSaveError('');return;}
      // Edits made while a previous write was pending must also be durable.
    }
  }), []);
  useEffect(() => {
    if (!currentDraft) return;
    void saveDraftBeforeUpdate(currentDraft)
      .then(()=>setDraftSaveError(''))
      .catch(()=>setDraftSaveError(tr("This draft could not be saved on this device. Keep this page open and free storage before leaving.")));
  }, [currentDraft]);
  const items = pricedMenu
    .filter(
      (i) =>
        (category === "all" || i.categoryId === category) &&
        `${i.name} ${i.description}`
          .concat(` ${i.nameSi || ""} ${i.barcode || ""} ${i.sku || ""}`)
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "price-low"
        ? a.price - b.price
        : sort === "price-high"
          ? b.price - a.price
          : sort === "name"
            ? a.name.localeCompare(b.name)
            : 0,
    );
  const cart = lines
    .map((line) => ({
      ...line,
      item: pricedMenu.find((i) => i.id === line.menuItemId)!,
    }))
    .filter((line) => line.item);
  const quantity = cart.length;
  const subtotal =
    activeOrder?.subtotal ??
    cart.reduce((sum, l) => sum + lineAmount(l.item.price,l.quantity), 0);
  const saleLines = cart.map(line=>({menuItemId:line.menuItemId,quantity:line.quantity,note:line.note,discount:Math.min(Math.max(0,line.discount||0),lineAmount(line.item.price,line.quantity))}));
  const itemDiscountTotal=activeOrder?activeOrder.lines.reduce((sum,line)=>sum+(line.discount||0),0):saleLines.reduce((sum,line)=>sum+line.discount,0);
  const cartDiscount=activeOrder?(activeOrder.cartDiscount??Math.max(0,activeOrder.discount-itemDiscountTotal)):Math.min(discount,Math.max(0,subtotal-itemDiscountTotal));
  const actualDiscount=itemDiscountTotal+cartDiscount;
  const discountLine=cart.find(line=>line.menuItemId===itemDiscount);
  const serviceCharge =
    activeOrder?.serviceCharge ??
    (type === "dine-in"
      ? Math.round(
          ((subtotal - actualDiscount) * data.settings.serviceChargeRate) / 100,
        )
      : 0);
  const tax =
    activeOrder?.tax ??
    Math.round(
      ((subtotal - actualDiscount + serviceCharge) * data.settings.taxRate) /
        100,
    );
  const total =
    activeOrder?.total ?? subtotal - actualDiscount + serviceCharge + tax;
  const currentShift = data.shifts.find(s => s.branchId === branchId && s.status === "open");
  const quantityProduct = pricedMenu.find(item => item.id === quantityItem);
  function applyQuantity(count: number) {
    const item = quantityProduct;
    if (!item) return;
    setLines(previous => previous.some(line => line.menuItemId === item.id) ?
      previous.map(line => line.menuItemId === item.id ? {...line, quantity: count, discount: Math.min(line.discount || 0, lineAmount(item.price, count))} : line) :
      [...previous, {menuItemId: item.id, quantity: count, note: ''}]);
    setQuantityItem(null);
  }
  function add(item: MenuItem) {
    if (busy) return;
    if (!item.available) return;
    if (activeOrder) {
      notify(tr("Start a new order to add more items."), "error");
      return;
    }
    if(draftReadyBranch.current!==branchId){
      pendingProductAdds.current.push({branchId,item});
      return;
    }
    if (isWeightedUnit(item.saleUnit)) {setQuantityItem(item.id);return;}
    setLines((previous) => {
      const existing = previous.find((l) => l.menuItemId === item.id);
      return existing
        ? previous.map((l) =>
            l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...previous, { menuItemId: item.id, quantity: 1, note: "" }];
    });
  }
  useEffect(()=>{
    const listener=(event:Event)=>{
      if(busy||activeOrder||document.querySelector('[role="dialog"]'))return;
      const value=(event as CustomEvent<{value?:string}>).detail?.value?.trim();if(!value)return;
      const product=pricedMenu.find(item=>item.barcode===value||item.sku===value);
      if(product)add(product);else notify(tr("That barcode is not assigned to a product."),'error');
    };
    window.addEventListener('retail:scanner-code',listener);return()=>window.removeEventListener('retail:scanner-code',listener);
  });
  function adjust(id: string, delta: number) {
    if (busy) return;
    setLines((previous) =>
      previous
        .map((l) =>
          l.menuItemId === id ? { ...l, quantity: roundSaleQuantity(l.quantity + delta),discount:Math.min(l.discount||0,Math.max(0,l.quantity+delta)*(pricedMenu.find(item=>item.id===id)?.price||0)) } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }
  function resetOrder() {
    onSelectOrder(null);
    setLines([]);
    setNote("");
    setDiscount(0);
    setCustomerId("");
    setTableId("");
    setType('takeaway');
    setHeldBillId("");
    setHeldBillUpdatedAt("");
    setOrderCommand(commandId());
  }
  function newOrder() {
    if (busy) return;
    if (lines.length) {
      setNewOrderDialog(true);
      return;
    }
    resetOrder();
  }
  async function submit(pay = false,preferredMethod:'cash'|'credit'='cash',creditCustomerId?:string) {
    if (activeOrder) {
      if (pay) {setPaymentMethod(preferredMethod);setPaymentOrder(activeOrder.id);}
      return;
    }
    if (!lines.length || savingOrder.current) return;
    savingOrder.current = true;
    setBusy(true);
    try {
      const result = await mutate<{ ok: boolean; order: Order }>("/orders", {
        commandId: orderCommand,
        branchId,
        priceMode,
        type,
        tableId: type === "dine-in" ? tableId || null : null,
        customerId: creditCustomerId || customerId || null,
        ...(heldBillId
          ? { heldBillId, expectedHeldUpdatedAt: heldBillUpdatedAt }
          : {}),
        note,
        discount: cartDiscount,
        lines:saleLines,
      });
      onSelectOrder(result.order.id);
      setLines([]);
      setOrderCommand(commandId());
      setNote("");
      setDiscount(0);
      setHeldBillId("");
      setHeldBillUpdatedAt("");
      notify(`Order ${result.order.number} saved at the counter.`);
      if(pay&&result.order.total===0){resetOrder();setMobileCart(false);onReceipt(result.order.id);}
      else if (pay) {setPaymentMethod(preferredMethod);setPaymentOrder(result.order.id);}
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      savingOrder.current = false;
      setBusy(false);
    }
  }
  async function closeTable() {
    if (!activeOrder) return;
    setBusy(true);
    try {
      await mutate(
        `/orders/${activeOrder.id}/status`,
        {
          commandId: commandId(),
          expectedVersion: activeOrder.version,
          status: "completed",
        },
        "PATCH",
      );
      notify(activeOrder.tableId ? tr("Table closed and ready for the next guest.") : tr("Order completed and ready for the next guest."));
      onReceipt(activeOrder.id);
      onSelectOrder(null);
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  function openHold() {
    if (busy) return;
    if (activeOrder) {
      notify(
        "Only unconfirmed drafts can be held. Confirmed orders remain in Orders.",
        "error",
      );
      return;
    }
    if (!lines.length) {
      notify(tr("Add products before holding a bill."), "error");
      return;
    }
    setHoldLabel(
      data.heldBills.find((bill) => bill.id === heldBillId)?.label ||
        (tableId
          ? `Table ${data.tables.find((table) => table.id === tableId)?.name || tableId}`
          : `Customer ${time(new Date().toISOString())}`),
    );
    setHoldCommand(commandId());
    setHoldDialog(true);
  }
  async function hold() {
    if (!lines.length || busy || !holdLabel.trim()) return;
    setBusy(true);
    try {
      await mutate(
        heldBillId ? `/held-bills/${heldBillId}` : "/held-bills",
        {
          commandId: holdCommand,
          branchId,
          label: holdLabel.trim(),
          priceMode,
          type,
          tableId: type === "dine-in" ? tableId || null : null,
          customerId: customerId || null,
          note,
          discount: cartDiscount,
          lines:saleLines,
          ...(heldBillId ? { expectedUpdatedAt: heldBillUpdatedAt } : {}),
        },
        heldBillId ? "PUT" : "POST",
      );
      setHoldDialog(false);
      setMobileCart(false);
      resetOrder();
      notify(
        tr("Bill held. No stock has been deducted and no payment was recorded."),
      );
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent<ShortcutAction>).detail;
      if (action === "search") {
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (action === "new-bill") newOrder();
      else if (action === "hold-bill") openHold();
      else if (action === "order-drawer") setMobileCart(true);
      else if (action === "checkout") checkoutRef.current?.click();
      else if (action === "print") {
        if (activeOrder) {
          onReceipt(activeOrder.id);
          setTimeout(() => window.dispatchEvent(new Event('retail:print-receipt')), 250);
        } else notify(tr("Open a confirmed order to print its receipt."));
      }
    };
    window.addEventListener("workspace-shortcut", handler);
    return () => window.removeEventListener("workspace-shortcut", handler);
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      const now = performance.now();
      const scan = scanRef.current;
      if (event.key === "Enter") {
        const barcode = scan.text;
        const fast =
          barcode.length >= 3 &&
          now - scan.last < 140 &&
          (now - scan.start) / barcode.length < 70;
        scan.text = "";
        if (barcode.length >= 3 && now - scan.last < 1000) {
          const product = pricedMenu.find(
            (item) => item.barcode === barcode || item.sku === barcode,
          );
          if (product || fast) {
            event.preventDefault();
            if (product) add(product);
            else notify(tr("That barcode is not assigned to a product."), "error");
            return;
          }
        }
        const checkout = checkoutRef.current;
        const focusedControl = target.closest("button, a, [role=button]");
        if (checkout && !checkout.disabled && !event.repeat && !event.shiftKey &&
            (!focusedControl || focusedControl === checkout || target.closest(".product-card"))) {
          event.preventDefault();
          checkout.click();
        }
        return;
      }
      if (event.key.length === 1 && /^[\x20-\x7E]$/.test(event.key)) {
        if (now - scan.last > 1000) {
          scan.text = "";
          scan.start = now;
        }
        if (!scan.text) scan.start = now;
        scan.text = (scan.text + event.key).slice(-160);
        scan.last = now;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pricedMenu, activeOrder, busy, notify]);
  return (
    <>
      {quantityProduct && (isWeightedUnit(quantityProduct.saleUnit) ?
        <MeasuredSaleDialog item={quantityProduct} quantity={cart.find(line => line.menuItemId === quantityProduct.id)?.quantity ?? 1}
          onClose={() => setQuantityItem(null)} onConfirm={applyQuantity}/> :
        <NumberPad title={tr("Item quantity")} value={String(cart.find(line => line.menuItemId === quantityProduct.id)?.quantity ?? 1)}
          min={1} max={1000} onClose={() => setQuantityItem(null)} onConfirm={value => applyQuantity(Number(value))}/>)}
      {draftSaveError&&<div className="error-message" role="alert">{draftSaveError}</div>}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> {tr("YOUR COUNTER, UNDER CONTROL")}</div>
          <h1>{tr("Point of sale")}<span className="heading-period">.</span>
          </h1>
          <p className="page-subtitle">
            {tr("Fast checkout. Accurate stock. Every sale accounted for.")}
          </p>
        </div>
        <div className="pos-heading-meta">
          <span className={`shift-pill ${!currentShift ? "shift-closed" : ""}`}>
            <span className="status-dot" />
            {currentShift ? tr("Shift open") : tr("No open shift")}
          </span>
          <button
            className="button button-ghost new-order-button"
            onClick={() => navigate("held-bills")}
          >
            <PauseCircle size={14} /> {tr("Held bills")}{!!data.heldBills.length && (
              <span className="held-count">{data.heldBills.length}</span>
            )}
          </button>
          <button
            className="button button-ghost new-order-button"
            onClick={newOrder}
            disabled={busy}
          >
            <Plus size={14} /> {tr("New order")}</button>
        </div>
      </div>
      <div className="price-mode-bar"><div className="price-mode-switch" role="group" aria-label={tr("Selling price mode")}><button type="button" className={priceMode==='retail'?'active':''} aria-pressed={priceMode==='retail'} disabled={!!activeOrder||busy} onClick={()=>changePriceMode('retail')}><ShoppingBag size={15}/><span>{tr("Retail")}<small>{tr("Everyday prices")}</small></span></button><button type="button" className={priceMode==='wholesale'?'active':''} aria-pressed={priceMode==='wholesale'} disabled={!!activeOrder||busy} onClick={()=>changePriceMode('wholesale')}><Package size={16}/><span>{tr("Wholesale")}<small>{tr("Trade prices")}</small></span></button></div><p>{priceMode==='wholesale'?tr("Wholesale prices apply to this bill. Products without a trade price use retail."):tr("Retail prices apply to this bill. Switch to Wholesale for trade customers.")}</p></div>
      <div className="pos-layout">
        <section className="catalog">
          <div className="catalog-tools">
            <div className="search-input">
              <Search size={16} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const query = search.trim();
                  if (!query) return;
                  const product = pricedMenu.find(
                    (item) =>
                      item.barcode === query ||
                      item.sku?.toLowerCase() === query.toLowerCase(),
                  );
                  if (!product) return;
                  event.preventDefault();
                  add(product);
                  setSearch("");
                }}
                placeholder={tr("Search name, SKU or barcode...")}
                aria-label={tr("Search products")}
              />
              <kbd>{preferences.shortcuts.search}</kbd>
              {search && (
                <button onClick={() => setSearch("")} aria-label={tr("Clear search")}>
                  <X size={13} />
                </button>
              )}
            </div>
            <label className="sort-select">
              <SlidersHorizontal size={14} />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label={tr("Sort products")}
              >
                <option value="featured">{tr("Featured")}</option>
                <option value="price-low">{tr("Price: low to high")}</option>
                <option value="price-high">{tr("Price: high to low")}</option>
                <option value="name">{tr("Name")}</option>
              </select>
            </label>
          </div>
          {canManageCatalog && (
            <div className="pos-catalog-actions">
              <span>{tr("Manage products")}</span>
              <button
                className="button button-ghost"
                onClick={() => setCategoryDialog(true)}
              >
                <Tag size={13} /> {tr("Add category")}</button>
              <button
                className="button button-ghost"
                onClick={() => setProductDialog(true)}
              >
                <Plus size={13} /> {tr("Add product")}</button>
            </div>
          )}
          <div
            className="category-tabs"
            role="tablist"
            aria-label={tr("Menu categories")}
          >
            <button
              role="tab"
              aria-selected={category === "all"}
              className={`category-tab ${category === "all" ? "active" : ""}`}
              onClick={() => setCategory("all")}
            >
              <Grid2X2 size={17} />
              <span>{tr("All items")}</span>
              <small>{data.menu.length}</small>
            </button>
            {data.categories.map((c) => {
              const Icon = categoryIcons[c.id] || CookingPot;
              return (
                <button
                  role="tab"
                  aria-selected={category === c.id}
                  key={c.id}
                  className={`category-tab ${category === c.id ? "active" : ""}`}
                  onClick={() => setCategory(c.id)}
                >
                  <Icon size={17} />
                  <span>{locale === "si" && c.nameSi !== c.name ? c.nameSi : tr(c.name)}</span>
                  <small>
                    {data.menu.filter((i) => i.categoryId === c.id).length}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="catalog-title">
            <h2>
              {category === "all"
                ? tr("Your products")
                : tr(data.categories.find((c) => c.id === category)?.name ?? "")}
              <span>{items.length} {tr("items")}</span>
            </h2>
            <span className="catalog-hint">
              <Leaf size={12} /> {tr("Stocked for everyday life")}</span>
          </div>
          <div className="menu-grid">
            {items.map((item) => {
              const count =
                cart.find((l) => l.menuItemId === item.id)?.quantity || 0;
              const state=productStockState(item,data.inventory,data.recipes,branchId);
              const stock={...state,quantity:item.stockQuantity??state.quantity,low:item.lowStock??state.low};
              const lowStock=data.settings.lowStockAlerts&&stock.low;
              return (
                <article
                  className={`product-card ${lowStock?'low-stock':''} ${!item.available ? "unavailable" : ""} ${count ? "in-cart" : ""}`}
                  key={item.id}
                  title={lowStock?tr("Low stock: {0} remaining. Alert at {1}.", number(stock.quantity??0), number(stock.threshold)):undefined}
                >
                  <button
                    className="product-main"
                    onClick={() => add(item)}
                    disabled={!item.available}
                    aria-label={tr("Add {0}", item.name)}
                  >
                    <div className="product-image-wrap">
                      <ProductPhoto src={item.image} alt={item.name} loading="lazy" />
                      {item.badge && (
                        <span
                          className={`product-badge ${item.badge.toLowerCase().includes("popular") ? "popular" : ""}`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {!item.available && (
                        <span className="sold-out">{tr("Sold out")}</span>
                      )}
                      {count > 0 && (
                        <span className="product-count">
                          <Check size={10} />
                          {count} {tr("added")}</span>
                      )}
                    </div>
                    <div className="product-info">
                      <h3>{displayName(item)}</h3>
                      <p>{item.description}</p>
                      {lowStock&&<small className="product-low-stock">{tr("Low stock ·")} {number(stock.quantity??0)} {tr("left")}</small>}
                    </div>
                  </button>
                  <div className="product-bottom">
                    <div>
<strong>{money(item.price)}</strong>{priceMode==='wholesale'&&(!item.wholesalePrice||item.wholesalePrice<=0)&&<small className="retail-fallback-price">{tr("Retail price")}</small>}
                      <span>{tr("Per")} {item.saleUnit || stock.unit || tr("pcs")}
                      </span>
                    </div>
                    <button
                      className="product-add"
                      disabled={!item.available || !!activeOrder}
                      onClick={() => add(item)}
                      aria-label={tr("Add one {0}", item.name)}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {items.length === 0 && (
            <div className="empty-state">
              <Search size={26} />
              <h3>{tr("No dishes found")}</h3>
              <p>{tr("Try another name or choose a different category.")}</p>
              <button
                className="button button-ghost"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >{tr("Reset filters")}</button>
            </div>
          )}
          <div className="catalog-bottom">
            <ShieldCheck size={12} />
            <span>{tr("Orders are saved securely at your branch.")}</span>
          </div>
        </section>
        <aside className={`order-panel panel ${mobileCart ? "cart-open" : ""}`} aria-label={tr("Current order")} tabIndex={0}>
          <div className="order-panel-header">
            <div>
              <div className="eyebrow">{tr("CURRENT ORDER")}</div>
              <h2>
                {activeOrder ? activeOrder.number : tr("New order")}{" "}
                <span>
                  {activeOrder ? (
                    <StatusBadge status={activeOrder.paymentStatus} />
                  ) : (
                    <span className="draft-label">{tr("Draft")}</span>
                  )}
                </span>
              </h2>
            </div>
            <div className="order-header-actions">
              {activeOrder ? (
                <button
                  className="icon-button"
                  onClick={() => onReceipt(activeOrder.id)}
                  title={tr("View receipt")}
                  aria-label={tr("View receipt")}
                >
                  <Printer size={16} />
                </button>
              ) : (
                <button
                  className="icon-button"
                  onClick={() => {
                    setNewOrderDialog(true);
                  }}
                  disabled={!lines.length || busy}
                  title={tr("Clear order")}
                  aria-label={tr("Clear order")}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                className="icon-button close-cart"
                onClick={() => setMobileCart(false)}
                aria-label={tr("Close order")}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="order-types">
            {(
              [
                                { id: "takeaway", label: tr("Counter sale"), icon: ShoppingBag },
                { id: "delivery", label: tr("Delivery"), icon: Truck },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                disabled={!!activeOrder}
                className={
                  (activeOrder?.type || type) === item.id ? "active" : ""
                }
                onClick={() => setType(item.id)}
              >
                <item.icon size={13} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="order-customer-row">
            {(activeOrder?.type || type) === "dine-in" ? (
              <label className="order-table-select">
                <UtensilsCrossed size={13} />
                <select
                  value={activeOrder?.tableId || tableId}
                  disabled={!!activeOrder}
                  onChange={(e) => setTableId(e.target.value)}
                  aria-label={tr("Select table")}
                >
                  <option value="">{tr("No table (optional)")}</option>
                  {data.tables
                    .filter(
                      (t) =>
                        t.status === "available" ||
                        t.id === (activeOrder?.tableId || tableId),
                    )
                    .map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name} · {t.seats} {tr("seats")}</option>
                    ))}
                </select>
              </label>
            ) : (
              <span className="guest-label">
                <ShoppingBag size={13} />
                {type === "takeaway" ? tr("Walk-in customer") : tr("Delivery order")}
              </span>
            )}
            <select
              className="customer-select"
              value={activeOrder?.customerId || customerId}
              disabled={!!activeOrder}
              onChange={(e) => setCustomerId(e.target.value)}
              aria-label={tr("Select customer")}
            >
              <option value="">{tr("Walk-in customer")}</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!activeOrder&&<button type="button" className="icon-button pos-add-customer" aria-label={tr("Add customer")} title={tr("Add customer for loans")} onClick={()=>setAddCustomerDialog(true)}><Plus size={14}/></button>}
          </div>
          <div className="order-items-heading">
            <span>{tr("ITEM")}</span>
            <span>{tr("AMOUNT")}</span>
          </div>
          <div className="cart-lines">
            {activeOrder
              ? activeOrder.lines.map((line) => {
                  const item = data.menu.find((i) => i.id === line.menuItemId);
                  return (
                    <div className="cart-line" key={line.id}>
                      <ProductPhoto src={item?.image||''} alt="" />
                      <div className="cart-line-info">
                        <h4>{line.name}</h4>
                        <span>
                          {money(line.unitPrice)} <i>× {line.quantity}</i>
                        </span>
                        {line.note && <p>{line.note}</p>}
                        {(line.discount||0)>0&&<small className="line-discount-note">{tr("Item discount −")} {money(line.discount||0)}</small>}
                      </div>
                      <strong>{money(line.lineTotal)}</strong>
                    </div>
                  );
                })
              : cart.map((line) => (
                  <div className="cart-line" key={line.menuItemId}>
                    <ProductPhoto src={line.item.image} alt="" />
                    <div className="cart-line-info">
                      <h4>{displayName(line.item)}</h4>
                      <span>{money(line.item.price)}</span>
                      <div className="quantity-control">
                        <button
                          onClick={() => adjust(line.menuItemId, isWeightedUnit(line.item.saleUnit) ? -.1 : -1)}
                          aria-label={tr("Remove one {0}", line.item.name)}
                        >
                          <Minus size={10} />
                        </button>
                        <button className="quantity-entry" aria-label={tr("Enter quantity for {0}", line.item.name)} disabled={busy} onClick={()=>setQuantityItem(line.menuItemId)}>{number(line.quantity)} {line.item.saleUnit || tr("pcs")}</button>
                        <button
                          onClick={() => adjust(line.menuItemId, isWeightedUnit(line.item.saleUnit) ? .1 : 1)}
                          aria-label={tr("Add one more {0}", line.item.name)}
                        >
                          <Plus size={10} />
                        </button>
                        <button
                          className={`line-note-button ${line.note ? "has-note" : ""}`}
                          onClick={() => {
                            setItemNote(line.menuItemId);
                            setDraftNote(line.note);
                          }}
                          aria-label={tr("Add note to {0}", line.item.name)}
                        >
                          <NotebookPen size={11} />
                        </button>
                      </div>
                      {line.note && <p>{line.note}</p>}
                      {canManageCatalog&&<button type="button" className="line-discount-button" aria-label={tr("Discount {0}", line.item.name)} onClick={()=>setItemDiscount(line.menuItemId)}><Tag size={11}/>{line.discount?`− ${money(Math.min(line.discount,lineAmount(line.item.price,line.quantity)))}`:tr("Item discount")}</button>}
                    </div>
                    <div className="cart-line-end">
                      <strong>{money(Math.max(0,lineAmount(line.item.price,line.quantity)-(line.discount||0)))}</strong>
                      <button
                        onClick={() =>
                          setLines((v) =>
                            v.filter((l) => l.menuItemId !== line.menuItemId),
                          )
                        }
                        aria-label={tr("Remove {0}", line.item.name)}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                ))}
            {!activeOrder && !cart.length && (
              <div className="empty-cart">
                <div className="empty-cart-art">
                  <ShoppingBag size={28} strokeWidth={1.2} />
                  <Plus size={13} className="cart-art-plus" />
                </div>
                <h3>{tr("A fresh start.")}</h3>
                <p>{tr("Add something delicious from")}<br />{tr("the menu to begin an order.")}</p>
                <div className="empty-cart-line" />
              </div>
            )}
          </div>
          <div className="cart-footer">
            <div className="cart-options">
              <button
                onClick={() => setNoteDialog(true)}
                disabled={!!activeOrder}
              >
                <NotebookPen size={12} />
                {activeOrder?.note || note ? tr("View note") : tr("Add a note")}
                {note && <i />}
              </button>
              <button
                onClick={() => setDiscountDialog(true)}
                disabled={
                  !!activeOrder ||
                  !["owner", "manager"].includes(data.user.role)
                }
              >
                <Tag size={12}/>
                {cartDiscount ? tr("Edit cart discount") : tr("Add cart discount")}
              </button>
            </div>
            {!activeOrder && lines.length > 0 && (
              <button
                className="button hold-bill-button"
                onClick={openHold}
                disabled={busy || !data.sync.hubOnline}
              >
                <PauseCircle size={14} />
                {heldBillId ? tr("Update held bill") : tr("Hold bill")}
                <span>{tr("Save for later")}</span>
              </button>
            )}
            {activeOrder && (
              <div className="order-saved-label">
                <CheckCircle2 size={12} /> {tr("Saved at branch ·")}{" "}
                {time(activeOrder.createdAt)}
                <StatusBadge status={activeOrder.status} />
              </div>
            )}
            <div className="order-totals">
              <div>
                <span>{tr("Subtotal")}</span>
                <span>{money(subtotal)}</span>
              </div>
              {itemDiscountTotal > 0 && <div className="text-mint"><span>{tr("Item discounts")}</span><span>− {money(itemDiscountTotal)}</span></div>}
              {cartDiscount > 0 && (
                <div className="text-mint">
                  <span>{tr("Cart discount")}</span>
                  <span>− {money(cartDiscount)}</span>
                </div>
              )}
              <div>
                <span>{tr("Service charge")}{" "}
                  <small>({data.settings.serviceChargeRate}%)</small>
                </span>
                <span>{money(serviceCharge)}</span>
              </div>
              <div>
                <span>{tr("Tax")} <small>({data.settings.taxRate}%)</small>
                </span>
                <span>{money(tax)}</span>
              </div>
              {activeOrder && activeOrder.paid > 0 && (
                <div className="text-mint">
                  <span>{tr("Already paid")}</span>
                  <span>− {money(activeOrder.paid)}</span>
                </div>
              )}
            </div>
            <div className="order-total">
              <span>
                {activeOrder?.paid ? tr("Balance due") : tr("Total")}
                <small>
                  {activeOrder
                    ? activeOrder.lines.length
                    : quantity}{" "}{tr("items")}</small>
              </span>
              <strong>
                {money(Math.max(0, total - (activeOrder?.paid || 0)))}
              </strong>
            </div>
            {activeOrder?.paymentStatus === "paid" ? (
              <button
                className="button button-primary checkout-button"
                onClick={
                  activeOrder.type === "dine-in" &&
                  ["ready", "served"].includes(activeOrder.status)
                    ? () => void closeTable()
                    : () => onReceipt(activeOrder.id)
                }
                disabled={busy}
              >
                <CheckCircle2 size={16} />
                {activeOrder.type === "dine-in" &&
                ["ready", "served"].includes(activeOrder.status)
                  ? activeOrder.tableId ? tr("Close table & print") : tr("Complete & print")
                  : tr("View receipt")}
                <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button
                  ref={checkoutRef}
                  className="button button-primary checkout-button"
                  disabled={
                    busy ||
                    loadedBranch !== branchId ||
                    !data.sync.hubOnline ||
                    (!activeOrder && !lines.length) ||
                    !canTakePayment
                  }
                  onClick={() => void submit(true)}
                >
                  <Wallet size={16} />
                  {busy
                    ? tr("Saving order...")
                    : activeOrder
                      ? tr("Take payment")
                      : tr("Charge order")}
                  <ArrowRight size={16} />
                </button>
                {!activeOrder&&canTakePayment&&<button type="button" className="button credit-sale-button" disabled={busy||!lines.length||!data.sync.hubOnline} onClick={()=>setCreditCustomerDialog(true)}><Users size={14}/>{tr("Customer Loan")}<span>{customerId?data.customers.find(customer=>customer.id===customerId)?.name:tr("New or existing customer")}</span></button>}
                {false && !activeOrder && (
                  <button
                    className="button send-kitchen-button"
                    disabled={busy || !lines.length || !data.sync.hubOnline}
                    onClick={() => void submit(false)}
                  >
                    <Send size={13} /> {tr("Send to kitchen")}</button>
                )}
              </>
            )}
            <div className="cart-safety">
              <ShieldCheck size={10} />
              {activeOrder
                ? tr("Order confirmed by your branch")
                : tr("Draft is saved on this device")}
            </div>
          </div>
        </aside>
      </div>
      <button
        className="mobile-cart-button"
        onClick={() => setMobileCart(true)}
      >
        <ShoppingBag size={18} />
        <span>{tr("View order")}{" "}
          <small>
            {activeOrder ? activeOrder.lines.length : quantity} {tr("items")}</small>
        </span>
        <strong>{money(total)}</strong>
        <ArrowRight size={17} />
      </button>
      {paymentOrder && (
        <PaymentDialog
          orderId={paymentOrder}
          initialMethod={paymentMethod}
          onClose={() => setPaymentOrder(null)}
          onPaid={(id, print) => {
            setPaymentOrder(null);
            setMobileCart(false);
            resetOrder();
            onReceipt(id, print || data.settings.autoPrint);
          }}
        />
      )}
      {canManageCatalog && categoryDialog && (
        <Suspense fallback={<Spinner label={tr("Opening category")}/>}><CategoryDialog
          onClose={() => setCategoryDialog(false)}
          onCreated={(id) => setCategory(id)}
        /></Suspense>
      )}
      {canManageCatalog && productDialog && (
        <Suspense fallback={<Spinner label={tr("Opening product")}/>}><ProductDialog
          onClose={() => setProductDialog(false)}
          categoryId={category === "all" ? undefined : category}
        /></Suspense>
      )}
      {newOrderDialog && (
        <Modal
          title={tr("Start a new order?")}
          subtitle={tr("Your current draft contains items. Hold it to continue serving this guest later.")}
          onClose={() => setNewOrderDialog(false)}
        >
          <div className="draft-confirm-summary">
            <ShoppingBag size={20} />
            <span>{quantity} {tr("items in your current draft")}</span>
            <strong>
              {money(
                cart.reduce(
                  (sum, line) => sum + line.quantity * line.item.price,
                  0,
                ),
              )}
            </strong>
          </div>
          <div className="form-actions draft-confirm-actions">
            <button
              className="button button-ghost"
              onClick={() => setNewOrderDialog(false)}
            >{tr("Keep editing")}</button>
            <button
              className="button button-ghost"
              onClick={() => {
                setNewOrderDialog(false);
                resetOrder();
              }}
            >{tr("Discard draft")}</button>
            <button
              className="button button-primary"
              disabled={!data.sync.hubOnline}
              onClick={() => {
                setNewOrderDialog(false);
                onSelectOrder(null);
                setHoldLabel(
                  data.heldBills.find((bill) => bill.id === heldBillId)
                    ?.label || "Guest order",
                );
                setHoldCommand(commandId());
                setHoldDialog(true);
              }}
            >
              <PauseCircle size={14} /> {tr("Hold & start new")}</button>
          </div>
        </Modal>
      )}
      {holdDialog && (
        <Modal
          title={heldBillId ? tr("Update held bill") : tr("Hold bill")}
          subtitle={tr("Save this draft at the branch without creating a sale or deducting stock.")}
          onClose={() => !busy && setHoldDialog(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void hold();
            }}
          >
            <label className="field">
              <span>{tr("Bill label")}</span>
              <input
                className="input"
                value={holdLabel}
                onChange={(event) => setHoldLabel(event.target.value)}
                required
                maxLength={120}
                placeholder={tr("Customer name or reference")}
              />
            </label>
            <p className="held-bill-note">
              Resume this bill from Held bills on any connected device at this
              branch.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                disabled={busy}
                onClick={() => setHoldDialog(false)}
              >{tr("Cancel")}</button>
              <button
                className="button button-primary"
                disabled={busy || !holdLabel.trim()}
              >
                <PauseCircle size={14} />{" "}
                {busy
                  ? tr("Saving...")
                  : heldBillId
                    ? tr("Update held bill")
                    : tr("Hold bill")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {noteDialog && (
        <Modal
          title={tr("Order note")}
          subtitle={tr("Add preparation, allergy, or service instructions.")}
          onClose={() => setNoteDialog(false)}
        >
          <textarea
            className="input"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tr("For example: guest has a nut allergy")}
            aria-label={tr("Order note")}
          />
          <div className="form-actions">
            <button
              className="button button-primary"
              onClick={() => setNoteDialog(false)}
            >{tr("Save note")}</button>
          </div>
        </Modal>
      )}
      {itemNote && (
        <Modal title={tr("Item instructions")} onClose={() => setItemNote(null)}>
          <textarea
            className="input"
            value={draftNote}
            maxLength={300}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder={tr("Less spice, no onions...")}
            aria-label={tr("Item instructions")}
          />
          <div className="form-actions">
            <button
              className="button button-primary"
              onClick={() => {
                setLines((v) =>
                  v.map((l) =>
                    l.menuItemId === itemNote ? { ...l, note: draftNote } : l,
                  ),
                );
                setItemNote(null);
              }}
            >{tr("Save instructions")}</button>
          </div>
        </Modal>
      )}
      {discountDialog && (
        <DiscountDialog
          subtotal={Math.max(0,subtotal-itemDiscountTotal)}
          discount={cartDiscount}
          onClose={() => setDiscountDialog(false)}
          onSave={(value) => {
            setDiscount(value);
            setDiscountDialog(false);
          }}
        />
      )}
      {discountLine&&<DiscountDialog key={discountLine.menuItemId} title={tr("Item discount")} subtitle={tr("{0} · Amount applies to all {1} units on this line.", discountLine.item.name, discountLine.quantity)} subtotal={lineAmount(discountLine.item.price,discountLine.quantity)} discount={discountLine.discount||0} onClose={()=>setItemDiscount(null)} onSave={value=>{setLines(previous=>previous.map(line=>line.menuItemId===discountLine.menuItemId?{...line,discount:value}:line));setItemDiscount(null);}}/>}
      {(addCustomerDialog||creditCustomerDialog)&&<POSCustomerDialog credit={creditCustomerDialog} initialCustomerId={customerId} onClose={()=>{setAddCustomerDialog(false);setCreditCustomerDialog(false);}} onSelected={id=>{setCustomerId(id);setAddCustomerDialog(false);setCreditCustomerDialog(false);if(creditCustomerDialog)void submit(true,'credit',id);}}/>}
    </>
  );
}

function POSCustomerDialog({
  credit,
  initialCustomerId = '',
  onClose,
  onSelected,
}: {
  credit: boolean;
  initialCustomerId?: string;
  onClose: () => void;
  onSelected: (id: string) => void;
}) {
  const tr = useTranslation();
  const { data, mutate, notify } = usePOS();
  const [creating, setCreating] = useState(!credit || data.customers.length === 0);
  const [selected, setSelected] = useState(initialCustomerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(commandId);
  const customer = data.customers.find(item => item.id === selected);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!creating) {
      if (customer) onSelected(customer.id);
      return;
    }
    setBusy(true);
    setError('');
    const fields = new FormData(event.currentTarget);
    try {
      const result = await mutate<{ customer: { id: string; name: string } }>('/customers', {
        commandId: requestId,
        name: String(fields.get('name') || '').trim(),
        phone: String(fields.get('phone') || '').trim(),
        email: String(fields.get('email') || '').trim(),
      });
      notify(tr("Customer {0} added.", result.customer.name));
      onSelected(result.customer.id);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={credit ? tr("Customer Loan") : tr("Add customer")}
      subtitle={credit ? tr("Choose a saved customer or add their name and phone number to sell on account.") : tr("Save customer details for sales and outstanding dues.")}
      onClose={() => busy ? false : onClose()}
    >
      <form onSubmit={event => void submit(event)}>
        {credit && data.customers.length > 0 && (
          <div className="customer-choice-tabs">
            <button type="button" className={`button ${!creating ? 'button-primary' : 'button-ghost'}`} onClick={() => {setCreating(false);setError('');}} disabled={busy}>{tr("Existing customer")}</button>
            <button type="button" className={`button ${creating ? 'button-primary' : 'button-ghost'}`} onClick={() => {setCreating(true);setError('');}} disabled={busy}>{tr("New customer")}</button>
          </div>
        )}
        {creating ? (
          <div className="form-grid">
            <label className="field"><span>{tr("Customer name")}</span><input className="input" name="name" required minLength={2} maxLength={120} autoComplete="name" disabled={busy}/></label>
            <label className="field"><span>{tr("Phone number")}</span><input className="input" name="phone" type="tel" required minLength={5} maxLength={30} autoComplete="tel" disabled={busy}/></label>
            <label className="field full"><span>{tr("Email (optional)")}</span><input className="input" name="email" type="email" maxLength={254} autoComplete="email" disabled={busy}/></label>
          </div>
        ) : (
          <>
            <label className="field"><span>{tr("Customer account")}</span><select className="select" required value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}><option value="">{tr("Choose customer")}</option>{data.customers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}</select></label>
            {customer && <div className="credit-customer-summary"><Users size={19}/><div><strong>{customer.name}</strong><small>{customer.phone}</small><span>{tr("Current outstanding:")} {money(customer.balance)}</span></div></div>}
          </>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
        <p className="held-bill-note">{credit ? tr("Review and confirm the loan amount next. Record later repayments in Customers & dues.") : tr("Select this customer on future bills to record loans and repayments.")}</p>
        <div className="form-actions">
          <button type="button" className="button button-ghost" disabled={busy} onClick={onClose}>{tr("Cancel")}</button>
          <button className="button button-primary" disabled={busy || (!creating && !customer)}>{busy ? tr("Saving customer…") : credit ? tr("Continue to loan") : tr("Add customer")}</button>
        </div>
      </form>
    </Modal>
  );
}

function DiscountDialog({
  title='Cart discount',
  subtitle='Enter a rupee amount. Discounts are recorded against your staff account.',
  subtotal,
  discount,
  onClose,
  onSave,
}: {
  title?:string;
  subtitle?:string;
  subtotal: number;
  discount: number;
  onClose: () => void;
  onSave: (value: number) => void;
}) {
  const tr = useTranslation();
  const [value, setValue] = useState((discount / 100).toString());
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(Math.round(Number(value) * 100));
        }}
      >
        <label className="field">
          <span>{tr("Discount amount (LKR)")}</span>
          <input
            className="input"
            type="number"
            required
            min="0"
            max={subtotal / 100}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
          >{tr("Cancel")}</button>
          <button className="button button-primary">{tr("Apply discount")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PaymentDialog({
  initialMethod='cash',
  orderId,
  onClose,
  onPaid,
}: {
  initialMethod?:'cash'|'credit';
  orderId: string;
  onClose: () => void;
  onPaid: (id: string, print?: boolean) => void;
}) {
  const tr = useTranslation();
  const { data, mutate, notify, refresh } = usePOS();
  const order = data.orders.find((o) => o.id === orderId);
  const [method, setMethod] = useState<"cash" | "card" | "qr" | "credit">(
    initialMethod,
  );
  const due = order ? Math.max(0, order.total - order.paid) : 0;
  const [amount, setAmount] = useState((due / 100).toString());
  const [received, setReceived] = useState((due / 100).toString());
  const [paidNow, setPaidNow] = useState('0');
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choosingCustomer, setChoosingCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [numberPad,setNumberPad]=useState<'amount'|'received'|'paid-now'|null>(null);
  const [id] = useState(commandId);
  const [shiftCommand, setShiftCommand] = useState(commandId);
  const [openingFloat, setOpeningFloat] = useState("0");
  const submitting = useRef(false);
  if (!order) return null;
  const customer = data.customers.find((item) => item.id === (selectedCustomerId || order.customerId));
  const canChooseCustomer = order.payments.length === 0 && order.paid === 0 && order.refunded === 0;
  const minor = Math.round(Number(amount) * 100);
  const receivedMinor = Math.round(Number(received) * 100);
  const paidNowMinor = Math.round(Number(paidNow) * 100);
  const loanAmount = method === 'credit' ? Math.max(0, minor - paidNowMinor) : 0;
  const invalidPaidNow = method === 'credit' && (!Number.isSafeInteger(paidNowMinor) || paidNowMinor < 0 || paidNowMinor >= minor);
  const needsShift = !data.shifts.some(shift => shift.branchId === order.branchId && shift.status === "open");
  const openingCash = Math.round(Number(openingFloat) * 100);
  const invalidOpeningCash = needsShift && (!openingFloat.trim() || !Number.isSafeInteger(openingCash) || openingCash < 0 || openingCash > 1_000_000_000);
  const cannotPay = busy || invalidOpeningCash || !Number.isSafeInteger(minor) || minor <= 0 || minor > due ||
    (method === "cash" && (!Number.isSafeInteger(receivedMinor) || receivedMinor < minor)) ||
    (method === "credit" && !customer) || invalidPaidNow || (method !== "cash" && !confirmed);
  async function submit(print = false) {
    if (!order || cannotPay || submitting.current) return;
    if (method === "credit" && !customer) {
      setError(
        tr("Choose or add a customer before confirming this customer loan."),
      );
      return;
    }
    if(invalidPaidNow){setError(tr("Enter a cash amount below the payment amount. Choose Cash for a full cash payment."));return;}
    setError("");
    submitting.current = true;
    setBusy(true);
    try {
      if (needsShift) {
        try {
          await mutate("/shifts/open", {commandId: shiftCommand, branchId: order.branchId, openingFloat: openingCash});
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== "SHIFT_ALREADY_OPEN") throw error;
          await refresh();
        }
      }
      await mutate(`/orders/${order.id}/payments`, {
        commandId: id,
        expectedVersion: order.version,
        method,
        ...(method === 'credit' && customer ? {customerId: customer.id} : {}),
        ...(method === 'credit' && paidNowMinor > 0 ? {cashAmount: paidNowMinor} : {}),
        amount: minor,
        received: method === "cash" ? receivedMinor : minor,
        reference: method === "credit" ? "" : reference,
      });
      notify(
        method === "credit"
          ? tr("{0}{1} added to {2}'s loan.", paidNowMinor > 0 ? `${money(paidNowMinor)} received in cash. ` : '', money(loanAmount), customer?.name)
          : minor < due
            ? tr("Partial payment recorded.")
            : tr("Payment recorded. Thank you!"),
      );
      onPaid(order.id, print);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if(numberPad)return <NumberPad title={numberPad==='amount'?tr("Payment amount (LKR)"):numberPad==='paid-now'?tr("Paid now (cash) (LKR)"):tr("Cash received (LKR)")} value={numberPad==='amount'?amount:numberPad==='paid-now'?paidNow:received} decimal min={numberPad==='paid-now'?0:numberPad==='amount'?.01:Number(amount)} max={numberPad==='amount'?due/100:numberPad==='paid-now'?Math.max(0,(minor-1)/100):10000000} onClose={()=>setNumberPad(null)} onConfirm={value=>{if(numberPad==='amount'){setAmount(value);setReceived(value);}else if(numberPad==='paid-now')setPaidNow(value);else setReceived(value);setConfirmed(false);setNumberPad(null);}}/>;
  if (choosingCustomer) {
    return <POSCustomerDialog credit initialCustomerId={customer?.id} onClose={() => setChoosingCustomer(false)} onSelected={customerId => {
      setSelectedCustomerId(customerId);
      setConfirmed(false);
      setError('');
      setChoosingCustomer(false);
    }}/>;
  }
  return (
    <Modal
      title={tr("Take payment")}
      subtitle={`${order.number} · ${order.type.replace("-", " ")}`}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={event => {event.preventDefault(); void submit();}} onKeyDown={event => {
        if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing ||
            event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const control = (event.target as HTMLElement).closest("button, select, textarea, a, input[type=checkbox]");
        if (control && !(control instanceof HTMLButtonElement && control.type === "submit")) return;
        event.preventDefault();
        if (!event.repeat && !cannotPay && event.currentTarget.reportValidity()) void submit(true);
      }}>
        <div className="payment-due">
          <span>{tr("Balance due")}</span>
          <strong>{money(due)}</strong>
          <small>{tr("Order total")} {money(order.total)}</small>
        </div>
        <div className="payment-methods">
          {(
            [
              { id: "cash", name: "Cash", icon: Wallet },
              { id: "card", name: "Card", icon: Wallet },
              { id: "qr", name: "QR / Bank", icon: Grid2X2 },
              { id: "credit", name: "Customer Loan", icon: Users },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              className={method === m.id ? "active" : ""}
              onClick={() => {
                setMethod(m.id);
                setConfirmed(false);
                setError('');
                if (m.id === 'credit' && !customer && canChooseCustomer) setChoosingCustomer(true);
              }}
              disabled={busy || (m.id === "credit" && !customer && !canChooseCustomer)}
              title={
                m.id === "credit" && !customer && !canChooseCustomer
                  ? tr("A customer cannot be assigned after payments have been recorded.")
                  : undefined
              }
            >
              <m.icon size={20} />
              {m.name}
            </button>
          ))}
        </div>
        {!customer && method !== 'credit' && canChooseCustomer && (
          <p className="held-bill-note">{tr("Choose Customer Loan to add a customer or select a saved account.")}</p>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <label className="field">
            <span>{tr("Payment amount (LKR)")}</span>
            <div className="number-input-row">
            <input
              aria-label={tr("Payment amount (LKR)")}
              className="input"
              type="number"
              min="0.01"
              max={due / 100}
              step="0.01"
              required
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setReceived(e.target.value);
                setConfirmed(false);
              }}
            />
            <button type="button" className="icon-button" aria-label={tr("Enter payment amount with keypad")} disabled={busy} onClick={event=>{event.preventDefault();setNumberPad('amount');}}><Grid2X2 size={19}/></button></div>
          </label>
          {method === "cash" ? (
            <label className="field">
              <span>{tr("Cash received (LKR)")}</span>
              <div className="number-input-row">
              <input
                aria-label={tr("Cash received (LKR)")}
                className="input"
                type="number"
                required
                min={Number(amount)}
                step="0.01"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />
              <button type="button" className="icon-button" aria-label={tr("Enter cash received with keypad")} disabled={busy} onClick={event=>{event.preventDefault();setNumberPad('received');}}><Grid2X2 size={19}/></button></div>
            </label>
          ) : method === "credit" ? (
            <div className="credit-customer-summary">
              <Users size={19} />
              <div>
                <span>{tr("Charge to customer account")}</span>
                <strong>{customer?.name || tr("No customer selected")}</strong>
                <small>{customer?.phone}</small>
                {customer && <span>{tr("Current outstanding:")} {money(customer.balance)}</span>}
                {canChooseCustomer && <button type="button" className="loan-customer-change" disabled={busy} onClick={() => {setConfirmed(false);setChoosingCustomer(true);}}>{customer ? tr("Change customer") : tr("Choose customer")}</button>}
              </div>
            </div>
          ) : (
            <label className="field">
              <span>{tr("Terminal / bank reference")}</span>
              <input
                className="input"
                required
                maxLength={120}
                placeholder={tr("Approved transaction reference")}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
          )}
        </div>
        {method === 'credit' && <div className="loan-split-payment">
          <label className="field"><span>{tr("Paid now (cash) (LKR)")}</span><div className="number-input-row"><input className="input" aria-label={tr("Paid now (cash) (LKR)")} type="number" required min="0" max={Math.max(0,(minor-1)/100)} step="0.01" value={paidNow} disabled={busy} onChange={event=>{setPaidNow(event.target.value);setConfirmed(false);setError('');}}/><button type="button" className="icon-button" aria-label={tr("Enter cash paid now with keypad")} disabled={busy} onClick={()=>setNumberPad('paid-now')}><Grid2X2 size={19}/></button></div><small>{tr("Enter zero for a full loan. Only the remaining amount is added to this customer's dues.")}</small></label>
          <div className="loan-split-totals" aria-label={tr("Cash and customer loan breakdown")}><div><span>{tr("Cash received now")}</span><strong>{money(Number.isFinite(paidNowMinor)?Math.max(0,paidNowMinor):0)}</strong></div><div><span>{tr("Remaining Customer Loan")}</span><strong>{money(Number.isFinite(loanAmount)?loanAmount:0)}</strong></div></div>
          {invalidPaidNow && <p className="error-message" role="alert">{tr("Enter a cash amount below the payment amount. Choose Cash for a full cash payment.")}</p>}
        </div>}
        {method === "cash" ? (
          <>
            <div className="cash-shortcuts">
              {[1000, 2000, 5000]
                .filter((v) => v >= Number(amount))
                .map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setReceived(v.toString())}
                  >{tr("Rs.")} {v.toLocaleString()}
                  </button>
                ))}
              <button type="button" onClick={() => setReceived(amount)}>{tr("Exact amount")}</button>
            </div>
            <div className="change-due">
              <span>{tr("Change to guest")}</span>
              <strong>{money(Math.max(0, receivedMinor - minor))}</strong>
            </div>
          </>
        ) : (
          <label className="payment-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              required
              disabled={busy || (method === 'credit' && !customer)}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              {method === "credit"
                ? tr("I confirm {0} is authorised for this customer loan.{1} {2} will be added to their outstanding dues.", customer?.name || 'the selected customer', paidNowMinor > 0 ? ` ${money(paidNowMinor)} has been received in cash.` : '', money(Number.isFinite(loanAmount)?loanAmount:0))
                : tr("I have verified the approved payment on the terminal or bank account. This action records the payment; it does not charge a card.")}
            </span>
          </label>
        )}
        {needsShift && <label className="field">
          <span>{tr("Opening cash float (LKR)")}</span>
          <input className="input" type="number" inputMode="decimal" min="0" max="10000000" step="0.01"
            required disabled={busy} value={openingFloat} onChange={event => {setOpeningFloat(event.target.value); setShiftCommand(commandId());}} />
          <small>{tr("Enter the cash already in the drawer. Confirming opens the shift and records this payment.")}</small>
        </label>}
        <div className="form-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
            disabled={busy}
          >{tr("Cancel")}</button>
          <button
            className="button button-primary"
            disabled={cannotPay}
          >
            <CheckCircle2 size={15} />
            {busy
              ? tr("Recording...")
              : method === "credit"
                ? paidNowMinor > 0 ? tr("Confirm cash & loan") : tr("Confirm customer loan")
                : tr("Confirm payment")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
