import { describe, expect, it } from "vitest";
import { seedData } from "../../src/data/mock";
import { cookingPlan, cookSheetCSV, nextDay, orderQuantities, type CookingFilters } from "../../src/utils/cookingPlan";
import type { Order, OrderItem } from "../../src/types";

const data = seedData();
const products = [data.products[0], data.products[15]];
const filters: CookingFilters = { basis: "order", from: "2026-10-18", to: "2026-10-18", category: "", search: "" };
const item = (quantity: number, productId = "p1"): OrderItem => ({ productId, name: products.find(product => product.id === productId)?.name ?? "Historical item", price: 440, quantity });
const order = (items: OrderItem[], overrides: Partial<Order> = {}): Order => ({ ...data.orders[0], id: crypto.randomUUID(), number: "JP-0001",
  status: "Confirmed", createdAt: "2026-10-18T12:00:00+05:30", collectionDate: "2026-10-19", items, ...overrides });

describe("order-based cooking demand", () => {
  it("totals the client's ten-order example to 10 kg laddu and 20 kg barik shev without double-counting orders", () => {
    const plan = cookingPlan(Array.from({ length: 10 }, () => order([item(1), item(2, "p16")])), products, filters);
    expect(plan.totals).toEqual({ orders: 10, pendingOrders: 10, orderedKg: 30, pendingKg: 30, collectedKg: 0 });
    expect(plan.rows.find(row => row.id === "p1")).toMatchObject({ name: "मोतीचूर लाडू", pendingKg: 10, pendingOrders: 10 });
    expect(plan.rows.find(row => row.id === "p16")).toMatchObject({ name: "बारीक शेव", pendingKg: 20, pendingOrders: 10 });
  });
  it("sums quarter-kg and large quantities exactly using integer quarter units", () => {
    const plan = cookingPlan([0.25, 0.5, 0.75, 1, 10, 9999.75].map(quantity => order([item(quantity)])), products, filters);
    expect(plan.totals.pendingKg).toBe(10012.25);
    expect(plan.rows[0].pendingKg).toBe(10012.25);
  });
  it("excludes drafts and archives and separates collected demand from confirmed and legacy Ready orders", () => {
    const plan = cookingPlan([
      order([item(0.25)]), order([item(0.5)], { status: "Ready" }), order([item(0.75)], { status: "Collected" }),
      order([item(100)], { status: "Draft" }), order([item(200)], { deletedAt: "2026-10-18" }),
    ], products, filters);
    expect(plan.totals).toEqual({ orders: 3, pendingOrders: 2, orderedKg: 1.5, pendingKg: 0.75, collectedKg: 0.75 });
    expect(plan.rows[0].breakdown).toEqual([{ quantity: 0.25, orders: 1 }, { quantity: 0.5, orders: 1 }]);
  });
  it("uses Indian order dates across midnight and independently selects saved collection dates", () => {
    const before = order([item(1)], { createdAt: "2026-10-17T18:29:59Z", collectionDate: "2026-10-18" });
    const after = order([item(2)], { createdAt: "2026-10-17T18:30:00Z", collectionDate: "2026-10-19" });
    expect(cookingPlan([before, after], products, filters).totals.pendingKg).toBe(2);
    expect(cookingPlan([before, after], products, { ...filters, basis: "collection" }).totals.pendingKg).toBe(1);
    expect(cookingPlan([before, after], products, { ...filters, from: "2026-10-17" }).totals.pendingKg).toBe(3);
  });
  it("keeps inactive and missing catalogue items, groups by identity, and uses the current Marathi catalogue name", () => {
    const rows = cookingPlan([order([item(1), item(2, "p16"), { ...item(0.25, "legacy"), name: "Historical item" }])],
      products.map(product => ({ ...product, available: false })), filters).rows;
    expect(rows).toHaveLength(3);
    expect(rows.find(row => row.id === "p1")).toMatchObject({ name: "मोतीचूर लाडू", pendingKg: 1 });
    expect(rows.find(row => row.id === "legacy")).toMatchObject({ name: "Historical item", category: "Uncategorised", pendingKg: 0.25 });
    const sameName = cookingPlan([order([item(1), item(2, "p16")])], [{ ...products[0] }, { ...products[1], name: products[0].name }], filters);
    expect(sameName.rows).toHaveLength(2);
  });
  it("filters products and categories consistently in the totals, and counts each contributing order once", () => {
    const orders = [order([item(0.25), item(0.25), item(2, "p16")]), order([item(1)])];
    const plan = cookingPlan(orders, products, { ...filters, search: " लाडू ", category: "Sweet" });
    expect(plan.totals.pendingKg).toBe(1.5); expect(plan.totals.orders).toBe(2);
    expect(plan.rows[0].orders[0].quantity).toBe(0.5);
    expect(orderQuantities(plan.rows[0])).toBe("1 × 0.5 kg + 1 × 1 kg");
    expect(cookingPlan(orders, products, { ...filters, category: "Savoury" }).totals.pendingKg).toBe(2);
  });
  it("does not merge archived and new orders that reuse a receipt number", () => {
    const current = order([item(1)]), archived = order([item(10)], { deletedAt: "2026-10-18" });
    const plan = cookingPlan([archived, current], products, filters);
    expect(plan.rows[0].orders.map(order => order.id)).toEqual([current.id]);
    expect(plan.totals.pendingKg).toBe(1);
  });
  it("refuses incomplete export for invalid quantities or invalid date ranges", () => {
    const plan = cookingPlan([order([item(0.3), item(0), item(-1), item(NaN), item(Infinity), item(0.25, "p16")])], products, filters);
    expect(plan.issues).toHaveLength(5); expect(plan.totals.pendingKg).toBe(0.25);
    expect(() => cookSheetCSV(plan, filters)).toThrow("Review");
    for (const invalid of [{ ...filters, to: "2026-10-17" }, { ...filters, from: "2026-02-30" }]) {
      const plan = cookingPlan([order([item(1)])], products, invalid);
      expect(plan.error).toBeTruthy(); expect(plan.rows).toHaveLength(0);
      expect(() => cookSheetCSV(plan, invalid)).toThrow("Review");
    }
  });
  it("exports all pending products beyond a table page, with date context and without customer, student or payment data", () => {
    const orders = [order(data.products.slice(0, 25).map(product => item(0.25, product.id)), { customerName: "Private customer", customerPhone: "9876543210" }),
      order([item(0.5, data.products[25].id)], { status: "Collected" })];
    const plan = cookingPlan(orders, data.products, filters), csv = cookSheetCSV(plan, filters);
    expect(csv.rows).toHaveLength(25); expect(plan.rows).toHaveLength(26);
    expect(csv.rows[0].slice(0, 3)).toEqual(["Order date", "2026-10-18", "2026-10-18"]);
    expect(JSON.stringify(csv)).not.toMatch(/Private customer|9876543210|Customer|Payment|Student/);
    expect(csv.rows.reduce((sum, row) => sum + Number(row[5]), 0)).toBe(6.25);
  });
  it("advances tomorrow across month, leap-day and year boundaries", () => {
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
