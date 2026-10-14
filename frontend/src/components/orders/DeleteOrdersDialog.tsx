import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useApp } from "../../app/Provider";
import { Button, Field, Modal } from "../ui";
import { money } from "../../utils/format";
import { orderTotal } from "../../utils/calculations";
import type { Order } from "../../types";
import { orderDeletionBlock } from "../../utils/orderDeletion";

export function DeleteOrdersDialog({ orders, onClose, onDeleted }: {
  orders: Order[]; onClose: () => void; onDeleted: () => void;
}) {
  const { user, repository, toast } = useApp();
  const [reason, setReason] = useState("");
  const [allowCollected, setAllowCollected] = useState(false);
  const [testCleanup, setTestCleanup] = useState(false);
  const needsOverride = orders.some((order) => order.status === "Collected");
  const hasPayments = orders.some((order) => order.advance > 0);
  const [requestId] = useState(() => crypto.randomUUID());
  const [targets] = useState(() => orders.map((order) => ({ id: order.id, version: order.version ?? 1 })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blocked = orders.map((order) => orderDeletionBlock(order, true, testCleanup)).find(Boolean);
  const confirmed = !needsOverride || allowCollected || testCleanup;
  if (user?.role !== "Super Admin") return null;
  return <Modal open onClose={() => { if (!busy) onClose(); }}
    title={orders.length === 1 ? `Delete ${orders[0].number}?` : `Delete ${orders.length} selected orders?`}
    description="Check the selected orders before confirming.">
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (busy || blocked || !confirmed) return;
      setBusy(true); setError("");
      try {
        await repository.deleteOrders({ orders: targets, reason, requestId, allowCollected: needsOverride && (allowCollected || testCleanup), testCleanup }, user.id);
        toast(`${orders.length} ${orders.length === 1 ? "order deleted" : "orders deleted"}.`);
        onDeleted();
      } catch (failure) { setError((failure as Error).message); }
      finally { setBusy(false); }
    }}>
      <div className="info-box">These orders will leave active lists, sales totals and outstanding balances. Bills, payment records and audit history are retained.</div>
      <ul className="deletion-preview">{orders.map((order) => <li key={order.id}>
        <div><strong>{order.number}</strong><span>{order.customerName || "Draft customer"} · {order.status}{order.advance > 0 ? ` · Recorded payments ${money(order.advance)}` : ""}</span></div>
        <strong>{money(orderTotal(order))}</strong>
      </li>)}</ul>
      {hasPayments && !testCleanup && <div className="info-box" role="alert">Refund received payments before deleting a real order. If these are only test entries and no real money was received, confirm test cleanup below.</div>}
      {!hasPayments && blocked && <div className="info-box" role="alert">{blocked}</div>}
      <Field label="Reason for deletion" required hint="For example: test order, duplicate entry, or an order entered by mistake.">
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} rows={3} disabled={busy} />
      </Field>
      <label className="checkbox-label">
        <input type="checkbox" checked={testCleanup} disabled={busy} onChange={(event) => setTestCleanup(event.target.checked)} />
        These are test entries only; no real money was received.
      </label>
      {testCleanup && <p className="muted">Recorded test payments will be excluded from live totals and retained under Payments → Test history. No refund transaction will be created.</p>}
      {!hasPayments && needsOverride && !testCleanup && <label className="checkbox-label">
        <input type="checkbox" checked={allowCollected} disabled={busy} onChange={(event) => setAllowCollected(event.target.checked)} />
        I confirm these collected orders are test or mistaken entries and should be removed.
      </label>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        {blocked && <Link className="button secondary" to={`/orders/${orders.find((order) => orderDeletionBlock(order, true, testCleanup))?.id ?? orders[0].id}`}>Review order</Link>}
        <Button type="submit" variant="danger" loading={busy} disabled={!!blocked || reason.trim().length < 3 || !confirmed}>
          <Trash2 size={16} />{orders.length === 1 ? "Confirm delete" : `Delete ${orders.length} orders`}
        </Button>
      </div>
    </form>
  </Modal>;
}
