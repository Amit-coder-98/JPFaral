import { useState } from "react";
import { useApp } from "../../app/Provider";
import { Button, Field, Modal } from "../ui";
import { balance } from "../../utils/calculations";
import { money } from "../../utils/format";
import { moneyInPaise } from "../../utils/pricing";
import type { PaymentInput } from "../../types";
export function PaymentDialog({
  orderId,
  onClose,
  onSaved,
}: {
  orderId?: string;
  onClose: () => void;
  onSaved?: (orderId: string) => void;
}) {
  const { data, user, repository, toast } = useApp();
  const [form, setForm] = useState<PaymentInput>({
    orderId: orderId ?? "",
    amount: 0,
    method: "Cash",
    utr: "",
    kind: "receipt",
    requestId: crypto.randomUUID(),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const order = data.orders.find((o) => o.id === form.orderId);
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Record payment"
      description="Record a receipt already received, or an approved refund. Each transaction is saved separately."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          if (
            !order ||
            moneyInPaise(form.amount) === null || form.amount <= 0
          ) {
            setError(
              "Choose an order and a positive amount with up to two decimals.",
            );
            return;
          }
          setBusy(true);
          try {
            await repository.recordPayment(form, user!.id);
            toast("Payment recorded.");
            onClose();
            onSaved?.(form.orderId);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Payment order" required>
          <select
            value={form.orderId}
            disabled={!!orderId}
            onChange={(e) => setForm({ ...form, orderId: e.target.value })}
            required
          >
            <option value="">Select order</option>
            {data.orders
              .filter((o) => o.status !== "Draft")
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} · {o.customerName}
                </option>
              ))}
          </select>
        </Field>
        {order && (
          <div className="info-box">
            Total received: {money(order.advance)} · Outstanding:{" "}
            {money(balance(order))}
          </div>
        )}
        {user?.role === "Super Admin" && (
          <Field label="Transaction type">
            <select
              value={form.kind}
              onChange={(e) =>
                setForm({
                  ...form,
                  kind: e.target.value as PaymentInput["kind"],
                })
              }
            >
              <option value="receipt">Receipt</option>
              <option value="refund">Refund</option>
            </select>
          </Field>
        )}
        <Field label="Payment amount" required hint={form.kind === "refund"
          ? "Enter this refund amount. It is deducted from the total received."
          : "Enter only this payment amount. It is added to the total already received."}>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={
              order
                ? form.kind === "refund"
                  ? order.advance
                  : balance(order)
                : undefined
            }
            value={form.amount || ""}
            onChange={(e) =>
              setForm({ ...form, amount: Number(e.target.value) })
            }
            required
          />
        </Field>
        <Field label="Receipt method">
          <select
            value={form.method}
            onChange={(e) =>
              setForm({
                ...form,
                method: e.target.value as PaymentInput["method"],
              })
            }
          >
            <option>Cash</option>
            <option>Online</option>
          </select>
        </Field>
        {form.method === "Online" && (
          <Field label="Payment reference / UTR" required>
            <input
              value={form.utr}
              maxLength={120}
              onChange={(e) => setForm({ ...form, utr: e.target.value })}
              required
            />
          </Field>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save transaction
          </Button>
        </div>
      </form>
    </Modal>
  );
}
