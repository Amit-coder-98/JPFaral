import { describe, it, expect } from "vitest";
import { dailyPayments } from "../../src/utils/dailyPayments";
import { cataloguePosition, sortCatalogue } from "../../src/utils/catalogue";
import { ledgerPayments, lineTotal } from "../../src/utils/calculations";
import { products, seedData } from "../../src/data/mock";
import { rateCard } from "../../src/data/rateCard";
import type { Payment } from "../../src/types";

const payment = (amount: number, method: Payment["method"], date: string, kind: Payment["kind"] = "receipt"): Payment =>
  ({ id: crypto.randomUUID(), orderId: "order", amount, method, date, kind, utr: "", receivedBy: "staff" });

describe("client rate-card sequence", () => {
  it("orders all 26 products by the printed sequence without changing input or stored prices", () => {
    const shuffled = [...products].reverse();
    const before = structuredClone(shuffled);
    expect(sortCatalogue(shuffled).map(product => product.name)).toEqual(rateCard.map(product => product.name));
    expect(shuffled).toEqual(before);
    expect(cataloguePosition("भावनागरी शेव")).toBe(15);
    expect(cataloguePosition("चटपटीत चुरचुरे")).toBe(26);
    expect(sortCatalogue([{ name: "Historical product" }, ...shuffled]).at(-1)?.name).toBe("Historical product");
  });
  it("uses the revised 175 rate for new products while old snapshots calculate at 150", () => {
    const product = products.find(product => product.name === "पौष्टिक लाडू (तुपातील)")!;
    expect(product.price).toBe(700);
    expect(lineTotal({ productId: product.id, name: product.name, price: product.price, quantity: 0.25 })).toBe(175);
    expect(lineTotal({ productId: product.id, name: product.name, price: 600, quantity: 0.25 })).toBe(150);
  });
});

describe("daily payment reconciliation", () => {
  it("groups by Indian payment day, keeping midnight boundaries and decimal cents exact", () => {
    expect(dailyPayments([
      payment(0.1, "Cash", "2026-10-20T18:29:59Z"),
      payment(0.2, "Cash", "2026-10-20T18:00:00Z"),
      payment(300, "Online", "2026-10-20T18:30:00Z"),
      payment(200, "Cash", "2026-10-21T10:00:00Z"),
      payment(25, "Cash", "2026-10-21T11:00:00Z", "refund"),
      payment(50, "Online", "2026-10-21T12:00:00Z", "refund"),
    ])).toEqual([
      { id: "2026-10-21", cash: 175, online: 250, receipts: 500, refunds: 75, net: 425, transactions: 4 },
      { id: "2026-10-20", cash: 0.3, online: 0, receipts: 0.3, refunds: 0, net: 0.3, transactions: 2 },
    ]);
  });
  it("keeps refund-only days, excludes deleted test payments through the live ledger and does not truncate", () => {
    const testOrder = { ...seedData().orders[0], id: "test", deletedAt: "2026-10-21", deletionTestData: true };
    const rows = Array.from({ length: 1201 }, () => payment(1, "Cash", "2026-10-21T10:00:00Z"));
    rows.push({ ...payment(500, "Online", "2026-10-21T10:00:00Z"), orderId: "test" });
    rows.push(payment(10, "Online", "2026-10-20T10:00:00Z", "refund"));
    const days = dailyPayments(ledgerPayments(rows, [testOrder]));
    expect(days[0]).toMatchObject({ cash: 1201, online: 0, transactions: 1201 });
    expect(days[1]).toMatchObject({ receipts: 0, refunds: 10, net: -10, online: -10 });
    expect(dailyPayments(ledgerPayments(rows, [testOrder], true))[0].net).toBe(500);
    expect(dailyPayments([])).toEqual([]);
  });
});
