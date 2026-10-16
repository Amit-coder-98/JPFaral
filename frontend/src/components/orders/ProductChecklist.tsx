import { useEffect, useState } from "react";
import type { Order, OrderItem, Product } from "../../types";
import { QuantityInput } from "./QuantityInput";
import { lineTotal } from "../../utils/calculations";
import { rateMoney } from "../../utils/pricing";
import { money } from "../../utils/format";

export function ProductChecklist({ products, items, original, errors, onChange }: {
  products: Product[]; items: OrderItem[]; original?: Order;
  errors: Record<string, string>; onChange: (items: OrderItem[]) => void;
}) {
  const [search, setSearch] = useState("");
  useEffect(() => { if (Object.keys(errors).some(key => key.startsWith("items"))) setSearch(""); }, [errors]);
  const selected = items.filter(item => item.productId);
  const catalogue = products.filter(product => (product.available || selected.some(item => item.productId === product.id)) &&
    product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <>
    <div className="catalogue-selection-tools">
      <input aria-label="Search order products" type="search" placeholder="Search items / पदार्थ शोधा" value={search}
        onChange={event => setSearch(event.target.value)} />
      <span aria-live="polite">{selected.length} / 30 items selected</span>
    </div>
    <div className="table-scroll product-checklist" tabIndex={0} aria-label="Product selection list">
      <table className="data-table order-items">
        <thead><tr><th>Select item</th><th>दर पाव किलो</th><th>प्रमाण (kg)</th><th className="align-right">किंमत रुपये</th></tr></thead>
        <tbody>{catalogue.map((product, catalogueIndex) => {
          const index = selected.findIndex(item => item.productId === product.id);
          const item = selected[index];
          const historical = original?.status !== "Draft" ? original?.items.find(row => row.productId === product.id) : undefined;
          const price = item?.price ?? historical?.price ?? product.price;
          return <tr key={product.id} data-product-id={product.id} className={item ? "item-selected" : "item-unselected"}>
            <td data-label="Select item"><label className="product-checkbox-label">
              <input type="checkbox" aria-label={`Select ${product.name}`} checked={!!item}
                disabled={!item && (!product.available || selected.length >= 30)}
                onChange={event => onChange(event.target.checked
                  ? [...selected, { productId: product.id, name: historical?.name ?? product.name, price, quantity: 0.25 }]
                  : selected.filter(row => row.productId !== product.id))} />
              <span>{item?.name ?? product.name}{!product.available && <small>Unavailable · existing item</small>}</span>
            </label></td>
            <td data-label="दर पाव किलो">{rateMoney(price)}<small className="per-unit">दर पाव किलो (250 ग्रॅम)</small></td>
            <td data-label="प्रमाण"><QuantityInput index={catalogueIndex} label={`Quantity for ${product.name} (kg)`}
              quantity={item?.quantity ?? 0.25} disabled={!item} error={errors[`items.${index}.quantity`]}
              onChange={quantity => onChange(selected.map(row => row.productId === product.id ? { ...row, quantity } : row))} /></td>
            <td className="align-right" data-label="किंमत रुपये"><strong>{item ? money(lineTotal(item)) : "—"}</strong></td>
          </tr>;
        })}</tbody>
      </table>
      {!catalogue.length && <p className="muted">No matching products.</p>}
    </div>
    {errors.items && <p className="field-error" role="alert">{errors.items}</p>}
  </>;
}
