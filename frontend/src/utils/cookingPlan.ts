import type { Order, Product } from "../types";
import { dayKey } from "./format";
import { isValidQuantity } from "./pricing";

export interface CookingFilters {
  basis: "order" | "collection";
  from: string;
  to: string;
  category: "" | Product["category"];
  search: string;
}
export interface CookingOrder {
  id: string;
  number: string;
  collectionDate: string;
  status: Order["status"];
  quantity: number;
}
export interface CookingProduct {
  id: string;
  name: string;
  category: Product["category"] | "Uncategorised";
  orderedKg: number;
  pendingKg: number;
  collectedKg: number;
  orders: CookingOrder[];
  pendingOrders: number;
  breakdown: { quantity: number; orders: number }[];
}
type CookingGroup = { name: string; category: CookingProduct["category"]; orders: Map<string, CookingOrder & { quarters: number }> };
export const kg = (value: number) => `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)} kg`;
export const orderQuantities = (row: CookingProduct) => row.breakdown.map(part => `${part.orders} × ${kg(part.quantity)}`).join(" + ");
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function nextDay(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Order demand only: collection is tracked, prepared stock is not inferred. */
export function cookingPlan(orders: Order[], products: Product[], filters: CookingFilters) {
  const error = (filters.from && !validDay(filters.from)) || (filters.to && !validDay(filters.to))
    ? "Enter valid plan dates."
    : filters.from && filters.to && filters.from > filters.to
      ? "The end date must be on or after the start date." : "";
  const catalogue = new Map(products.map(product => [product.id, product]));
  const grouped = new Map<string, CookingGroup>();
  const issues: { orderId: string; number: string; reason: string }[] = [];
  const search = filters.search.trim().toLocaleLowerCase();
  if (!error) for (const order of orders) {
    if (order.deletedAt || !["Confirmed", "Ready", "Collected"].includes(order.status)) continue;
    const selectedDate = filters.basis === "collection" ? order.collectionDate
      : Number.isFinite(Date.parse(order.createdAt)) ? dayKey(order.createdAt) : "";
    if (!validDay(selectedDate)) {
      issues.push({ orderId: order.id, number: order.number, reason: "Check the order date or collection date." });
      continue;
    }
    if ((filters.from && selectedDate < filters.from) || (filters.to && selectedDate > filters.to)) continue;
    for (const item of order.items) {
      const product = catalogue.get(item.productId);
      const name = product?.name ?? item.name;
      if ((filters.category && product?.category !== filters.category) || (search && !name.toLocaleLowerCase().includes(search))) continue;
      if (!isValidQuantity(item.quantity)) {
        issues.push({ orderId: order.id, number: order.number, reason: `Check the quantity for ${name}.` });
        continue;
      }
      const group: CookingGroup = grouped.get(item.productId) ?? { name, category: product?.category ?? "Uncategorised", orders: new Map() };
      const contribution = group.orders.get(order.id) ?? {
        id: order.id, number: order.number, collectionDate: order.collectionDate,
        status: order.status, quantity: 0, quarters: 0,
      };
      contribution.quarters += item.quantity * 4;
      group.orders.set(order.id, contribution);
      grouped.set(item.productId, group);
    }
  }
  const included = new Set<string>(), pending = new Set<string>();
  let orderedQuarters = 0, collectedQuarters = 0;
  const rows: CookingProduct[] = [...grouped].map(([id, group]) => {
    let total = 0, collected = 0, pendingOrders = 0;
    const sizes = new Map<number, number>();
    const contributions = [...group.orders.values()].map(contribution => {
      total += contribution.quarters;
      included.add(contribution.id);
      if (contribution.status === "Collected") collected += contribution.quarters;
      else {
        pending.add(contribution.id); pendingOrders++;
        sizes.set(contribution.quarters, (sizes.get(contribution.quarters) ?? 0) + 1);
      }
      return { id: contribution.id, number: contribution.number, collectionDate: contribution.collectionDate,
        status: contribution.status, quantity: contribution.quarters / 4 };
    }).sort((a,b) => a.collectionDate.localeCompare(b.collectionDate) || a.number.localeCompare(b.number, undefined, { numeric: true }));
    orderedQuarters += total; collectedQuarters += collected;
    return { id, name: group.name, category: group.category, orderedKg: total / 4, pendingKg: (total - collected) / 4,
      collectedKg: collected / 4, orders: contributions, pendingOrders,
      breakdown: [...sizes].sort(([a],[b]) => a-b).map(([quarters, count]) => ({ quantity: quarters / 4, orders: count })) };
  }).sort((a,b) => b.pendingKg - a.pendingKg || a.name.localeCompare(b.name, "mr") || a.id.localeCompare(b.id));
  return { rows, issues, error, totals: { orders: included.size, pendingOrders: pending.size, orderedKg: orderedQuarters / 4,
    pendingKg: (orderedQuarters - collectedQuarters) / 4, collectedKg: collectedQuarters / 4 } };
}

/** Cook exports contain all filtered pending products, independent of table pagination. */
export function cookSheetCSV(plan: ReturnType<typeof cookingPlan>, filters: CookingFilters) {
  if (plan.error || plan.issues.length) throw new Error("Review the plan issues before exporting a cook sheet.");
  return {
    headers: ["Date basis", "From", "To", "Category", "Product", "Required kg (awaiting collection)", "Pending orders", "Order quantities"],
    rows: plan.rows.filter(row => row.pendingKg > 0).map(row => [
      filters.basis === "order" ? "Order date" : "Collection date", filters.from || "Any", filters.to || "Any",
      row.category, row.name, row.pendingKg, row.pendingOrders, orderQuantities(row),
    ]),
  };
}
