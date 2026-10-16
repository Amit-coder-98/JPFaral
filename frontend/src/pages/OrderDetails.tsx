import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Printer,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../app/Provider";
import { PageHeader, Panel, Button, Empty, DataTable } from "../components/ui";
import { Bill } from "../components/orders/Bill";
import { dateTime, money } from "../utils/format";
import { paymentAmount } from "../utils/calculations";
import { CollectionDialog } from "../components/orders/CollectionDialog";
import { PaymentDialog } from "../components/orders/PaymentDialog";
export default function OrderDetails() {
  const { id } = useParams();
  const { data, user, isMock } = useApp();
  const [collect, setCollect] = useState(false);
  const [payment, setPayment] = useState(false);
  const order = [...data.orders, ...(user?.role === "Super Admin" ? data.deletedOrders ?? [] : [])].find((o) => o.id === id);
  if (!order)
    return (
      <Empty
        title="Order not found"
        description="This order is unavailable or you no longer have access."
        action={
          <Link to="/orders" className="button secondary">
            Back to orders
          </Link>
        }
      />
    );
  const logs = data.logs.filter((l) => l.recordId === order.number);
  const name = (id: string) => data.staff.find((s) => s.id === id)?.name ?? "—";
  const receipts = data.payments.filter(payment => payment.orderId === order.id).sort((a,b) => a.date.localeCompare(b.date));
  return (
    <>
      <PageHeader
        eyebrow="ORDER DETAILS"
        title={order.number}
        description={`A celebration for ${order.customerName || "your customer"}.`}
        actions={
          <>
            <Link to="/orders" className="button secondary">
              <ArrowLeft size={16} />
              Orders
            </Link>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} />
              Print bill
            </Button>
            {!order.deletedAt && order.status !== "Collected" && (
              <Link to={`/orders/${order.id}/edit`} className="button secondary">
                <Pencil size={16} />
                Edit order
              </Link>
            )}
            {!order.deletedAt && order.status !== "Draft" && (
              <Button variant="secondary" onClick={() => setPayment(true)}>Record payment</Button>
            )}
            {!order.deletedAt && (order.status === "Confirmed" || order.status === "Ready") && (
              <Button aria-label="Collect order & settle payment" onClick={() => setCollect(true)}><CheckCircle2 size={16} />Collect order</Button>
            )}
          </>
        }
      />
      <Bill order={order} />
      <div className="details-grid">
        <Panel
          title="Order information"
          description="The people and details behind this order."
        >
          <dl className="detail-list">
            <div>
              <dt>Created by</dt>
              <dd>{name(order.createdBy)}</dd>
            </div>
            <div>
              <dt>Created at</dt>
              <dd>{dateTime(order.createdAt)}</dd>
            </div>
            <div>
              <dt>Last edited by</dt>
              <dd>{name(order.editedBy)}</dd>
            </div>
            <div>
              <dt>Last edited at</dt>
              <dd>{dateTime(order.editedAt)}</dd>
            </div>
            <div>
              <dt>Collector</dt>
              <dd>
                {order.collectorName} ({order.collectorType})
              </dd>
            </div>
          </dl>
          {!order.deletedAt && order.status === "Draft" && (
            <Link className="button primary" to={`/orders/${order.id}/edit`}>
              Continue draft
            </Link>
          )}
        </Panel>
        <Panel
          title="Edit history"
          description={
            isMock
              ? "Local audit events for this order."
              : "Changes recorded by the database. Detailed history is available to administrators."
          }
        >
          <div className="audit-history">
            {logs.length ? (
              logs.map((l) => (
                <div key={l.id}>
                  <strong>
                    {name(l.userId)} · {l.action}
                  </strong>
                  <p>{l.summary}</p>
                  {l.changes.map((c, i) => (
                    <p className="change-line" key={i}>
                      <span>{c.field}</span>
                      <del>{c.before}</del>
                      <span>→</span>
                      <strong>{c.after}</strong>
                    </p>
                  ))}
                  <small>{dateTime(l.timestamp)}</small>
                </div>
              ))
            ) : (
              <p className="muted">No visible edits recorded for this order.</p>
            )}
          </div>
        </Panel>
      </div>
      {order.status !== "Draft" && <Panel className="order-payment-history" title="Payment history" description="Advance, collection payments and refunds remain separate transactions.">
        {receipts.length ? <DataTable rows={receipts} pageSize={5} columns={[
          {key:"date",label:"Received at",render:payment=>dateTime(payment.date)},
          {key:"kind",label:"Transaction",render:payment=>payment.kind === "refund" ? "Refund" : "Receipt"},
          {key:"amount",label:"Amount",render:payment=>money(paymentAmount(payment))},
          {key:"method",label:"Method",render:payment=>payment.method},
          {key:"reference",label:"Reference / UTR",render:payment=>payment.utr || "—"},
          {key:"actor",label:"Recorded by",render:payment=>name(payment.receivedBy)},
        ]} /> : <p className="muted">No payments received yet.</p>}
      </Panel>}
      {collect && <CollectionDialog order={order} onClose={() => setCollect(false)} />}
      {payment && (
        <PaymentDialog orderId={order.id} onClose={() => setPayment(false)} />
      )}
    </>
  );
}
