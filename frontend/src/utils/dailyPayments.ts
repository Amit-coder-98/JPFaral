import type { Payment } from "../types";
import { dayKey } from "./format";
import { moneyInPaise } from "./pricing";

export interface PaymentDay {
  id: string;
  cash: number;
  online: number;
  receipts: number;
  refunds: number;
  net: number;
  transactions: number;
}
/** Payment date in India, independent of the date the order was placed. */
export function dailyPayments(payments: readonly Payment[]): PaymentDay[] {
  const days = new Map<string, PaymentDay>();
  for (const payment of payments) {
    const amount = moneyInPaise(payment.amount);
    if (amount === null || !Number.isFinite(Date.parse(payment.date))) throw new Error("Invalid payment data. Refresh records before reporting totals.");
    const id = dayKey(payment.date);
    const row = days.get(id) ?? { id, cash: 0, online: 0, receipts: 0, refunds: 0, net: 0, transactions: 0 };
    const refund = payment.kind === "refund";
    const signed = refund ? -amount : amount;
    row[payment.method === "Cash" ? "cash" : "online"] += signed;
    row[refund ? "refunds" : "receipts"] += amount;
    row.net += signed;
    row.transactions++;
    days.set(id, row);
  }
  return [...days.values()].sort((a,b) => b.id.localeCompare(a.id)).map(row => ({ ...row,
    cash: row.cash / 100, online: row.online / 100, receipts: row.receipts / 100, refunds: row.refunds / 100, net: row.net / 100 }));
}
