import { describe, expect, it } from "vitest";
import { seedData, divisions } from "../../src/data/mock";
import {
  balance,
  lineTotal,
  metrics,
  nextOrderNumber,
  orderTotal,
} from "../../src/utils/calculations";
import { MockRepository } from "../../src/services/repository";
import { orderSchema } from "../../src/services/validation";
import { validateImport } from "../../src/services/studentImport";
import { csvText } from "../../src/utils/export";
import { dayKey, latestDate } from "../../src/utils/format";
import type { OrderInput } from "../../src/types";
const validOrder = (): OrderInput => ({
  studentId: "s1",
  customerName: "Demo Customer",
  customerPhone: "0000099999",
  items: [
    { productId: "p1", name: "Besan Laddu", price: 360, quantity: 0.5 },
    { productId: "p2", name: "Chakli", price: 280, quantity: 1 },
  ],
  advance: 100,
  paymentMethod: "Cash",
  utr: "",
  collectionDate: "2026-10-15",
  collectorType: "Student",
  collectorName: "Aarav Deshmukh",
});
describe("Order calculations and consistency", () => {
  it("handles Indian day boundaries and sorts mixed UTC/local timestamps chronologically", () => {
    expect(dayKey("2026-10-10T20:00:00Z")).toBe("2026-10-11");
    expect(
      latestDate(["2026-10-11T11:00:00+05:30", "2026-10-11T07:00:00Z"]),
    ).toBe("2026-10-11T07:00:00Z");
  });
  it("charges exactly half the kilogram price, including paise", () => {
    expect(
      lineTotal({ productId: "p", name: "P", price: 120, quantity: 0.5 }),
    ).toBe(60);
    expect(
      lineTotal({ productId: "p", name: "P", price: 123.5, quantity: 0.5 }),
    ).toBe(61.75);
  });
  it("calculates mixed quantities and the balance accurately", () => {
    expect(orderTotal(validOrder())).toBe(460);
    expect(balance(validOrder())).toBe(360);
  });
  it("seeds 528 unique fictional students across all twelve divisions", () => {
    const d = seedData();
    expect(d.students.length).toBe(528);
    expect(new Set(d.students.map((s) => s.phone)).size).toBe(528);
    Object.entries(divisions).forEach(([standard, list]) =>
      list.forEach((division) =>
        expect(
          d.students.filter(
            (s) => s.standard === standard && s.division === division,
          ).length,
        ).toBe(44),
      ),
    );
  });
  it("reconciles every seeded payment with order advances", () => {
    const d = seedData();
    expect(
      d.logs.filter(
        (log) => log.action === "Created" && log.recordType === "Order",
      ),
    ).toHaveLength(d.orders.length);
    d.orders.forEach((o) => {
      expect(
        d.payments
          .filter((p) => p.orderId === o.id)
          .reduce((s, p) => s + p.amount, 0),
      ).toBe(o.advance);
      expect(balance(o)).toBeGreaterThanOrEqual(0);
    });
    const m = metrics(d.orders, d.payments);
    expect(m.sales).toBe(m.collected + m.pending);
  });
  it("updates orders, payments, dashboard metrics and audit together", () => {
    const r = new MockRepository();
    const before = metrics(r.getSnapshot().orders, r.getSnapshot().payments);
    const order = r.saveOrder(validOrder(), "u2");
    const d = r.getSnapshot();
    expect(d.orders.find((o) => o.id === order.id)).toBeTruthy();
    const after = metrics(d.orders, d.payments);
    expect(after.count).toBe(before.count + 1);
    expect(after.sales).toBe(before.sales + 460);
    expect(after.collected).toBe(before.collected + 100);
    expect(after.pending).toBe(before.pending + 360);
    expect(d.logs[0].recordId).toBe(order.number);
    expect(d.logs[0].userId).toBe("u2");
  });
  it("keeps incomplete drafts out of financial totals and allows resuming", () => {
    const r = new MockRepository();
    const before = metrics(r.getSnapshot().orders, r.getSnapshot().payments);
    const draft = r.saveOrder(
      { ...validOrder(), studentId: "", customerName: "", items: [] },
      "u1",
      "Draft",
    );
    expect(metrics(r.getSnapshot().orders, r.getSnapshot().payments)).toEqual(
      before,
    );
    const saved = r.saveOrder(validOrder(), "u1", "Confirmed", draft.id);
    expect(saved.number).toBe(draft.number);
    expect(
      metrics(r.getSnapshot().orders, r.getSnapshot().payments).count,
    ).toBe(before.count + 1);
  });
  it("generates unique demo numbers without collisions", () => {
    const r = new MockRepository();
    const a = r.saveOrder(validOrder(), "u1");
    const b = r.saveOrder(validOrder(), "u2");
    expect(a.number).not.toBe(b.number);
    expect(nextOrderNumber(r.getSnapshot().orders)).toBe("JP-0089");
  });
  it("retains historical prices after current product prices change", () => {
    const r = new MockRepository();
    const saved = r.saveOrder(validOrder(), "u1");
    r.saveProduct({ ...r.getSnapshot().products[0], price: 999 }, "u1");
    expect(
      orderTotal(r.getSnapshot().orders.find((o) => o.id === saved.id)!),
    ).toBe(460);
    expect(
      r.getSnapshot().orders.find((o) => o.id === saved.id)!.items[0].price,
    ).toBe(360);
  });
  it("replaces an edited advance without double-counting and records before/after", () => {
    const r = new MockRepository();
    const saved = r.saveOrder(validOrder(), "u2");
    r.saveOrder({ ...validOrder(), advance: 150 }, "u1", "Confirmed", saved.id);
    expect(
      r.getSnapshot().payments.filter((p) => p.orderId === saved.id),
    ).toHaveLength(1);
    expect(
      r.getSnapshot().payments.find((p) => p.orderId === saved.id)!.amount,
    ).toBe(150);
    expect(r.getSnapshot().logs[0].changes).toContainEqual({
      field: "advance",
      before: "100",
      after: "150",
    });
  });
});
describe("Validation and imports", () => {
  it("requires UTR only for Online", () => {
    expect(orderSchema.safeParse(validOrder()).success).toBe(true);
    expect(
      orderSchema.safeParse({ ...validOrder(), paymentMethod: "Online" })
        .success,
    ).toBe(false);
    expect(
      orderSchema.safeParse({
        ...validOrder(),
        paymentMethod: "Online",
        utr: "DEMO-123",
      }).success,
    ).toBe(true);
  });
  it("rejects negative or excessive advances, zero quantities, duplicates and over 30 rows", () => {
    expect(
      orderSchema.safeParse({ ...validOrder(), advance: -1 }).success,
    ).toBe(false);
    expect(
      orderSchema.safeParse({ ...validOrder(), advance: 461 }).success,
    ).toBe(false);
    expect(
      orderSchema.safeParse({
        ...validOrder(),
        items: [{ ...validOrder().items[0], quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      orderSchema.safeParse({
        ...validOrder(),
        items: [validOrder().items[0], validOrder().items[0]],
      }).success,
    ).toBe(false);
    const items = Array.from({ length: 30 }, (_, i) => ({
      productId: `p${i}`,
      name: `Product ${i}`,
      price: 10,
      quantity: 1,
    }));
    expect(orderSchema.safeParse({ ...validOrder(), items }).success).toBe(
      true,
    );
    expect(
      orderSchema.safeParse({
        ...validOrder(),
        items: [...items, { ...items[0], productId: "p31" }],
      }).success,
    ).toBe(false);
  });
  it("prevents a failed validation from mutating state", () => {
    const r = new MockRepository();
    const before = r.getSnapshot();
    expect(() =>
      r.saveOrder({ ...validOrder(), advance: 9999 }, "u1"),
    ).toThrow();
    expect(r.getSnapshot()).toBe(before);
  });
  it("validates mapped imports, numeric standards and case-insensitive divisions", () => {
    const result = validateImport(
      [
        {
          Name: "Demo Student",
          Mobile: "0000099999",
          Class: "5",
          Division: "devi padmini",
        },
      ],
      {
        name: "Name",
        phone: "Mobile",
        standard: "Class",
        division: "Division",
      },
      seedData().students,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.valid[0].standard).toBe("5th");
    expect(result.valid[0].division).toBe("Devi Padmini");
  });
  it("flags missing fields, wrong divisions and duplicates against file and existing directory", () => {
    const mapping = {
      name: "name",
      phone: "phone",
      standard: "standard",
      division: "division",
    };
    const row = {
      name: "Demo Student",
      phone: "0000099999",
      standard: "5th",
      division: "Devi Padmini",
    };
    const result = validateImport(
      [
        row,
        row,
        { ...row, phone: "0000000001" },
        { ...row, phone: "invalid", name: "", division: "Kanad" },
      ],
      mapping,
      seedData().students,
    );
    expect(result.valid).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
  });
  it("imports local records and emits an activity event", () => {
    const r = new MockRepository();
    r.importStudents(
      [
        {
          id: "s-new",
          name: "Demo Student",
          phone: "0000099999",
          standard: "5th",
          division: "Devi Padmini",
        },
      ],
      "u1",
    );
    expect(r.getSnapshot().students.length).toBe(529);
    expect(r.getSnapshot().logs[0].action).toBe("Imported");
  });
  it("exports real CSV with escaped quotes, commas, and formula-like fields", () => {
    const csv = csvText(
      ["Name", "Amount"],
      [
        ['A, "B"', 120],
        ["=SUM(1)", 30],
      ],
    );
    expect(csv).toContain('"A, ""B"""');
    expect(csv).toContain('"\'=SUM(1)"');
    expect(csv).toContain('"120"');
  });
});
