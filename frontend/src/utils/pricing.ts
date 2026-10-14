// Match existing numeric(6,2) quantity and numeric(12,2) order-total capacity.
export const MAX_QUANTITY_KG = 9999.75;
export const MAX_ORDER_TOTAL = 9_999_999_999.99;
export const QUANTITY_MESSAGE =
  "प्रमाण शून्यापेक्षा जास्त आणि 250 ग्रॅम (0.25 kg) च्या पटीत असावे.";
export const isValidQuantity = (quantity: number) =>
  Number.isFinite(quantity) &&
  quantity > 0 &&
  quantity <= MAX_QUANTITY_KG &&
  Number.isInteger(quantity * 4);
export const ratePer250g = (pricePerKg: number) => pricePerKg / 4;
export function pricePerKgFrom250g(rate: number) {
  const paise = Math.round(rate * 100);
  if (
    !Number.isFinite(rate) ||
    rate <= 0 ||
    rate > 250000 ||
    Math.abs(rate * 100 - paise) > 0.00001
  )
    throw new Error(
      "दर पाव किलो शून्यापेक्षा जास्त, दोन दशांशांपर्यंत व ₹2,50,000 पर्यंत असावा.",
    );
  return (paise * 4) / 100;
}
// Legacy per-kg snapshots may convert to fractional paise. Show the exact rate
// rather than changing the historical amount by rounding its displayed unit.
export const rateMoney = (pricePerKg: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(ratePer250g(pricePerKg));
