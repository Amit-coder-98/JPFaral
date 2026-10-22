import { Link } from "react-router-dom";
import { ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import { useApp } from "../../app/Provider";
import { Badge, DataTable, type Column } from "../ui";
import type { Order } from "../../types";
import { activeOrderSerials, balance, orderTotal } from "../../utils/calculations";
import { date, money } from "../../utils/format";
import { orderStatusLabel } from "../../utils/orderStatus";
import { isStallOrder } from "../../utils/orderSource";
export function OrderTable({
  orders,
  compact = false,
  selected,
  onSelect,
  onDelete,
  pageSize = 8,
}: {
  orders: Order[];
  compact?: boolean;
  selected?: Set<string>;
  onSelect?: (selected: Set<string>) => void;
  onDelete?: (order: Order) => void;
  pageSize?: number | "all";
}) {
  const { data } = useApp();
  const serials = activeOrderSerials(orders);
  const student = (o: Order) =>
    o.studentSnapshot ?? data.students.find((s) => s.id === o.studentId);
  const staff = (id: string) =>
    data.staff.find((s) => s.id === id)?.name ?? "—";
  const columns: Column<Order>[] = [
    ...(!compact ? [{ key: "serial", label: "List no.", value: (order: Order) => serials.get(order.id) ?? 0,
      render: (order: Order) => serials.get(order.id) ?? "—" }] : []),
    {
      key: "number",
      label: "Receipt no.",
      value: (o) => o.number,
      render: (o) => (
        <Link className="order-link" to={`/orders/${o.id}`}>
          {o.number}
        </Link>
      ),
    },
    {
      key: "name",
      label: "Customer / Student",
      value: (o) => o.customerName,
      render: (o) => (
        <div className="cell-stack">
          <strong>{o.customerName || "Draft customer"}</strong>
          <span>{isStallOrder(o) ? "Stall / direct order" : student(o)?.name ?? "Student not selected"}</span>
        </div>
      ),
    },
    ...(!compact
      ? [
          {
            key: "phone",
            label: "Phone number",
            render: (o: Order) => o.customerPhone || "—",
          },
          {
            key: "standard",
            label: "Standard & division",
            value: (o: Order) => isStallOrder(o) ? "Stall" : student(o)?.standard ?? "",
            render: (o: Order) => (
              <div className="cell-stack">
                <strong>{isStallOrder(o) ? "Stall" : student(o)?.standard ?? "—"}</strong>
                <span>{isStallOrder(o) ? "Direct order" : student(o)?.division ?? "—"}</span>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "date",
      label: "Order date",
      value: (o) => new Date(o.createdAt).getTime(),
      render: (o) => date(o.createdAt),
    },
    {
      key: "total",
      label: "Amount",
      value: orderTotal,
      render: (o) => <strong className="amount">{money(orderTotal(o))}</strong>,
    },
    ...(!compact
      ? [
          {
            key: "advance",
            label: "Total received",
            value: (o: Order) => o.advance,
            render: (o: Order) => money(o.advance),
          },
          {
            key: "balance",
            label: "Balance due",
            value: balance,
            render: (o: Order) => (
              <span className={balance(o) > 0 ? "text-amber" : "text-green"}>
                {money(balance(o))}
              </span>
            ),
          },
          {
            key: "collection",
            label: "Collection",
            value: (o: Order) => o.collectionDate,
            render: (o: Order) => date(o.collectionDate),
          },
        ]
      : []),
    {
      key: "status",
      label: "Status",
      value: (o) => orderStatusLabel(o.status),
      render: (o) => <Badge>{o.status}</Badge>,
    },
    ...(!compact
      ? [
          {
            key: "by",
            label: "Created by",
            render: (o: Order) => staff(o.createdBy),
          },
          {
            key: "edited",
            label: "Last edited by",
            render: (o: Order) => staff(o.editedBy),
          },
        ]
      : []),
    {
      key: "actions",
      label: "",
      render: (o) => (
        <div className="table-actions">
          {!compact && o.status !== "Collected" && (
            <Link
              className="icon-button"
              to={`/orders/${o.id}/edit`}
              aria-label={`Edit ${o.number}`}
            >
              <Pencil size={15} />
            </Link>
          )}
          <Link
            className="icon-button"
            to={`/orders/${o.id}`}
            aria-label={`View ${o.number}`}
          >
            <ArrowUpRight size={17} />
          </Link>
          {!compact && onDelete && <button type="button" className="icon-button delete-order-button"
            aria-label={`Delete ${o.number}`} title={`Review deletion of ${o.number}`}
            onClick={() => onDelete(o)}><Trash2 size={16} /></button>}
        </div>
      ),
    },
  ];
  return (
    <DataTable
      rows={orders}
      columns={columns}
      pageSize={compact ? 5 : pageSize === "all" ? 8 : pageSize}
      fitViewport={false}
      pagination={!compact && pageSize !== "all"}
      initialSort="date"
      selection={!compact && selected && onSelect ? {
        selected, onChange: onSelect, canSelect: (order) => !order.deletedAt, label: (order) => `Select ${order.number}`,
      } : undefined}
    />
  );
}
