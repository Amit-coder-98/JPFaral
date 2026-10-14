import { describe, it, expect } from "vitest";
import { rateCard } from "../../src/data/rateCard";
import {
  pricePerKgFrom250g,
  ratePer250g,
  rateMoney,
  MAX_QUANTITY_KG,
} from "../../src/utils/pricing";
import { lineTotal, orderTotal, balance } from "../../src/utils/calculations";
import { quantitySchema, orderSchema } from "../../src/services/validation";
import { MockRepository } from "../../src/services/mockRepository";

const item = (quantity: number, price = 440) => ({
  productId: "p1",
  name: "मोतीचूर लाडू",
  price,
  quantity,
});
const order = (quantity: number) => ({
  studentId: "s1",
  customerName: "Customer",
  customerPhone: "9876543210",
  items: [item(quantity)],
  advance: 0,
  paymentMethod: "Cash" as const,
  utr: "",
  collectionDate: "2026-10-20",
  collectorType: "Student" as const,
  collectorName: "Student",
});
describe("client 250g pricing", () => {
  it.each([
    [0.25, 110],
    [0.5, 220],
    [0.75, 330],
    [1, 440],
    [1.25, 550],
    [1.5, 660],
    [5, 2200],
    [10, 4400],
    [100.25, 44110],
    [MAX_QUANTITY_KG, 4399890],
  ])("charges quantity %s kg as ₹%s at ₹110 per 250g", (quantity, total) => {
    expect(quantitySchema.safeParse(quantity).success).toBe(true);
    expect(lineTotal(item(quantity))).toBe(total);
    expect(orderSchema.safeParse(order(quantity)).success).toBe(true);
  });
  it.each([
    0,
    -0.25,
    0.3,
    0.251,
    10000,
    NaN,
    Infinity,
    -Infinity,
    "",
    undefined,
    "invalid",
  ])("rejects invalid quantity %s before an order is saved", (quantity) => {
    expect(quantitySchema.safeParse(quantity).success).toBe(false);
    expect(orderSchema.safeParse(order(quantity as number)).success).toBe(
      false,
    );
  });
  it("converts entered quarter-kilogram rates to canonical kg prices without losing paise", () => {
    expect(pricePerKgFrom250g(110)).toBe(440);
    expect(pricePerKgFrom250g(110.25)).toBe(441);
    expect(ratePer250g(440)).toBe(110);
    expect(rateMoney(440)).toBe("₹110.00");
    for (const rate of [0, -1, NaN, Infinity, 110.001, 250000.01])
      expect(() => pricePerKgFrom250g(rate)).toThrow();
  });
  it("rounds legacy snapshot lines like NUMERIC without rounding their displayed unit rates", () => {
    expect(rateMoney(123.5)).toBe("₹30.875");
    expect(rateMoney(0.29)).toBe("₹0.0725");
    expect(lineTotal(item(0.25, 123.5))).toBe(30.88);
    expect(lineTotal(item(0.5, 123.5))).toBe(61.75);
    expect(lineTotal(item(0.75, 0.29))).toBe(0.22);
    expect(orderTotal({ items: [item(0.25, 123.5), item(0.5, 123.5)] })).toBe(
      92.63,
    );
    expect(
      balance({ items: [item(0.25, 123.5), item(0.5, 123.5)], advance: 20 }),
    ).toBe(72.63);
  });
  it("guards total storage capacity independently of the number of rows", () => {
    const input = {
      ...order(MAX_QUANTITY_KG),
      items: [
        item(MAX_QUANTITY_KG, 1000000),
        { ...item(MAX_QUANTITY_KG, 1000000), productId: "p2" },
      ],
    };
    expect(orderSchema.safeParse(input).success).toBe(false);
  });
  it("preview catalogue contains only the 26 supplied Marathi products and their 250g rates", () => {
    const products = new MockRepository().getSnapshot().products;
    expect(products).toHaveLength(26);
    expect(new Set(products.map((p) => p.name)).size).toBe(26);
    expect(products[0].name).toBe("मोतीचूर लाडू");
    expect(products[0].price).toBe(440);
    expect(products[1].name).toBe("बेसन लाडू (तुपातील)");
    expect(products[1].price).toBe(660);
    rateCard.forEach((r) =>
      expect(ratePer250g(products.find((p) => p.name === r.name)!.price)).toBe(
        r.ratePer250g,
      ),
    );
  });
  it("invalid numeric quantities never produce NaN in preview totals or save as drafts", () => {
    const repo = new MockRepository();
    for (const quantity of [0, 0.3, NaN, Infinity, -1]) {
      expect(Number.isFinite(orderTotal({ items: [item(quantity)] }))).toBe(
        true,
      );
      expect(() => repo.saveOrder(order(quantity), "u1", "Draft")).toThrow();
    }
  });
});
