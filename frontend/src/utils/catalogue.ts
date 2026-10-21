import { rateCard } from "../data/rateCard";

// The approved printed sequence. Prices still come from live or historical data.
const positions = new Map(rateCard.map((product, index) => [product.name, index + 1]));
export const cataloguePosition = (name: string) => positions.get(name);
export function compareCatalogue(a: { name: string }, b: { name: string }) {
  return (positions.get(a.name) ?? Infinity) - (positions.get(b.name) ?? Infinity) ||
    a.name.localeCompare(b.name, "mr");
}
export function sortCatalogue<T extends { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(compareCatalogue);
}
