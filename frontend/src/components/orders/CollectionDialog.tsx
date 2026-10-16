import { useState } from "react";
import { useApp } from "../../app/Provider";
import { Button, Field, Modal } from "../ui";
import { balance, orderTotal } from "../../utils/calculations";
import { money } from "../../utils/format";
import { moneyInPaise } from "../../utils/pricing";
import type { CollectionInput, Order } from "../../types";

export function CollectionDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { repository, user, toast } = useApp();
  const due = balance(order);
  const [form, setForm] = useState<CollectionInput>(() => ({ orderId: order.id, version: order.version ?? 1,
    amount: due, method: "Cash", utr: "", requestId: crypto.randomUUID() }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountPaise = moneyInPaise(form.amount);
  const remaining = amountPaise === null ? NaN : (Math.round(due * 100) - amountPaise) / 100;
  return <Modal open title="Collect order & settle payment" description={`Hand over ${order.number} to ${order.collectorName}.`}
    onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={async event => {
      event.preventDefault(); setError("");
      if (amountPaise === null || amountPaise !== moneyInPaise(due)) {
        setError("Receive the exact outstanding balance before collection. Use Record payment for a partial receipt."); return;
      }
      if (due > 0 && form.method === "Online" && !form.utr.trim()) { setError("Enter the online payment reference / UTR."); return; }
      setBusy(true);
      try { await repository.collectOrder(form, user!.id); toast("Payment and collection recorded."); onClose(); }
      catch (failure) { setError((failure as Error).message); }
      finally { setBusy(false); }
    }}>
      <dl className="detail-list collection-payment-summary">
        <div><dt>Order total</dt><dd>{money(orderTotal(order))}</dd></div>
        <div><dt>Already received / advance</dt><dd>{money(order.advance)}</dd></div>
        <div><dt>Balance to receive now</dt><dd>{money(due)}</dd></div>
      </dl>
      {due > 0 ? <>
        <Field label="Amount received now" required><input type="number" min="0" max={due} step="0.01" required
          value={Number.isNaN(form.amount) ? "" : form.amount} onChange={event => setForm({ ...form, amount: event.target.value === "" ? NaN : Number(event.target.value) })} /></Field>
        <Field label="Collection payment method"><select value={form.method} onChange={event => setForm({ ...form, method: event.target.value as CollectionInput["method"] })}><option>Cash</option><option>Online</option></select></Field>
        {form.method === "Online" && <Field label="Collection payment reference / UTR" required><input required maxLength={120} value={form.utr} onChange={event => setForm({ ...form, utr: event.target.value })} /></Field>}
      </> : <p className="info-box">This order is fully paid. Confirm handover without recording another payment.</p>}
      <div className="remaining-balance"><span>Balance after this payment</span><strong>{Number.isFinite(remaining) ? money(remaining) : "—"}</strong></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={busy}>{due > 0 ? "Receive balance & collect" : "Confirm collected"}</Button></div>
    </form>
  </Modal>;
}
