import { useApp } from "../../app/Provider";
import type { Order } from "../../types";
import { Brand } from "../Brand";
import { Badge } from "../ui";
import { date, dateTime, money } from "../../utils/format";
import { balance, lineTotal, orderTotal } from "../../utils/calculations";
import { rateMoney } from "../../utils/pricing";
export function Bill({ order }: { order: Order }) {
  const { data, isMock } = useApp();
  const student =
    order.studentSnapshot ??
    data.students.find((s) => s.id === order.studentId);
  return (
    <article className="bill" id="print-area">
      {order.deletedAt && <div className="info-box deleted-bill-notice">
        <strong>{order.deletionTestData ? "Deleted test order · No real payment received" : "Deleted order · For historical reference"}</strong><br />
        {order.deletionReason} · {dateTime(order.deletedAt)}
      </div>}
      <div className="bill-header">
        <div>
          <Brand />
          <p>
            {data.settings.address}
            <br />
            {data.settings.contact}
          </p>
        </div>
        <div>
          <span className="eyebrow">DIWALI FARAL · 2026</span>
          <h2>{order.number}</h2>
          <Badge tone={order.deletedAt ? "inactive" : undefined}>{order.deletedAt ? "Deleted" : order.status}</Badge>
          <p>Order date: {date(order.createdAt, true)}</p>
        </div>
      </div>
      <div className="bill-people">
        <div>
          <span className="eyebrow">CUSTOMER</span>
          <strong>{order.customerName}</strong>
          <span>{order.customerPhone}</span>
        </div>
        <div>
          <span className="eyebrow">BROUGHT BY STUDENT</span>
          <strong>{student?.name ?? "Not selected"}</strong>
          <span>
            {student?.standard} · {student?.division}
          </span>
        </div>
        <div>
          <span className="eyebrow">COLLECTION</span>
          <strong>{date(order.collectionDate, true)}</strong>
          <span>
            {order.collectorType}: {order.collectorName}
          </span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table bill-table">
          <thead>
            <tr>
              <th>Order Item</th>
              <th>दर पाव किलो</th>
              <th>प्रमाण</th>
              <th className="align-right">किंमत रुपये</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={`${item.productId}-${i}`}>
                <td>
                  <strong>{item.name}</strong>
                </td>
                <td>{rateMoney(item.price)}</td>
                <td>{item.quantity} kg</td>
                <td className="align-right">{money(lineTotal(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bill-bottom">
        <div>
          <h3>Payment details</h3>
          <p>Method: {order.paymentMethod}</p>
          {order.paymentMethod === "Online" && <p>UTR: {order.utr}</p>}
          <span className="muted">{order.deletionTestData ? "Test transactions are retained under Payments → Test history and excluded from live totals." : order.deletedAt ? "Historical transactions are retained in the payment ledger." : "This bill records a payment received."}</span>
        </div>
        <div className="bill-totals">
          <div>
            <span>Subtotal</span>
            <strong>{money(orderTotal(order))}</strong>
          </div>
          <div className="total">
            <span>Total amount</span>
            <strong>{money(orderTotal(order))}</strong>
          </div>
          <div>
            <span>
              {order.deletionTestData ? "Recorded test payments" : isMock ? "Advance received" : "Total received, net of refunds"}
            </span>
            <strong>{money(order.advance)}</strong>
          </div>
          <div className="balance">
            <span>{order.deletedAt ? "Remaining balance (deleted order)" : "Remaining balance"}</span>
            <strong>{money(order.deletedAt ? 0 : balance(order))}</strong>
          </div>
        </div>
      </div>
      <div className="bill-note">
        {order.deletedAt ? "Deleted order. For historical reference only." : "Thank you for bringing a little sweetness to our Diwali."}
        <span>
          {isMock ? "Demo bill · " : ""}
          {dateTime(order.editedAt)}
          {isMock ? " · Frontend prototype" : ""}
        </span>
      </div>
    </article>
  );
}
