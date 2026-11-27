import {useTranslation} from "../lib/language";
import { useRef, useState, type FormEvent } from "react";
import { Banknote, Check } from "lucide-react";
import { usePOS } from "../lib/context";
import { commandId, dateTime } from "../lib/format";
import { Modal } from "./ui";

type ShiftDialog = { kind: "open" } | { kind: "close"; shiftId: string };

export default function CashierShift() {
  const tr = useTranslation();
  const { data, branchId, mutate, notify } = usePOS();
  const activeShift = data.shifts.find(
    (shift) => shift.branchId === branchId && shift.status === "open",
  );
  const [dialog, setDialog] = useState<ShiftDialog | null>(null);
  const [requestId, setRequestId] = useState(commandId);
  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  function openDialog() {
    setRequestId(commandId());
    setAmount(activeShift ? "" : "0");
    setError("");
    setDialog(activeShift ? { kind: "close", shiftId: activeShift.id } : { kind: "open" });
  }

  function closeDialog() {
    if (!submitting.current) setDialog(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !dialog) return;
    const value = Number(amount || 0);
    const cents = Math.round(value * 100);
    if ((dialog.kind === "close" && !amount.trim()) || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents) || cents > 1_000_000_000) {
      setError(tr("Enter a cash amount from 0 to 10,000,000 LKR."));
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (dialog.kind === "open") {
        await mutate("/shifts/open", { commandId: requestId, branchId, openingFloat: cents });
      } else {
        await mutate(`/shifts/${dialog.shiftId}/close`, { commandId: requestId, branchId, countedCash: cents });
      }
      notify(dialog.kind === "open" ? tr("Cash shift opened") : tr("Cash shift closed"));
      setDialog(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the cash shift.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="cashier-shift-page">
      <div className="management-page-heading">
        <div>
          <div className="management-eyebrow">{tr("CASH DRAWER")}</div>
          <h1>{tr("Cash shift")}</h1>
          <p>{tr("Open and close the cash drawer for")} {data.branch.name}.</p>
        </div>
      </div>
      <section className={`panel cash-shift-banner ${activeShift ? "shift-is-open" : ""}`} aria-label={tr("Current cash shift")}>
        <div className="cash-shift-icon"><Banknote size={24} /></div>
        <div>
          <h2>{activeShift ? tr("Your cash shift is open") : tr("No cash shift is open")}</h2>
          <p>{activeShift ? tr("Opened {0}", dateTime(activeShift.openedAt)) : tr("Open a cash shift before accepting payments.")}</p>
        </div>
        <button type="button" className="button button-primary" onClick={openDialog}>
          {activeShift ? tr("Close cash shift") : tr("Open cash shift")}
        </button>
      </section>
      {dialog && (
        <Modal
          title={dialog.kind === "open" ? tr("Open a cash shift") : tr("Close cash shift")}
          subtitle={dialog.kind === "open" ? tr("Count the starting cash in the drawer.") : "Count all cash in the drawer before closing."}
          onClose={closeDialog}
        >
          <form onSubmit={submit} aria-busy={busy}>
            <label className="field">
              <span>{dialog.kind === "open" ? tr("Opening float (LKR)") : tr("Counted cash (LKR)")}</span>
              <input
                className="input"
                name={dialog.kind === "open" ? "openingFloat" : "countedCash"}
                type="number"
                inputMode="decimal"
                min="0"
                max="10000000"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required={dialog.kind === "close"}
                disabled={busy}
                autoComplete="off"
                placeholder="0.00"
              />
            </label>
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="form-actions">
              <button type="button" className="button button-ghost" onClick={closeDialog} disabled={busy}>{tr("Cancel")}</button>
              <button className="button button-primary" disabled={busy}>
                <Check size={16} />{busy ? tr("Saving…") : dialog.kind === "open" ? tr("Open shift") : tr("Close shift")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
