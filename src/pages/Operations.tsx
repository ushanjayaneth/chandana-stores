import {useTranslation} from "../lib/language";
import {printPeripheralText} from '../lib/peripherals';
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Flame,
  History,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  XCircle,
} from "lucide-react";
import type { Branch, Order, OrderStatus, Settings } from "../../shared/types";
import { usePOS } from "../lib/context";
import { commandId, dateTime, elapsed, money, time } from "../lib/format";
import { EmptyState, Modal, StatusBadge } from "../components/ui";
import { PaymentDialog } from "./POS";
import { receiptDimensions, receiptPrintCss } from "../lib/receipt";
import { useDevicePreferences } from "../lib/preferences";

const typeIcons = {
  "dine-in": UtensilsCrossed,
  takeaway: ShoppingBag,
  delivery: Truck,
};
export function Orders({
  onOpen,
  onReceipt,
  historyView = false,
}: {
  onOpen: (id: string) => void;
  onReceipt: (id: string) => void;
  historyView?: boolean;
}) {
  const tr = useTranslation();
  const { data, mutate, notify } = usePOS();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(historyView ? "all" : "active");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"cards" | "list">(
    historyView ? "list" : "cards",
  );
  const active = data.orders.filter(
    (o) => !["completed", "cancelled"].includes(o.status),
  );
  const source = historyView
    ? data.orders.filter(
        (o) => o.paid > 0 || ["completed", "cancelled"].includes(o.status),
      )
    : data.orders;
  const orders = source.filter(
    (o) =>
      (filter === "all" ||
        (filter === "active"
          ? !["completed", "cancelled"].includes(o.status)
          : filter === "unpaid"
            ? o.paymentStatus !== "paid" && o.status !== "cancelled"
            : filter === "paid"
              ? o.paymentStatus === "paid"
              : filter === "refunded"
                ? o.refunded > 0
                : o.status === filter)) &&
      (!fromDate ||
        new Date(o.createdAt).getTime() >=
          new Date(`${fromDate}T00:00:00`).getTime()) &&
      (!toDate ||
        new Date(o.createdAt).getTime() <
          new Date(`${toDate}T23:59:59.999`).getTime() + 1) &&
      `${o.number} ${o.lines.map((l) => l.name).join(" ")} ${data.tables.find((t) => t.id === o.tableId)?.name || ""} ${data.customers.find((c) => c.id === o.customerId)?.name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const canPay = ["owner", "manager", "cashier"].includes(data.user.role);
  const canRefund = ["owner", "manager"].includes(data.user.role);
  function exportOrders() {
    const rows = [
      [
        "Order",
        "Created",
        "Type",
        "Status",
        "Payment",
        "Total LKR",
        "Paid LKR",
      ],
      ...orders.map((o) => [
        o.number,
        o.createdAt,
        o.type,
        o.status,
        o.paymentStatus,
        (o.total / 100).toFixed(2),
        (o.paid / 100).toFixed(2),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${historyView ? "sales-history" : "orders"}-${data.branch.code}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(historyView ? tr("Sales history exported.") : tr("Orders exported."));
  }
  async function cancel(reason: string) {
    if (!cancelOrder) return;
    setBusy(true);
    try {
      await mutate(
        `/orders/${cancelOrder.id}/status`,
        {
          commandId: commandId(),
          expectedVersion: cancelOrder.version,
          status: "cancelled",
          reason,
        },
        "PATCH",
      );
      notify(
        tr("Order cancelled. Stock disposition is recorded in the audit trail."),
      );
      setCancelOrder(null);
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {historyView ? tr("YOUR SALES RECORD") : tr("SALES, AT A GLANCE")}
          </div>
          <h1>
            {historyView ? tr("Sales history") : tr("Orders")}
            <span className="heading-period">.</span>
          </h1>
          <p className="page-subtitle">
            {historyView
              ? tr("Review payments, completed and cancelled bills. Reprint any receipt.")
              : tr("Review sales, payments and authorized refunds.")}
          </p>
        </div>
        <button className="button" onClick={exportOrders}>
          <Download size={14} /> {tr("Export")}</button>
      </div>
      <div className="operation-summary">
        <div className="panel operation-stat">
          <span>{historyView ? tr("Matching bills") : tr("Open orders")}</span>
          <strong>
            {(historyView ? orders.length : active.length)
              .toString()
              .padStart(2, "0")}
          </strong>
          <span className="operation-stat-icon">
            <ClipboardIcon />
          </span>
        </div>
        <div className="panel operation-stat">
          <span>{historyView ? tr("Settled bills") : tr("Awaiting completion")}</span>
          <strong>
            {(historyView ? orders : data.orders)
              .filter((o) =>
                historyView
                  ? o.paymentStatus === "paid"
                  : ["new", "preparing"].includes(o.status),
              )
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <span className="operation-stat-icon">
            <ChefHat size={20} />
          </span>
        </div>
        <div className="panel operation-stat">
          <span>{historyView ? tr("Cancelled bills") : tr("Ready for pickup")}</span>
          <strong>
            {(historyView ? orders : data.orders)
              .filter((o) => o.status === (historyView ? "cancelled" : "ready"))
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <span className="operation-stat-icon">
            <CheckCircle2 size={20} />
          </span>
        </div>
        <div className="panel operation-stat">
          <span>
            {historyView ? tr("Payments less refunds") : tr("Outstanding balance")}
          </span>
          <strong className="stat-money">
            {money(
              historyView
                ? orders.reduce((sum, o) => sum + o.paid - o.refunded, 0)
                : active.reduce(
                    (sum, o) => sum + Math.max(0, o.total - o.paid),
                    0,
                  ),
            )}
          </strong>
          <span className="operation-stat-icon">
            <Wallet size={20} />
          </span>
        </div>
      </div>
      <div className="operations-toolbar">
        <div className="filter-tabs">
          {(historyView
            ? [
                { id: "all", label: tr("All history"), count: source.length },
                { id: "paid", label: tr("Settled") },
                { id: "completed", label: tr("Completed") },
                { id: "refunded", label: tr("Refunded") },
                { id: "cancelled", label: tr("Cancelled") },
              ]
            : [
                { id: "active", label: tr("Open"), count: active.length },
                { id: "all", label: tr("All orders") },
                { id: "unpaid", label: tr("Unpaid") },
                { id: "completed", label: tr("Completed") },
                { id: "cancelled", label: tr("Cancelled") },
              ]
          ).map((f) => (
            <button
              key={f.id}
              className={filter === f.id ? "active" : ""}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.count !== undefined && <small>{f.count}</small>}
            </button>
          ))}
        </div>
        <div className="operations-tool-right">
          <div className="search-input compact">
            <Search size={14} />
            <input
              placeholder={tr("Search orders...")}
              aria-label={tr("Search orders")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="icon-button"
            onClick={() => setView(view === "cards" ? "list" : "cards")}
            aria-label={tr("Toggle order view")}
          >
            {view === "cards" ? (
              <FileText size={15} />
            ) : (
              <LayoutGrid size={15} />
            )}
          </button>
        </div>
      </div>
      {historyView && (
        <div
          className="operations-toolbar"
          style={{ justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}
        >
          <label className="field" style={{ minWidth: 150, flex: "0 1 190px" }}>
            <span>{tr("From date")}</span>
            <input
              className="input"
              aria-label={tr("Sales history from date")}
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="field" style={{ minWidth: 150, flex: "0 1 190px" }}>
            <span>{tr("To date")}</span>
            <input
              className="input"
              aria-label={tr("Sales history to date")}
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          {(fromDate || toDate) && (
            <button
              className="button button-ghost button-small"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
            >{tr("Clear dates")}</button>
          )}
        </div>
      )}
      {orders.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={
              historyView
                ? tr("No bills match these filters")
                : tr("Nothing on this ticket rail")
            }
            description={
              historyView
                ? tr("Try another date range or search. Bills with payments, completed bills and cancellations appear here.")
                : tr("New orders will appear here. Try another filter to see past service.")
            }
          />
        </div>
      ) : view === "list" ? (
        <div className="panel table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr("Order")}</th>
                <th>{tr("Service")}</th>
                <th>{tr("Created")}</th>
                <th>{tr("Status")}</th>
                <th>{tr("Payment")}</th>
                <th className="text-right">{tr("Total")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="order-number-cell">
                    <strong>{o.number}</strong>
                  </td>
                  <td>
                    {o.type === "dine-in"
                      ? data.tables.find((t) => t.id === o.tableId)?.name || tr("Counter sale")
                      : o.type}
                  </td>
                  <td>{dateTime(o.createdAt)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td>
                    <StatusBadge status={o.paymentStatus} />
                  </td>
                  <td className="text-right">{money(o.total)}</td>
                  <td>
                    <button
                      className="icon-button"
                      onClick={() => onReceipt(o.id)}
                      title={tr("View receipt")}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="orders-grid">
          {orders.map((o) => {
            const Icon = typeIcons[o.type];
            return (
              <article className="panel order-card" key={o.id}>
                <div className="order-card-head">
                  <div className="order-type-icon">
                    <Icon size={17} />
                  </div>
                  <div>
                    <h3>{o.number}</h3>
                    <span>
                      {o.type === "dine-in"
                        ? data.tables.find((t) => t.id === o.tableId)?.name ||
                          tr("Counter sale")
                        : o.type === "takeaway"
                          ? tr("Counter sale")
                          : tr("Delivery")}{" "}
                      <i>·</i> {time(o.createdAt)}
                    </span>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="order-card-items">
                  {o.lines.slice(0, 3).map((l) => (
                    <div key={l.id}>
                      <span className="order-line-qty">{l.quantity}×</span>
                      <span>
                        {l.name}
                        {(l.discount || 0) > 0 && (
                          <small style={{ display: "block" }}>{tr("Item discount −")} {money(l.discount || 0)}
                          </small>
                        )}
                      </span>
                      <span>{money(l.lineTotal)}</span>
                    </div>
                  ))}
                  {o.lines.length > 3 && (
                    <small>+ {o.lines.length - 3} {tr("more items")}</small>
                  )}
                </div>
                <div className="order-card-total">
                  <span>
                    {o.lines.reduce((s, l) => s + l.quantity, 0)} {tr("items")} <i>·</i>{" "}
                    <StatusBadge status={o.paymentStatus} />
                  </span>
                  <strong>{money(o.total)}</strong>
                </div>
                <div className="order-card-actions">
                  {!["completed", "cancelled"].includes(o.status) && (
                    <button
                      className="button button-ghost button-small"
                      onClick={() => onOpen(o.id)}
                    >{tr("Open order")} <ArrowRight size={12} />
                    </button>
                  )}
                  {canPay &&
                    o.paymentStatus !== "paid" &&
                    o.status !== "cancelled" && (
                      <button
                        className="button button-primary button-small"
                        onClick={() => setPaymentId(o.id)}
                      >{tr("Take payment")}</button>
                    )}
                  <button
                    className="icon-button"
                    onClick={() => onReceipt(o.id)}
                    aria-label={tr("Receipt for {0}", o.number)}
                  >
                    <Printer size={14} />
                  </button>
                  {canRefund && o.paid - o.refunded > 0 && (
                    <button
                      className="button button-ghost button-small"
                      onClick={() => setRefundOrder(o)}
                    >{tr("Refund")}</button>
                  )}
                  {canRefund &&
                    o.paid === 0 &&
                    !["cancelled", "completed"].includes(o.status) && (
                      <button
                        className="icon-button"
                        onClick={() => setCancelOrder(o)}
                        aria-label={tr("Cancel {0}", o.number)}
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {paymentId && (
        <PaymentDialog
          orderId={paymentId}
          onClose={() => setPaymentId(null)}
          onPaid={(id) => {
            setPaymentId(null);
            onReceipt(id);
          }}
        />
      )}
      {refundOrder && (
        <RefundDialog
          order={refundOrder}
          onClose={() => setRefundOrder(null)}
        />
      )}{" "}
      {cancelOrder && (
        <ReasonDialog
          title={tr("Cancel {0}", cancelOrder.number)}
          description={tr("Prepared food is not automatically returned to sellable stock. Record the reason for the audit trail.")}
          busy={busy}
          onClose={() => setCancelOrder(null)}
          onSubmit={(reason) => void cancel(reason)}
        />
      )}
    </>
  );
}
function ClipboardIcon() {
  return <FileText size={20} />;
}
function ReasonDialog({
  title,
  description,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const tr = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <Modal title={title} subtitle={description} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reason);
        }}
      >
        <label className="field">
          <span>{tr("Reason")}</span>
          <textarea
            required
            minLength={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
          >{tr("Keep order")}</button>
          <button className="button button-danger" disabled={busy}>
            {busy ? tr("Saving...") : tr("Confirm cancellation")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RefundDialog({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const tr = useTranslation();
  const { mutate, notify } = usePOS();
  const [amount, setAmount] = useState(
    ((order.paid - order.refunded) / 100).toString(),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [id] = useState(commandId);
  return (
    <Modal
      title={tr("Record a refund")}
      subtitle={tr("{0} · available {1}", order.number, money(order.paid - order.refunded))}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await mutate(`/orders/${order.id}/refunds`, {
              commandId: id,
              expectedVersion: order.version,
              amount: Math.round(Number(amount) * 100),
              reason,
            });
            notify(
              tr("Refund recorded. Check the original payment channel for settlement."),
            );
            onClose();
          } catch (err) {
            notify((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="notice-banner">
          <ShieldCheck size={16} /> Prepared food is not returned to sellable
          stock. Electronic refunds require separate provider settlement.
        </div>
        <div className="form-grid">
          <label className="field full-width">
            <span>{tr("Refund amount (LKR)")}</span>
            <input
              className="input"
              type="number"
              min="0.01"
              max={(order.paid - order.refunded) / 100}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="field full-width">
            <span>{tr("Reason")}</span>
            <textarea
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={tr("Why is this payment being refunded?")}
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >{tr("Cancel")}</button>
          <button className="button button-danger" disabled={busy}>
            {busy ? tr("Recording...") : tr("Record refund")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Kitchen() {
  const tr = useTranslation();
  const { data, mutate, notify } = usePOS();
  const [busy, setBusy] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const orders = data.orders.filter(
    (o) =>
      ["new", "preparing", "ready"].includes(o.status) &&
      (type === "all" || o.type === type),
  );
  const canUpdate = ["owner", "manager", "kitchen", "waiter"].includes(
    data.user.role,
  );
  async function progress(order: Order, status: OrderStatus) {
    setBusy(order.id);
    try {
      await mutate(
        `/orders/${order.id}/status`,
        { commandId: commandId(), expectedVersion: order.version, status },
        "PATCH",
      );
      notify(
        tr("{0} is {1}.", order.number, status === "preparing" ? "being prepared" : status === "ready" ? "ready to serve" : "served"),
      );
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> {tr("LIVE KITCHEN")}</div>
          <h1>{tr("On the pass")}<span className="heading-period">.</span>
          </h1>
          <p className="page-subtitle">
            A clear view of what’s cooking, and what’s next.
          </p>
        </div>
        <div className="kitchen-clock">
          <Clock3 size={15} />
          {time(new Date(now).toISOString())}
          <span>{tr("Auto-refresh on")}</span>
        </div>
      </div>
      <div className="operations-toolbar">
        <div className="filter-tabs">
          {[
            { id: "all", name: "All tickets" },
            { id: "dine-in", name: "Counter sale" },
            { id: "takeaway", name: "Counter sale" },
            { id: "delivery", name: "Delivery" },
          ].map((t) => (
            <button
              key={t.id}
              className={type === t.id ? "active" : ""}
              onClick={() => setType(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 10 }}>
          {orders.length} {tr("active tickets")}</span>
      </div>
      <div className="kitchen-board">
        {(
          [
            {
              status: "new",
              label: tr("New tickets"),
              subtitle: "Ready to get started",
              next: "preparing",
              action: "Start preparing",
              icon: FileText,
            },
            {
              status: "preparing",
              label: tr("Preparing"),
              subtitle: "A little care in every dish",
              next: "ready",
              action: "Mark ready",
              icon: Flame,
            },
            {
              status: "ready",
              label: tr("Ready for pickup"),
              subtitle: "From the pass to the guest",
              next: "served",
              action: "Mark served",
              icon: CheckCircle2,
            },
          ] as const
        ).map((column) => {
          const tickets = orders.filter((o) => o.status === column.status);
          return (
            <section
              className={`kitchen-column kitchen-${column.status}`}
              key={column.status}
            >
              <div className="kitchen-column-heading">
                <span className="kitchen-column-icon">
                  <column.icon size={16} />
                </span>
                <div>
                  <h2>
                    {column.label}
                    <small>{tickets.length}</small>
                  </h2>
                  <p>{column.subtitle}</p>
                </div>
              </div>
              <div className="kitchen-tickets">
                {tickets.map((o) => {
                  const mins = elapsed(o.createdAt);
                  const Icon = typeIcons[o.type];
                  return (
                    <article
                      className={`panel kitchen-ticket ${mins > 20 ? "ticket-late" : ""}`}
                      key={o.id}
                    >
                      <div className="ticket-top">
                        <div>
                          <h3>{o.number}</h3>
                          <span>
                            <Icon size={12} />
                            {o.type === "dine-in"
                              ? data.tables.find((t) => t.id === o.tableId)
                                  ?.name || tr("Counter sale")
                              : o.type}
                          </span>
                        </div>
                        <div
                          className={`ticket-age ${mins > 20 ? "late" : ""}`}
                        >
                          <Clock3 size={12} />
                          {mins}m
                        </div>
                      </div>
                      <div className="ticket-lines">
                        {o.lines.map((l) => (
                          <div className="ticket-line" key={l.id}>
                            <strong>{l.quantity}</strong>
                            <div>
                              <span>{l.name}</span>
                              {l.note && <small>{l.note}</small>}
                            </div>
                            <span className="ticket-line-check" />
                          </div>
                        ))}
                      </div>
                      {o.note && (
                        <div className="ticket-note">
                          <FileText size={12} />
                          {o.note}
                        </div>
                      )}
                      <div className="ticket-bottom">
                        <span>{tr("Received")} {time(o.createdAt)}</span>
                        <span>
                          {o.lines.reduce((s, l) => s + l.quantity, 0)} {tr("items")}</span>
                      </div>
                      <button
                        className={`button kitchen-action ${column.status === "ready" ? "button-primary" : ""}`}
                        disabled={
                          !canUpdate || busy === o.id || !data.sync.hubOnline
                        }
                        onClick={() => void progress(o, column.next)}
                      >
                        <column.icon size={14} />
                        {busy === o.id ? tr("Updating...") : column.action}
                        <ArrowRight size={14} />
                      </button>
                    </article>
                  );
                })}
                {!tickets.length && (
                  <div className="kitchen-empty">
                    <Check size={22} />
                    <span>
                      {column.status === "new"
                        ? tr("All caught up.")
                        : tr("No tickets here yet.")}
                    </span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

export function Tables({
  onOpen,
  onNew,
}: {
  onOpen: (id: string) => void;
  onNew: (tableId: string) => void;
}) {
  const tr = useTranslation();
  const { data } = usePOS();
  const [area, setArea] = useState("all");
  const areas = [...new Set(data.tables.map((t) => t.area))];
  const occupied = data.tables.filter((t) => t.status === "occupied").length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{tr("A SEAT FOR EVERY GUEST")}</div>
          <h1>{tr("The floor")}<span className="heading-period">.</span>
          </h1>
          <p className="page-subtitle">
            {data.tables.length - occupied} {tr("tables available ·")} {occupied} {tr("in service")}</p>
        </div>
        <div className="table-legend">
          <span>
            <i />{tr("Available")}</span>
          <span>
            <i />{tr("Occupied")}</span>
        </div>
      </div>
      <div className="operations-toolbar">
        <div className="filter-tabs">
          <button
            className={area === "all" ? "active" : ""}
            onClick={() => setArea("all")}
          >{tr("All areas")}</button>
          {areas.map((a) => (
            <button
              key={a}
              className={area === a ? "active" : ""}
              onClick={() => setArea(a)}
            >
              {a}
            </button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 10 }}>
          <Users
            size={12}
            style={{ verticalAlign: "middle", marginRight: 6 }}
          />
          {data.tables.reduce((s, t) => s + t.seats, 0)} {tr("total seats")}</span>
      </div>
      <div className="tables-grid">
        {data.tables
          .filter((t) => area === "all" || t.area === area)
          .map((table) => {
            const order =
              data.orders.find((o) => o.id === table.orderId) ||
              data.orders.find(
                (o) =>
                  o.tableId === table.id &&
                  !["completed", "cancelled"].includes(o.status),
              );
            return (
              <button
                key={table.id}
                className={`panel floor-table ${table.status}`}
                onClick={() => (order ? onOpen(order.id) : onNew(table.id))}
              >
                <div className="floor-table-top">
                  <span>{table.area}</span>
                  <StatusBadge status={table.status} />
                </div>
                <div className={`table-illustration seats-${table.seats}`}>
                  <i className="chair chair-top-left" />
                  <i className="chair chair-top-right" />
                  <i className="chair chair-bottom-left" />
                  <i className="chair chair-bottom-right" />
                  {table.seats > 4 && (
                    <>
                      <i className="chair chair-left" />
                      <i className="chair chair-right" />
                    </>
                  )}
                  <div className="table-surface">
                    <UtensilsCrossed size={22} />
                  </div>
                </div>
                <h3>{table.name}</h3>
                <span className="table-seats">{table.seats} {tr("seats")}</span>
                <div className="floor-table-bottom">
                  {order ? (
                    <>
                      <strong>{money(order.total)}</strong>
                      <span>
                        {elapsed(order.createdAt)} {tr("min")} <ArrowRight size={12} />
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{tr("Ready for guests")}</span>
                      <Plus size={14} />
                    </>
                  )}
                </div>
              </button>
            );
          })}
      </div>
    </>
  );
}

export function Receipt({
  order,
  autoPrint = false,
  branch,
  settings,
  onClose,
}: {
  order: Order;
  autoPrint?: boolean;
  branch: Branch;
  settings: Settings;
  onClose: () => void;
}) {
  const tr = useTranslation();
  useDevicePreferences();
  const {notify}=usePOS();
  const [printing,setPrinting]=useState(false);
  const printInProgress=useRef(false);
  const autoPrinted=useRef(false);
  async function printReceipt(){if(printInProgress.current)return;printInProgress.current=true;setPrinting(true);try{
    const text=[settings.businessName,branch.name,branch.address,branch.phone,`Receipt ${order.number}`,dateTime(order.createdAt),'--------------------------------',...order.lines.flatMap(line=>[`${line.quantity} x ${line.name}`,money(line.lineTotal)]),'--------------------------------',`Subtotal: ${money(order.subtotal)}`,`Discount: ${money(order.discount)}`,`Tax: ${money(order.tax)}`,`Service: ${money(order.serviceCharge)}`,`TOTAL: ${money(order.total)}`,`Paid: ${money(order.paid)}`,`Balance: ${money(Math.max(0,order.total-order.paid))}`,...order.payments.map(payment=>`${payment.method.toUpperCase()}: ${money(payment.amount)}${payment.change?` / Change ${money(payment.change)}`:''}`),settings.receiptFooter].filter(Boolean).join('\n');
    if(!await printPeripheralText(branch.id,text))window.print();
  }catch(error){notify((error as Error).message,'error');}finally{printInProgress.current=false;setPrinting(false);}}
  useEffect(() => {
    if (autoPrint && !autoPrinted.current) {
      autoPrinted.current = true;
      void printReceipt();
    }
    const listener = () => {void printReceipt();};
    window.addEventListener('retail:print-receipt', listener);
    return () => window.removeEventListener('retail:print-receipt', listener);
  });
  const dimensions = receiptDimensions(settings);
  const itemDiscount = order.lines.reduce(
    (sum, line) => sum + (line.discount || 0),
    0,
  );
  const hasItemDiscountMetadata = order.lines.some(
    (line) => line.discount !== undefined,
  );
  const cartDiscount =
    order.cartDiscount ??
    (hasItemDiscountMetadata
      ? Math.max(0, order.discount - itemDiscount)
      : order.discount);
  const content = (
    <>
      <h2>{settings.businessName || "Chandana Stores"}</h2>
      <p>
        {branch.name}
        <br />
        {branch.address}
        <br />
        {branch.phone}
      </p>
      <div className="receipt-meta">
        <div>
          <span>{tr("Receipt")}</span>
          <strong>{order.number}</strong>
        </div>
        <div>
          <span>{tr("Date")}</span>
          <span>{dateTime(order.createdAt)}</span>
        </div>
        <div>
          <span>{tr("Service")}</span>
          <span>{order.priceMode==='wholesale'?tr("Wholesale"):tr("Retail")} / {order.type === "takeaway" ? tr("Counter sale") : tr("Delivery")}</span>
        </div>
        <div>
          <span>{tr("Payment")}</span>
          <span>{order.paymentStatus.toUpperCase()}</span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>{tr("Item")}</th>
            <th>{tr("Amount")}</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.id}>
              <td>
                {l.quantity} {l.saleUnit || tr("pcs")} × {l.name}
                {(l.discount || 0) > 0 && (
                  <small style={{ display: "block", fontSize: ".85em" }}>{tr("Item discount −")} {money(l.discount || 0)}
                  </small>
                )}
              </td>
              <td>{money(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-totals">
        <div>
          <span>{tr("Subtotal")}</span>
          <span>{money(order.subtotal)}</span>
        </div>
        {itemDiscount > 0 && (
          <div>
            <span>{tr("Item discounts")}</span>
            <span>− {money(itemDiscount)}</span>
          </div>
        )}
        {cartDiscount > 0 && (
          <div>
            <span>
              {hasItemDiscountMetadata || order.cartDiscount !== undefined
                ? tr("Cart discount")
                : tr("Discount")}
            </span>
            <span>− {money(cartDiscount)}</span>
          </div>
        )}
        <div>
          <span>{tr("Service charge")}</span>
          <span>{money(order.serviceCharge)}</span>
        </div>
        <div>
          <span>{tr("Tax")}</span>
          <span>{money(order.tax)}</span>
        </div>
        <div className="total">
          <strong>{tr("Total")}</strong>
          <strong>{money(order.total)}</strong>
        </div>
        <div>
          <span>{tr("Paid")}</span>
          <span>{money(order.paid)}</span>
        </div>
        {order.refunded > 0 && (
          <div>
            <span>{tr("Refunded")}</span>
            <span>{money(order.refunded)}</span>
          </div>
        )}
        {order.payments.map((p) => (
          <div key={p.id}>
            <span>
              {p.method.toUpperCase()}
              {p.change > 0 ? tr("· change") : ""}
            </span>
            <span>{money(p.change > 0 ? p.change : p.amount)}</span>
          </div>
        ))}
      </div>
      <p className="receipt-thanks">
        {settings.receiptFooter || tr("Thank you for dining with us.")}
      </p>
      <p className="receipt-copy">{tr("COPY · Retain for your records")}</p>
    </>
  );
  return (
    <>
      <Modal title={tr("Order receipt")} subtitle={order.number} onClose={onClose}>
        <div
          className="receipt-preview"
          style={
            {
              width: `min(100%, ${dimensions.content}mm)`,
              "--font-scale": 1,
            } as CSSProperties
          }
        >
          {content}
        </div>
        <p className="preference-note" style={{ textAlign: "center" }}>
          {dimensions.paper} {tr("mm paper ·")} {dimensions.content} {tr("mm content ·")}{" "}
          {dimensions.offset} mm offset. Match the printer dialog's paper size
          to this layout.
        </p>
        <div className="form-actions">
          <button className="button button-ghost" onClick={onClose}>{tr("Close")}</button>
          <button
            className="button button-primary"
            disabled={printing} onClick={()=>void printReceipt()}
          >
            <Printer size={14} /> {tr("Print receipt")}</button>
        </div>
      </Modal>
      <style>
        {receiptPrintCss(settings) +
          " @media print{.print-receipt .total{font-size:1.1em!important}.print-receipt .receipt-copy{font-size:.7em!important}.print-receipt th:first-child{text-align:left}}"}
      </style>
      <div className="print-receipt">{content}</div>
    </>
  );
}
