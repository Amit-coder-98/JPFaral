import type { Order, OrderItem, Payment } from "../types";
import { dayKey, today } from "./format";
import { isValidQuantity } from "./pricing";
export const lineTotal = (item: OrderItem) => {
  if (
    !isValidQuantity(item.quantity) ||
    !Number.isFinite(item.price) ||
    item.price <= 0
  )
    return 0;
  // Integer paise × integer quarter-kilogram units, rounded half up like NUMERIC.
  return (
    Math.floor((Math.round(item.price * 100) * (item.quantity * 4) + 2) / 4) /
    100
  );
};
export const paymentAmount = (payment: Payment) =>
  payment.kind === "refund" ? -payment.amount : payment.amount;
/** Keep archived test transactions accessible without mixing them into real receipts. */
export function ledgerPayments(payments: Payment[], archivedOrders: Order[], testHistory = false) {
  const testIds = new Set(archivedOrders.filter((order) => order.deletedAt && order.deletionTestData).map((order) => order.id));
  return payments.filter((payment) => testIds.has(payment.orderId) === testHistory);
}
export const orderTotal = (order: Pick<Order, "items">) =>
  order.items.reduce(
    (sum, item) => sum + Math.round(lineTotal(item) * 100),
    0,
  ) / 100;
export const balance = (order: Pick<Order, "items" | "advance">) =>
  Math.round((orderTotal(order) - order.advance) * 100) / 100;
/** Display positions only; saved receipt numbers are assigned independently. */
export function activeOrderSerials(orders: Order[]) {
  return new Map([...orders].filter(order => !order.deletedAt)
    .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.number.localeCompare(b.number, undefined, {numeric:true}) || a.id.localeCompare(b.id))
    .map((order,index) => [order.id,index + 1]));
}
export function metrics(orders: Order[], payments: Payment[]) {
  const confirmed = orders.filter((o) => !o.deletedAt && o.status !== "Draft");
  const ids = new Set(confirmed.map((o) => o.id));
  const sales = confirmed.reduce((sum, o) => sum + orderTotal(o), 0);
  const collected = payments
    .filter((p) => ids.has(p.orderId))
    .reduce((sum, p) => sum + (p.kind === "refund" ? -p.amount : p.amount), 0);
  return {
    count: confirmed.length,
    sales,
    collected,
    pending: sales - collected,
    today: confirmed.filter((o) => dayKey(o.createdAt) === today()).length,
    awaiting: confirmed.filter((o) => o.status !== "Collected").length,
  };
}
// Demo numbering is collision-free within this repository only. Production numbering MUST
// be generated transactionally by the backend/database, never by a browser.
export function nextOrderNumber(orders: Order[]) {
  return `JP-${String(Math.max(0, ...orders.map((o) => Number((o.reference ?? o.number).replace("JP-", "")) || 0)) + 1).padStart(4, "0")}`;
}
/** Mock preview only; PostgreSQL assigns production receipts under a transaction lock. */
export function nextReceiptNumber(orders: Order[]) {
  const used = new Set(orders.filter(order => !order.deletedAt).map(order => order.number));
  let slot = 1;
  while (used.has(`JP-${String(slot).padStart(4, "0")}`)) slot++;
  return `JP-${String(slot).padStart(4, "0")}`;
}
