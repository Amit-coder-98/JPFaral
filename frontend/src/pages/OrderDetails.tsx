import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Printer,
  PackageCheck,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../app/Provider";
import { PageHeader, Panel, Button, Empty, Modal } from "../components/ui";
import { Bill } from "../components/orders/Bill";
import { dateTime } from "../utils/format";
import { PaymentDialog } from "../components/orders/PaymentDialog";
export default function OrderDetails() {
  const { id } = useParams();
  const { data, user, repository, toast, isMock } = useApp();
  const [collect, setCollect] = useState(false);
  const [payment, setPayment] = useState(false);
  const [busy, setBusy] = useState(false);
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
            {!order.deletedAt && (isMock || order.status !== "Collected") && (
              <Link to={`/orders/${order.id}/edit`} className="button primary">
                <Pencil size={16} />
                Edit order
              </Link>
            )}
            {!order.deletedAt && order.status !== "Draft" && (
              <Button onClick={() => setPayment(true)}>Record payment</Button>
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
          {!order.deletedAt && order.status === "Confirmed" && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await repository.setOrderStatus(order.id, "Ready", user!.id);
                  toast("Order marked ready for collection.");
                } catch (e) {
                  toast((e as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <PackageCheck size={16} />
              Mark ready for collection
            </Button>
          )}
          {!order.deletedAt && order.status === "Ready" && (
            <Button onClick={() => setCollect(true)}>
              <CheckCircle2 size={16} />
              Mark as collected
            </Button>
          )}
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
      <Modal
        open={collect}
        onClose={() => setCollect(false)}
        title="Confirm collection"
        description={`Confirm ${order.number} was handed to ${order.collectorName}.`}
      >
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setCollect(false)}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await repository.setOrderStatus(
                  order.id,
                  "Collected",
                  user!.id,
                );
                setCollect(false);
                toast("Collection recorded.");
              } catch (e) {
                toast((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm collected
          </Button>
        </div>
      </Modal>
      {payment && (
        <PaymentDialog orderId={order.id} onClose={() => setPayment(false)} />
      )}
    </>
  );
}
