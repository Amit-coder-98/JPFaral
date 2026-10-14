import { MAX_QUANTITY_KG } from "./pricing";

export type QuantityUnit = "kg" | "g";

// Shift decimal text rather than multiplying floating-point input. In particular,
// a tiny invalid fraction must never round into an apparently valid 250g step.
export function convertQuantityText(
  value: string,
  from: QuantityUnit,
  to: QuantityUnit,
) {
  const text = value.trim();
  if (!text || text.length > 100) return text;
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || !(match[2] + (match[3] ?? ""))) return text;
  const exponent = Number(match[4] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 30) return text;
  const digits = match[2] + (match[3] ?? "");
  const point =
    match[2].length + exponent + (from === to ? 0 : from === "kg" ? 3 : -3);
  const whole = point <= 0 ? "0" : digits.slice(0, point).padEnd(point, "0");
  const fraction =
    point < 0 ? "0".repeat(-point) + digits : digits.slice(point);
  const integer = whole.replace(/^0+(?=\d)/, "") || "0";
  const decimal = fraction.replace(/0+$/, "");
  return `${match[1] === "-" ? "-" : ""}${integer}${decimal ? `.${decimal}` : ""}`;
}

export function quantityKgFromInput(value: string, unit: QuantityUnit) {
  if (value.trim().length > 100) return NaN;
  const text = convertQuantityText(value, unit, "kg");
  if (!/^\d+(?:\.\d+)?$/.test(text) || text.length > 140) return NaN;
  const [whole, fraction = ""] = text.split(".");
  const numerator = BigInt(whole + fraction) * 4n;
  const denominator = 10n ** BigInt(fraction.length);
  if (numerator % denominator !== 0n) return NaN;
  const quarters = numerator / denominator;
  if (quarters <= 0n || quarters > BigInt(MAX_QUANTITY_KG * 4)) return NaN;
  return Number(quarters) / 4;
}

export const quantityText = (quantityKg: number, unit: QuantityUnit) =>
  Number.isFinite(quantityKg)
    ? convertQuantityText(String(quantityKg), "kg", unit)
    : "";
