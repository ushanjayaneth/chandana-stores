import {useTranslation} from "../lib/language";
import {saleUnits} from '../../shared/retail';
import {productCost} from '../../shared/costing';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Barcode,
  Check,
  ChevronDown,
  Download,
  Layers3,
  Package,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import type { Category, MenuItem } from "../../shared/types";
import { usePOS } from "../lib/context";
import { commandId, money, number } from "../lib/format";
import { useBackLayer } from "../lib/navigation";
import { isProductImageReference } from "../../shared/media";
import { productStockState } from "../../shared/stock";
import PhotoPicker, {type PhotoPickerHandle} from "../components/PhotoPicker";
import ProductPhoto from "../components/ProductPhoto";
import {focusDialog, restoreDialogFocus, useDialogViewport, useBodyScrollLock} from "../components/ui";
import "../styles/products.css";
import {createPortal} from 'react-dom';

type Product = MenuItem & {
  barcode?: string;
  sku?: string;
  reorderLevel?: number;
};

function Dialog({
  title,
  subtitle,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const tr = useTranslation();
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const dialogRef = useRef<HTMLElement>(null);
  closeRef.current = onClose;
  busyRef.current = busy;
  useDialogViewport(dialogRef);
  useBodyScrollLock();
  useBackLayer(
    true,
    () => {
      if (busyRef.current) return false;
      closeRef.current();
    },
    `product:${title}`,
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    focusDialog(dialog);
    const handleKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll(".product-dialog");
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== "Tab" || !dialog) return;
      const elements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])",
        ),
      );
      if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault();
        elements.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === elements.at(-1)
      ) {
        event.preventDefault();
        elements[0]?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      restoreDialogFocus(previous);
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal product-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="product-dialog-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={tr("Close dialog")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>, document.body
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`field ${full ? "product-field-full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function CategoryDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const tr = useTranslation();
  const { mutate, refresh, notify } = usePOS();
  const [requestId] = useState(commandId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await mutate<{ category: Category }>("/categories", {
        commandId: requestId,
        name: String(fields.get("name") || "").trim(),
        icon: String(fields.get("icon") || "utensils"),
      });
      await refresh();
      onCreated?.(result.category.id);
      notify(tr("Category added"));
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Unable to create the category."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={tr("Add category")}
      subtitle={tr("Organise your products into clear, useful groups.")}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label={tr("Category name")} full>
            <input
              className="input"
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder={tr("e.g. Fresh juices")}
              autoComplete="off"
            />
          </Field>
          <Field label={tr("Category icon")} full>
            <select className="select" name="icon" defaultValue="utensils">
              <option value="utensils">{tr("Food & meals")}</option>
              <option value="coffee">{tr("Drinks")}</option>
              <option value="flame">{tr("Grill & hot food")}</option>
              <option value="cake">{tr("Desserts")}</option>
              <option value="package">{tr("Retail products")}</option>
              <option value="leaf">{tr("Vegetarian")}</option>
            </select>
          </Field>
        </div>
        {error && (
          <div className="error-message product-form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
            disabled={busy}
          >{tr("Cancel")}</button>
          <button className="button button-primary" disabled={busy}>
            {busy ? tr("Saving…") : tr("Add category")}
            <Check size={15} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProductDialog({
  onClose,
  categoryId,
  item,
}: {
  onClose: () => void;
  categoryId?: string;
  item?: MenuItem;
}) {
  const tr = useTranslation();
  const { data, branchId, mutate, refresh, notify } = usePOS();
  const product = item as Product | undefined;
  const linkedStock = item
    ? data.inventory.find(
        (stock) =>
          stock.branchId === branchId &&
          stock.menuItemId === item.id &&
          ["prepared", "resale"].includes(stock.category),
      )
    : undefined;
  const [requestId] = useState(commandId);
  const [stockRequestId] = useState(commandId);
  const [selectedCategory, setSelectedCategory] = useState(
    product?.categoryId || categoryId || data.categories[0]?.id || "",
  );
  const [stockMode, setStockMode] = useState<MenuItem["stockMode"]>(
    product?.stockMode || "prepared",
  );
  const [stockType, setStockType] = useState<"prepared" | "resale">(
    "resale",
  );
  const [quantity, setQuantity] = useState(String(linkedStock?.quantity ?? 0));
  const openingQuantity = useRef(linkedStock?.quantity ?? 0);
  const [quantityEdited, setQuantityEdited] = useState(false);
  const [manageStock, setManageStock] = useState(
    item ? Boolean(linkedStock) : true,
  );
  const [stockUnit, setStockUnit] = useState(product?.saleUnit || linkedStock?.unit || "pcs");
  const [enteredExpiry, setExpiryDate] = useState<string | null>(null);
  const expiryDate = enteredExpiry ?? linkedStock?.expiryDate ?? "";
  const [minimumEdited, setMinimumEdited] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const savedProductId = useRef<string | null>(item?.id || null);
  const stockSaved = useRef(false);
  const [image, setImage] = useState(product?.image || "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoPicker = useRef<PhotoPickerHandle>(null);
  const [sellingPrice, setSellingPrice] = useState(product ? String(product.price / 100) : "");
  const [enteredCost, setPurchaseCost] = useState<string | null>(null);
  const currentCost = (stockMode === "prepared" ? linkedStock?.unitCost : undefined) ?? product?.cost ?? 0;
  const purchaseCost = enteredCost ?? String(currentCost / 100);
  const previewPrice = Math.round(Number(sellingPrice || 0) * 100);
  const previewCost = Math.round(Number(purchaseCost || 0) * 100);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || photoBusy) return;
    const fields = new FormData(event.currentTarget);
    const text = (key: string) => String(fields.get(key) || "").trim();
    const cents = (key: string) =>
      Math.round(Number(fields.get(key) || 0) * 100);
    const payload = {
      commandId: requestId,
      name: text("name"),
      description: text("description"),
      categoryId: selectedCategory,
      price: cents("price"),
      ...(!item || enteredCost !== null || stockMode !== product?.stockMode ? {cost: previewCost} : {}),
      wholesalePrice:cents("wholesalePrice"),
      image: image.trim() || "/images/grocery/default.jpg",
      available: fields.get("enabled") === "on",
      stockMode,
      saleUnit:stockUnit,
      preparationMinutes: Number(fields.get("preparationMinutes") || 0),
      barcode: text("barcode"),
      sku: text("sku").toUpperCase(),
      ...(!item || minimumEdited ? {reorderLevel: text("minimum") === "" ? 5 : Number(text("minimum"))} : {}),
    };
    if (!selectedCategory) {
      setError(tr("Choose or create a category first."));
      return;
    }
    if (!isProductImageReference(payload.image)) {
      setError(tr("Use an HTTPS image link or upload a product photo."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const suggestedImage = await photoPicker.current?.preparePhoto();
      if (suggestedImage) payload.image = suggestedImage;
      const result = await mutate<{ item: MenuItem }>(
        item ? `/menu/${item.id}` : "/menu",
        payload,
        item ? "PATCH" : "POST",
      );
      savedProductId.current = result.item.id;
      if (stockMode === "prepared" && manageStock && !stockSaved.current) {
        const requested = Number(quantity);
        if (!Number.isFinite(requested) || requested < 0)
          throw new Error("Enter a valid, non-negative stock quantity.");
        if (linkedStock) {
          const changes = {
            ...(quantityEdited ? {quantity: requested, expectedQuantity: openingQuantity.current} : {}),
            ...(minimumEdited && linkedStock.minimum !== payload.reorderLevel ? {minimum: payload.reorderLevel} : {}),
            ...(enteredCost !== null && linkedStock.unitCost !== previewCost ? {unitCost: previewCost} : {}),
            ...(enteredExpiry !== null && (linkedStock.expiryDate || "") !== expiryDate ? {expiryDate} : {}),
          };
          if (Object.keys(changes).length) await mutate(
            `/inventory/${linkedStock.id}`,
            {
              commandId: stockRequestId,
              branchId,
              ...changes,
              reason: "Product stock details updated",
            },
            "PATCH",
          );
        } else {
          await mutate("/inventory", {
            commandId: stockRequestId,
            branchId,
            name: payload.name,
            category: stockType,
            unit: stockUnit,
            expiryDate,
            quantity: requested,
            minimum: payload.reorderLevel ?? product?.reorderLevel ?? 5,
            unitCost: previewCost,
            menuItemId: result.item.id,
            supplierId: null,
          });
        }
        stockSaved.current = true;
      }
      await refresh();
      notify(item ? tr("Product updated") : tr("Product added"));
      onClose();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unable to save this product.";
      setError(
        savedProductId.current && !item
          ? tr("Product saved. Stock setup needs attention: {0} Retry to finish.", message)
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        title={item ? tr("Edit product") : tr("Add product")}
        subtitle={tr("Menu details apply across branches. Stock quantities apply to the selected branch.")}
        onClose={onClose}
        busy={busy || photoBusy}
      >
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label={tr("Product name")} full>
              <input
                className="input"
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={product?.name || ""}
                placeholder={tr("e.g. Chicken fried rice")}
              />
            </Field>
            <Field label={tr("Category")}>
              <div className="product-category-field">
                <select
                  className="select"
                  aria-label={tr("Category")}
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  required
                >
                  <option value="">{tr("Choose category")}</option>
                  {data.categories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={tr("Add category")}
                  onClick={() => setCategoryDialog(true)}
                >
                  <Plus size={16} />
                </button>
              </div>
            </Field>
            <Field label={tr("Stock tracking")}>
              <select
                className="select"
                value={stockMode}
                onChange={(event) =>
                  setStockMode(event.target.value as MenuItem["stockMode"])
                }
              >
                <option value="prepared">{tr("Track product quantity")}</option>
                <option value="untracked">{tr("No stock tracking")}</option>
              </select>
            </Field>
            <Field label={tr("Selling price (LKR)")}>
              <input
                className="input"
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={sellingPrice}
                onChange={(event) => setSellingPrice(event.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label={tr("Wholesale price (LKR)")}><input className="input" name="wholesalePrice" type="number" min="0.01" step="0.01" defaultValue={product?.wholesalePrice?String(product.wholesalePrice/100):''} placeholder={tr("Use retail price")}/><small>{tr("Optional trade price per sale unit. Leave blank to use retail.")}</small></Field>
            <Field label={tr("Cost per unit (LKR)")}>
              <input
                className="input"
                name="cost"
                type="number"
                min="0"
                step="0.01"
                required
                value={purchaseCost}
                onChange={(event) => setPurchaseCost(event.target.value)}
              />
            </Field>
            <div className="product-profit-preview product-field-full" aria-label={tr("Product profit preview")}>
              <span>{tr("Gross profit per unit")} <strong>{money(previewPrice - previewCost)}</strong></span>
              <span>{tr("Gross margin")} <strong>{previewPrice > 0 ? `${((previewPrice - previewCost) / previewPrice * 100).toFixed(1)}%` : '—'}</strong></span>
              <small>{stockMode === 'recipe' ? 'Use the recipe editor to calculate ingredient cost per portion. This preview uses the entered unit cost.' : tr("Before discounts, tax and operating expenses. Sales retain their cost when confirmed.")}</small>
            </div>
            <Field label={tr("Barcode (optional)")}>
              <div className="product-barcode-field">
                <Barcode size={16} />
                <input
                  className="input"
                  name="barcode"
                  maxLength={80}
                  defaultValue={product?.barcode || ""}
                  placeholder={tr("Scan or enter barcode")}
                  autoComplete="off"
                />
              </div>
            </Field>
            <Field label={tr("SKU (optional)")}>
              <input
                className="input product-sku"
                name="sku"
                maxLength={60}
                defaultValue={product?.sku || ""}
                placeholder={tr("e.g. MART-001")}
                autoComplete="off"
              />
            </Field>
            <Field label={tr("Sale unit")}><select className="select" aria-label={tr("Sale unit")} value={stockUnit} disabled={Boolean(linkedStock)} onChange={event=>setStockUnit(event.target.value)}>{saleUnits.map(unit=><option key={unit} value={unit}>{unit}</option>)}</select><small>{tr("Prices and stock use this same unit. Weighed items accept three decimal places.")}</small></Field>
            <Field label={tr("Low stock alert at")}>
              <input
                className="input"
                name="minimum"
                onChange={() => setMinimumEdited(true)}
                aria-label={tr("Low stock alert at")}
                type="number"
                min="0"
                max="100000"
                step="0.001"
                defaultValue={
                  product?.reorderLevel ?? linkedStock?.minimum ?? 5
                }
                placeholder="5"
              />
              <small className="product-field-help">{tr("Alert at this quantity or below. Leave blank to use 5 units.")}</small>
            </Field>
            <PhotoPicker ref={photoPicker} value={image} onChange={setImage} onBusyChange={setPhotoBusy} disabled={busy} />
            <Field label={tr("Description (optional)")} full>
              <textarea
                className="input"
                name="description"
                maxLength={500}
                rows={2}
                defaultValue={product?.description || ""}
              />
            </Field>
            <label className="product-checkbox product-field-full">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={product?.enabled !== false}
              />
              <span>{tr("Available on the menu")}</span>
            </label>
          </div>
          {stockMode === "prepared" && (
            <section className="product-stock-setup">
              <label className="product-checkbox">
                <input
                  type="checkbox"
                  checked={manageStock}
                  onChange={(event) => setManageStock(event.target.checked)}
                />
                <span>
                  <strong>
                    {linkedStock
                      ? tr("Update branch stock count")
                      : tr("Set up branch stock")}
                  </strong>
                  <small>{data.branch.name} {tr("· this location only")}</small>
                </span>
              </label>
              {manageStock && (
                <div className="form-grid">
                  <Field label={tr("Best-before date")}><input className="input" type="date" aria-label={tr("Best-before date")} value={expiryDate} onChange={event=>setExpiryDate(event.target.value)}/><small>{tr("Optional date for the current stock. Manage separate batches outside this field.")}</small></Field>
                  <Field
                    label={
                      linkedStock
                        ? tr("Counted stock ({0})", linkedStock.unit)
                        : tr("Opening stock quantity")
                    }
                    full
                  >
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100000"
                      step="0.001"
                      required
                      value={quantity}
                      onChange={(event) => {
                        setQuantity(event.target.value);
                        setQuantityEdited(true);
                      }}
                    />
                    {linkedStock && (
                      <small>{tr("Current recorded stock:")} {number(linkedStock.quantity)}{" "}
                        {linkedStock.unit}. The difference is recorded as an
                        audited adjustment.
                      </small>
                    )}
                  </Field>
                </div>
              )}
            </section>
          )}
          {stockMode === "recipe" && (
            <p className="product-help">
              <ShieldCheck size={15} />
              Configure the recipe in Production after saving. Ingredients are
              deducted when the order is confirmed.
            </p>
          )}
          {error && (
            <div className="error-message product-form-error" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions">
            <button
              className="button button-ghost"
              type="button"
              onClick={onClose}
              disabled={busy || photoBusy}
            >{tr("Cancel")}</button>
            <button className="button button-primary" disabled={busy || photoBusy}>
              {busy ? tr("Saving…") : item ? tr("Save product") : tr("Add product")}
              <Check size={15} />
            </button>
          </div>
        </form>
      </Dialog>
      {categoryDialog && (
        <CategoryDialog
          onClose={() => setCategoryDialog(false)}
          onCreated={setSelectedCategory}
        />
      )}
    </>
  );
}

export default function Products() {
  const tr = useTranslation();
  const { data, branchId, locale } = usePOS();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [editing, setEditing] = useState<MenuItem | null | undefined>(
    undefined,
  );
  const [categoryDialog, setCategoryDialog] = useState(false);
  const canEdit = ["owner", "manager"].includes(data.user.role);
  const products = data.menu as Product[];
  const stockStateFor = (product: Product) =>
    productStockState(product, data.inventory, data.recipes, branchId);
  const unitCostFor = (product: Product) => productCost(product, data.inventory, data.recipes, branchId).unitCost;
  const lowStock = products.filter((product) => stockStateFor(product).low);
  const filtered = products.filter((product) => {
    const stockState = stockStateFor(product);
    return (
      (category === "all" || product.categoryId === category) &&
      `${product.name} ${product.nameSi} ${product.description} ${product.barcode || ""} ${product.sku || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (stockFilter === "all" ||
        (stockFilter === "low" && stockState.low) ||
        (stockFilter === "unavailable" && !product.available))
    );
  });

  function exportProducts() {
    const rows = [
      [
        "Product",
        "Category",
        "SKU",
        "Barcode",
        "Retail price (LKR)",
        "Wholesale price (LKR)",
        "Cost (LKR)",
        "Stock quantity",
        "Stock unit",
        "Low stock alert at",
        "Tracking",
      ],
      ...filtered.map((product) => {
        const stock = stockStateFor(product);
        return [
          product.name,
          data.categories.find((category) => category.id === product.categoryId)
            ?.name || "",
          product.sku || "",
          product.barcode || "",
          product.price / 100,
          product.wholesalePrice ? product.wholesalePrice / 100 : "Use retail",
          unitCostFor(product) / 100,
          stock.quantity ?? "",
          stock.unit,
          product.stockMode === "untracked" ? "" : stock.threshold,
          product.stockMode,
        ];
      }),
    ];
    const csv =
      "\ufeff" +
      rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "retail-pos-products.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="products-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> {tr("YOUR PRODUCT CATALOGUE")}</div>
          <h1>{tr("Products")}</h1>
          <p className="page-subtitle">{tr("Every dish, every detail. Organised and ready to sell.")}</p>
        </div>
        <div className="products-heading-actions">
          <button className="button button-ghost" onClick={exportProducts}>
            <Download size={15} />{tr("Export")}</button>
          {canEdit && (
            <>
              <button
                className="button button-ghost"
                onClick={() => setCategoryDialog(true)}
              >
                <Layers3 size={15} />{tr("Add category")}</button>
              <button
                className="button button-primary"
                onClick={() => setEditing(null)}
              >
                <Plus size={16} />{tr("Add product")}</button>
            </>
          )}
        </div>
      </header>
      <div className="products-summary">
        <div className="panel product-summary-card">
          <span>
            <Package size={17} />{tr("Total products")}</span>
          <strong>{number(products.length)}</strong>
          <small>{tr("Your full catalogue")}</small>
        </div>
        <div className="panel product-summary-card">
          <span>
            <Layers3 size={17} />{tr("Categories")}</span>
          <strong>{number(data.categories.length)}</strong>
          <small>{tr("Made easy to find")}</small>
        </div>
        <div className="panel product-summary-card">
          <span>
            <Tag size={17} />{tr("Available now")}</span>
          <strong>
            {number(products.filter((product) => product.available).length)}
          </strong>
          <small>{tr("Ready for your next order")}</small>
        </div>
        <div className="panel product-summary-card">
          <span>
            <Barcode size={17} />{tr("Low stock")}</span>
          <strong>{number(lowStock.length)}</strong>
          <small>{tr("At or below each product's alert level")}</small>
        </div>
      </div>
      <section className="panel products-catalogue">
        <div className="products-toolbar">
          <div className="products-search">
            <Search size={16} />
            <input
              type="search"
              aria-label={tr("Search products")}
              placeholder={tr("Search name, SKU or barcode…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="products-filters">
            <label>
              <Layers3 size={14} />
              <select
                aria-label={tr("Product category")}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">{tr("All categories")}</option>
                {data.categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
            <label>
              <SlidersHorizontal size={14} />
              <select
                aria-label={tr("Product stock status")}
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value)}
              >
                <option value="all">{tr("All stock statuses")}</option>
                <option value="low">{tr("Low stock")}</option>
                <option value="unavailable">{tr("Unavailable")}</option>
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
        </div>
        <div className="products-table-scroll">
          <table className="data-table products-table">
            <thead>
              <tr>
                <th>{tr("Product")}</th>
                <th>{tr("Barcode / SKU")}</th>
                <th>{tr("Selling price")}</th>
                <th>{tr("Unit cost")}</th>
                <th>{tr("Branch stock")}</th>
                <th>{tr("Status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const stock = stockStateFor(product);
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="product-table-name">
                        <div className="product-table-image">
                          {product.image ? (
                            <ProductPhoto src={product.image} alt="" loading="lazy" />
                          ) : (
                            <Package size={20} />
                          )}
                        </div>
                        <div>
                          <strong>{locale === "si" && product.nameSi ? product.nameSi : product.name}</strong>
                          <small>
                            {data.categories.find(
                              (category) => category.id === product.categoryId,
                            )?.name || tr("Uncategorised")}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="product-identifiers">
                        <span>{product.barcode || tr("No barcode")}</span>
                        <small>{product.sku || "—"}</small>
                      </div>
                    </td>
                    <td>
                      <strong>{money(product.price)}</strong>
                    </td>
                    <td>{money(unitCostFor(product))}</td>
                    <td>
                      {stock.quantity !== null ? (
                        <div
                          className={`product-stock ${stock.low ? "low" : ""}`}
                        >
                          <strong>
                            {number(stock.quantity)} <span>{stock.unit}</span>
                          </strong>
                          <small>
                            {stock.low ? tr("Low stock") : tr("Alert")} {tr("at")} {number(stock.threshold)}
                            {product.stockMode === "recipe" ? tr("· From recipe ingredients") : ""}
                          </small>
                        </div>
                      ) : (
                        <span className="product-untracked">
                          {product.stockMode === "recipe"
                            ? tr("Recipe ingredients")
                            : product.stockMode === "prepared"
                              ? tr("Stock not set up")
                              : tr("Not tracked")}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`product-status ${product.available ? "available" : ""}`}
                      >
                        <i />
                        {product.enabled === false
                          ? tr("Disabled")
                          : product.available
                            ? tr("Available")
                            : tr("Out of stock")}
                      </span>
                    </td>
                    <td>
                      {canEdit && (
                        <button
                          className="button button-ghost button-small"
                          aria-label={tr("Edit {0}", product.name)}
                          onClick={() => setEditing(product)}
                        >
                          <SlidersHorizontal size={13} />{tr("Edit")}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <div className="empty-icon">
              <Search size={25} />
            </div>
            <h3>{tr("No products found")}</h3>
            <p>{tr("Try another name, barcode or category.")}</p>
            <button
              className="button button-ghost"
              onClick={() => {
                setSearch("");
                setCategory("all");
                setStockFilter("all");
              }}
            >{tr("Reset filters")}</button>
          </div>
        )}
        <footer className="products-table-footer">
          <span>
            {filtered.length} {tr("of")} {products.length} {tr("products")}</span>
          <span>
            <ShieldCheck size={13} />{tr("Stock shown for")} {data.branch.name}
          </span>
        </footer>
      </section>
      {editing !== undefined && (
        <ProductDialog
          item={editing || undefined}
          categoryId={category === "all" ? undefined : category}
          onClose={() => setEditing(undefined)}
        />
      )}
      {categoryDialog && (
        <CategoryDialog onClose={() => setCategoryDialog(false)} />
      )}
    </div>
  );
}
