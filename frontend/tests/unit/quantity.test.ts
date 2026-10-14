import { describe, expect, it } from "vitest";
import {
  convertQuantityText,
  quantityKgFromInput,
  quantityText,
  type QuantityUnit,
} from "../../src/utils/quantity";
import { MAX_QUANTITY_KG } from "../../src/utils/pricing";
import { lineTotal } from "../../src/utils/calculations";
import { quantitySchema } from "../../src/services/validation";

describe("editable kg/g quantity units", () => {
  it.each([
    ["0.25", "kg", 0.25, 110],
    ["250", "g", 0.25, 110],
    ["500", "g", 0.5, 220],
    ["750", "g", 0.75, 330],
    ["1000", "g", 1, 440],
    ["1250", "g", 1.25, 550],
    ["1.5", "kg", 1.5, 660],
    ["10", "kg", 10, 4400],
    ["10000", "g", 10, 4400],
    ["100250", "g", 100.25, 44110],
    ["250.00", "g", 0.25, 110],
    ["2.5e2", "g", 0.25, 110],
    [".25", "kg", 0.25, 110],
    ["9999750", "g", MAX_QUANTITY_KG, 4399890],
  ])("%s %s saves as %s kg and charges ₹%s", (text, unit, expected, amount) => {
    const quantity = quantityKgFromInput(text as string, unit as QuantityUnit);
    expect(quantity).toBe(expected);
    expect(quantitySchema.safeParse(quantity).success).toBe(true);
    expect(lineTotal({ productId: "p1", name: "Test", price: 440, quantity })).toBe(amount);
  });
  it.each([
    ["300", "g"], ["251", "g"], ["0.3", "kg"],
    ["0", "g"], ["0", "kg"], ["-250", "g"], ["-1", "kg"],
    ["", "g"], ["", "kg"], ["invalid", "g"], ["Infinity", "kg"],
    ["NaN", "g"], ["10000000", "g"], ["10000", "kg"],
    ["250.000000000000000001", "g"],
    ["0.250000000000000001", "kg"],
    ["1e10000000", "kg"],
    ["0".repeat(101) + "250", "g"],
    ["0".repeat(101) + "0.25", "kg"],
  ])("rejects invalid %s %s without rounding into a valid quantity", (text, unit) => {
    const quantity = quantityKgFromInput(text, unit as QuantityUnit);
    expect(Number.isNaN(quantity)).toBe(true);
    expect(quantitySchema.safeParse(quantity).success).toBe(false);
  });
  it("switches units without changing the amount or repairing invalid/blank input", () => {
    for (const text of ["0.25", "1.25", "10", "100.25", "9999.75"]) {
      const grams = convertQuantityText(text, "kg", "g");
      expect(convertQuantityText(grams, "g", "kg")).toBe(text);
      expect(quantityKgFromInput(grams, "g")).toBe(quantityKgFromInput(text, "kg"));
    }
    expect(convertQuantityText("0.3", "kg", "g")).toBe("300");
    expect(convertQuantityText("-0.25", "kg", "g")).toBe("-250");
    expect(convertQuantityText("", "kg", "g")).toBe("");
    expect(convertQuantityText("250.000000000000000001", "g", "kg")).toBe("0.250000000000000000001");
    expect(quantityText(0.25, "g")).toBe("250");
    expect(quantityText(NaN, "g")).toBe("");
  });
});
