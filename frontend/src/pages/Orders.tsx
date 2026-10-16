import { orderStatusLabel } from "../utils/orderStatus";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  Download,
  SlidersHorizontal,
  X,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { useApp } from "../app/Provider";
import {
  PageHeader,
  Panel,
  SearchInput,
  Button,
  Field,
} from "../components/ui";
import { OrderTable } from "../components/orders/OrderTable";
import { DeleteOrdersDialog } from "../components/orders/DeleteOrdersDialog";
import { MAX_ORDER_DELETIONS } from "../utils/orderDeletion";
import type { Order } from "../types";
import { divisions } from "../data/reference";
import { orderTotal, balance, lineTotal } from "../utils/calculations";
import { rateMoney } from "../utils/pricing";
import { money, dayKey } from "../utils/format";
import { downloadCSV, downloadExcel } from "../utils/export";
export default function Orders() {
  const { data, toast, user } = useApp();
  const admin = user?.role === "Super Admin";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Order[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState(params.get("status") === "Ready" ? "Confirmed" : params.get("status") ?? "");
  const [filters, setFilters] = useState(false);
  const [standard, setStandard] = useState("");
  const [division, setDivision] = useState("");
  const [staff, setStaff] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useMemo(
    () =>
      data.orders.filter((o) => {
        if (o.deletedAt) return false;
        const s =
          o.studentSnapshot ?? data.students.find((s) => s.id === o.studentId);
        return (
          `${o.number} ${o.customerName} ${o.customerPhone} ${s?.name}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (!status || orderStatusLabel(o.status) === status) &&
          (!standard || s?.standard === standard) &&
          (!division || s?.division === division) &&
          (!staff || o.createdBy === staff) &&
          (!method || o.paymentMethod === method) &&
          (!from || dayKey(o.createdAt) >= from) &&
          (!to || dayKey(o.createdAt) <= to)
        );
      }),
    [data, search, status, standard, division, staff, method, from, to],
  );
  const clear = () => {
    setSearch("");
    setStatus("");
    setStandard("");
    setDivision("");
    setStaff("");
    setMethod("");
    setFrom("");
    setTo("");
  };
  useEffect(() => setSelected(new Set()), [search, status, standard, division, staff, method, from, to, admin]);
  useEffect(() => {
    setSelected((previous) => {
      const next = new Set(rows.filter((order) => previous.has(order.id) && !order.deletedAt).map((order) => order.id));
      return next.size === previous.size ? previous : next;
    });
  }, [rows]);
  const select = (next: Set<string>) => {
    if (next.size > MAX_ORDER_DELETIONS) { toast("Select up to 100 orders in one deletion.", true); return; }
    setSelected(next);
  };
  const exportHeaders = [
    "Order number",
    "Student",
    "Customer",
    "Phone",
    "Standard",
    "Division",
    "Order date",
    "Total",
    "Total received",
    "Balance",
    "Payment method",
    "UTR",
    "Collection date",
    "Collector",
    "Status",
    "Created by",
    "Last edited by",
    "Order items: दर पाव किलो (250 ग्रॅम); प्रमाण kg; किंमत रुपये",
    "Order record ID",
  ];
  const exportRows = rows.map((o) => {
    const s =
      o.studentSnapshot ?? data.students.find((s) => s.id === o.studentId);
    return [
      o.number,
      s?.name ?? "",
      o.customerName,
      o.customerPhone,
      s?.standard ?? "",
      s?.division ?? "",
      o.createdAt,
      orderTotal(o),
      o.advance,
      balance(o),
      o.paymentMethod,
      o.utr,
      o.collectionDate,
      o.collectorName,
      orderStatusLabel(o.status),
      data.staff.find((s) => s.id === o.createdBy)?.name ?? "",
      data.staff.find((s) => s.id === o.editedBy)?.name ?? "",
      o.items
        .map(
          (item) =>
            `${item.name} | ${rateMoney(item.price)} / 250 ग्रॅम | ${item.quantity} kg | ${money(lineTotal(item))}`,
        )
        .join("; "),
      o.id,
    ];
  });
  const exportCSV = () =>
    downloadCSV("JPfaral-orders.csv", exportHeaders, exportRows);
  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadExcel("JPfaral-orders.xlsx", exportHeaders, exportRows);
    } catch {
      toast("Unable to export the workbook. Try CSV instead.", true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="ORDER DESK"
        title="All orders"
        description="Every sweet celebration, carefully recorded."
        actions={
          <>
            <Button variant="secondary" onClick={exportCSV}>
              <Download size={16} />
              Export CSV
            </Button>
            <Button
              variant="secondary"
              loading={exporting}
              onClick={() => void exportExcel()}
            >
              <FileSpreadsheet size={16} />
              Export Excel
            </Button>
            <Link to="/orders/new" className="button primary">
              <Plus size={17} />
              Create order
            </Link>
          </>
        }
      />
      <div className="summary-pills">
        <span>
          <strong>{rows.length}</strong> {rows.length === 1 ? "active order" : "active orders"} in this view
        </span>
        <span>
          Total value{" "}
          <strong>
            {money(
              rows
                .filter((o) => o.status !== "Draft")
                .reduce((s, o) => s + orderTotal(o), 0),
            )}
          </strong>
        </span>
        <span>
          Balance due{" "}
          <strong className="text-amber">
            {money(
              rows
                .filter((o) => o.status !== "Draft")
                .reduce((s, o) => s + balance(o), 0),
            )}
          </strong>
        </span>
      </div>
      <p className="order-numbering-note">Deleted orders are excluded from counts. Their receipt numbers become available for new orders.</p>
      <Panel>
        <div className="table-toolbar">
          <SearchInput
            label="Search orders"
            placeholder="Search order, customer, student or phone…"
            value={search}
            onChange={setSearch}
          />
          <div className="filter-actions">
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {["Draft", "Confirmed", "Collected"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => setFilters(!filters)}>
              <SlidersHorizontal size={15} />
              Filters
            </Button>
            {(search ||
              status ||
              standard ||
              division ||
              staff ||
              method ||
              from ||
              to) && (
              <Button variant="ghost" onClick={clear}>
                <X size={14} />
                Clear
              </Button>
            )}
          </div>
        </div>
        {filters && (
          <div className="filters-grid">
            <Field label="Standard">
              <select
                value={standard}
                onChange={(e) => {
                  setStandard(e.target.value);
                  setDivision("");
                }}
              >
                <option value="">All standards</option>
                {Object.keys(divisions).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Division">
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value)}
              >
                <option value="">All divisions</option>
                {(standard
                  ? divisions[standard]
                  : Object.values(divisions).flat()
                ).map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Created by">
              <select value={staff} onChange={(e) => setStaff(e.target.value)}>
                <option value="">All staff</option>
                {data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="">All methods</option>
                <option>Cash</option>
                <option>Online</option>
              </select>
            </Field>
            <Field label="From date">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To date">
              <input
                type="date"
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
        )}
        {admin && selected.size > 0 && <div className="order-selection-bar">
          <span aria-live="polite">{selected.size} {selected.size === 1 ? "order" : "orders"} selected</span>
          <div>
            {selected.size > 0 && <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>}
            <Button variant="danger" disabled={!selected.size} onClick={() => {
              const targets = rows.filter((order) => selected.has(order.id) && !order.deletedAt);
              if (targets.length) setDeleting(targets);
            }}><Trash2 size={15} />Delete selected</Button>
          </div>
        </div>}
        <OrderTable orders={rows} selected={admin ? selected : undefined} onSelect={admin ? select : undefined}
          onDelete={admin ? (order) => setDeleting([order]) : undefined} />
      </Panel>
      {deleting && <DeleteOrdersDialog orders={deleting} onClose={() => setDeleting(null)}
        onDeleted={() => { setDeleting(null); setSelected(new Set()); }} />}
      <p className="export-note">
        CSV and Excel export the complete filtered view. Dedicated PDF export is
        a future integration; individual bills can be printed or saved as PDF
        from the browser.
      </p>
    </>
  );
}
