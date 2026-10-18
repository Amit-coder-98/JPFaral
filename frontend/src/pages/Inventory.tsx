import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChefHat, ClipboardList, Download, PackageCheck, Printer, Scale } from "lucide-react";
import { useApp } from "../app/Provider";
import { Badge, Button, DataTable, Empty, Field, Modal, PageHeader, Panel, SearchInput } from "../components/ui";
import { cookingPlan, cookSheetCSV, kg, nextDay, orderQuantities, type CookingFilters } from "../utils/cookingPlan";
import { date, dateTime, now, today } from "../utils/format";
import { downloadCSV } from "../utils/export";

export default function Inventory() {
  const { data } = useApp();
  const [filters, setFilters] = useState<CookingFilters>(() => ({ basis: "order", from: today(), to: today(), category: "", search: "" }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const plan = useMemo(() => cookingPlan(data.orders, data.products, filters), [data.orders, data.products, filters]);
  const selected = plan.rows.find(row => row.id === selectedId);
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);
  const pending = plan.rows.filter(row => row.pendingKg > 0);
  const canShare = !plan.error && !plan.issues.length && pending.length > 0;
  const range = plan.error ? "Check selected dates" : filters.from && filters.to && filters.from === filters.to ? date(filters.from, true)
    : `${filters.from ? date(filters.from, true) : "Any start date"} – ${filters.to ? date(filters.to, true) : "Any end date"}`;
  const basis = filters.basis === "order" ? "Orders placed" : "Collection dates";
  const quickDate = (basis: CookingFilters["basis"], day: string) => setFilters({ ...filters, basis, from: day, to: day });
  const exportPlan = () => {
    const csv = cookSheetCSV(plan, filters);
    downloadCSV(`JPfaral-cook-sheet-${filters.from || "all"}-${filters.to || "dates"}.csv`, csv.headers, csv.rows);
  };
  return <>
    <div className="inventory-screen">
      <PageHeader eyebrow="FRESH BATCH PLANNING" title="Inventory & cooking plan"
        description="Group today’s orders by product, or choose collection dates for the day’s fresh cooking."
        actions={<><Button variant="secondary" disabled={!canShare} onClick={() => window.print()}><Printer size={16} />Print cook sheet</Button>
          <Button disabled={!canShare} onClick={exportPlan}><Download size={16} />Export kitchen CSV</Button></>} />
      <Panel className="inventory-filters">
        <div className="inventory-filter-toolbar"><div className="inventory-shortcuts" aria-label="Cooking plan shortcuts">
          <Button variant="secondary" onClick={() => quickDate("order", today())}>Today’s orders</Button>
          <Button variant="secondary" onClick={() => quickDate("collection", today())}>Due today</Button>
          <Button variant="secondary" onClick={() => quickDate("collection", nextDay(today()))}>Due tomorrow</Button>
          <Button variant="ghost" onClick={() => setFilters({ basis: "order", from: today(), to: today(), category: "", search: "" })}>Reset filters</Button>
        </div><div className="inventory-product-search"><SearchInput label="Search cooking products" placeholder="Search Marathi product name…" value={filters.search} onChange={search => setFilters({ ...filters, search })} /></div></div>
        <div className="inventory-filter-grid">
          <Field label="Plan by"><select value={filters.basis} onChange={event => setFilters({ ...filters, basis: event.target.value as CookingFilters["basis"] })}>
            <option value="order">Order date</option><option value="collection">Collection date</option>
          </select></Field>
          <Field label="From date"><input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></Field>
          <Field label="To date"><input type="date" min={filters.from || undefined} value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></Field>
          <Field label="Product category"><select value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value as CookingFilters["category"] })}>
            <option value="">All items</option><option value="Sweet">Sweet</option><option value="Savoury">Savoury</option>
          </select></Field>
        </div>
        <p className="inventory-context">{basis} · {range} · {filters.category || "All categories"}</p>
        {plan.error && <p className="field-error" role="alert">{plan.error}</p>}
      </Panel>
      <div className="stats-grid inventory-stats list-stats">
        {[
          { title: "Orders in view", value: String(plan.totals.orders), note: `${plan.totals.pendingOrders} awaiting collection`, icon: ClipboardList, tone: "maroon" },
          { title: "Total ordered", value: kg(plan.totals.orderedKg), note: "Confirmed and collected orders", icon: Scale, tone: "orange" },
          { title: "Awaiting collection", value: kg(plan.totals.pendingKg), note: "Outstanding order requirements", icon: ChefHat, tone: "maroon" },
          { title: "Already collected", value: kg(plan.totals.collectedKg), note: "Excluded from the cook sheet", icon: PackageCheck, tone: "green" },
        ].map(({ title, value, note, icon: Icon, tone }) => <section className="stat-card" key={title}>
          <div className="stat-top"><span>{title}</span><div className={`stat-icon ${tone}`}><Icon size={18} /></div></div>
          <strong>{value}</strong><div className="stat-note">{note}</div>
        </section>)}
      </div>
      {plan.issues.length > 0 && <div className="info-box" role="alert">Review these order quantities or dates before sharing a cook sheet:
        <ul>{plan.issues.map((issue,index) => <li key={`${issue.orderId}-${index}`}><Link to={`/orders/${issue.orderId}`}>{issue.number}</Link> · {issue.reason}</li>)}</ul>
      </div>}
      <Panel title="Product requirements" description={`${plan.rows.length} ${plan.rows.length === 1 ? "product" : "products"} · ${pending.length} with quantities awaiting collection. Drafts and deleted orders are excluded.`}>
        <p className="inventory-guidance">The cook sheet includes only awaiting-collection quantities. Check prepared stock before cooking a fresh batch.</p>
        <DataTable rows={plan.rows} pageSize={8} initialSort="pending" empty={<Empty title="No confirmed orders for these filters" description="Choose another date, switch to collection date, or clear the product filters." />}
          columns={[
            { key: "product", label: "Product / पदार्थ", value: row => row.name, render: row => <div className="cell-stack"><strong>{row.name}</strong><span>{row.category}</span></div> },
            { key: "pending", label: "Awaiting collection", value: row => row.pendingKg, render: row => <strong className={row.pendingKg ? "inventory-required" : "muted"}>{kg(row.pendingKg)}</strong> },
            { key: "ordered", label: "Total ordered", value: row => row.orderedKg, render: row => kg(row.orderedKg) },
            { key: "collected", label: "Collected", value: row => row.collectedKg, render: row => <span className="text-green">{kg(row.collectedKg)}</span> },
            { key: "orders", label: "Orders", value: row => row.orders.length, render: row => <button className="text-link inventory-order-link" onClick={() => setSelectedId(row.id)} aria-label={`View orders for ${row.name}`}>{row.orders.length} {row.orders.length === 1 ? "order" : "orders"}</button> },
            { key: "sizes", label: "Pending order quantities", render: row => <span className="inventory-quantity-breakdown">{orderQuantities(row) || "All collected"}</span> },
          ]} />
      </Panel>
    </div>
    <section id="print-area" className="cooking-print print-only" aria-label="Cook sheet">
      <header><h1>JPfaral · Cook sheet</h1><p>{data.settings.organization}</p><h2>{basis} · {range}</h2>
        <p>{filters.category || "All categories"}{filters.search.trim() ? ` · Product filter: ${filters.search.trim()}` : ""}</p><p>Generated: {dateTime(now())} IST</p></header>
      {canShare ? <><p>Outstanding order requirements. Check prepared stock before cooking. Collected, draft and deleted orders are excluded.</p>
      <table className="data-table"><thead><tr><th>Product / पदार्थ</th><th>Required kg</th><th>Pending orders</th><th>Order quantities</th></tr></thead>
        <tbody>{pending.map(row => <tr key={row.id}><td><strong>{row.name}</strong></td><td><strong>{kg(row.pendingKg)}</strong></td><td>{row.pendingOrders}</td><td>{orderQuantities(row)}</td></tr>)}</tbody>
      </table>
      <p className="cooking-print-total">Total required: <strong>{kg(plan.totals.pendingKg)}</strong> · {pending.length} {pending.length === 1 ? "product" : "products"} · {plan.totals.pendingOrders} {plan.totals.pendingOrders === 1 ? "order" : "orders"}</p></>
        : <p>Cook sheet unavailable. {plan.error || (plan.issues.length ? "Review the order quantities and dates before printing." : "No quantities are awaiting collection for these filters.")}</p>}
    </section>
    {selected && <Modal open title={`${selected.name} · order breakdown`} description="Quantities come from saved order items. Open a receipt to review it." onClose={() => setSelectedId(null)} wide>
      <p className="inventory-context">Total {kg(selected.orderedKg)} · Awaiting collection {kg(selected.pendingKg)} · Collected {kg(selected.collectedKg)}</p>
      <DataTable rows={selected.orders} pageSize={8} columns={[
        { key: "receipt", label: "Receipt no.", render: order => <Link className="order-link" to={`/orders/${order.id}`}>{order.number}</Link> },
        { key: "date", label: "Collection date", render: order => date(order.collectionDate, true) },
        { key: "quantity", label: "Quantity", render: order => kg(order.quantity) },
        { key: "status", label: "Status", render: order => <Badge>{order.status}</Badge> },
      ]} />
    </Modal>}
  </>;
}
