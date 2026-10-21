import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Wallet, Banknote, Landmark, Clock3 } from "lucide-react";
import { useApp } from "../app/Provider";
import {
  Badge,
  Button,
  DataTable,
  Field,
  PageHeader,
  Panel,
  SearchInput,
} from "../components/ui";
import { ledgerPayments, metrics, paymentAmount } from "../utils/calculations";
import { PaymentDialog } from "../components/orders/PaymentDialog";
import { date, money, dayKey, today } from "../utils/format";
import { dailyPayments } from "../utils/dailyPayments";
import { downloadCSV } from "../utils/export";
export default function Payments() {
  const { data } = useApp();
  const allOrders = [...data.orders, ...(data.deletedOrders ?? [])];
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [recording, setRecording] = useState(false);
  const [view, setView] = useState("live");
  const [layout, setLayout] = useState("daily");
  const testHistory = view === "test";
  const rows = ledgerPayments(data.payments, data.deletedOrders ?? [], testHistory).filter((p) => {
    const o = allOrders.find((o) => o.id === p.orderId);
    return (
      (!method || p.method === method) &&
      (!from || dayKey(p.date) >= from) &&
      (!to || dayKey(p.date) <= to) &&
      `${o?.number} ${o?.customerName} ${p.utr}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const daily = dailyPayments(rows);
  const m = metrics(data.orders, data.payments);
  const cash = daily.reduce((n, day) => n + Math.round(day.cash * 100), 0) / 100;
  const online = daily.reduce((n, day) => n + Math.round(day.online * 100), 0) / 100;
  const stats = [
    {
      label: testHistory ? "Recorded test amount" : "Received in this view",
      value: money(Math.round((cash + online) * 100) / 100),
      icon: Wallet,
      tone: "maroon",
    },
    {
      label: testHistory ? "Test cash entries" : "Cash received",
      value: money(cash),
      icon: Banknote,
      tone: "green",
    },
    {
      label: testHistory ? "Test online entries" : "Online received",
      value: money(online),
      icon: Landmark,
      tone: "orange",
    },
    {
      label: testHistory ? "Test transactions" : "Season outstanding",
      value: testHistory ? String(rows.length) : money(m.pending),
      icon: Clock3,
      tone: "amber",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="A CLEAR VIEW OF EVERY RUPEE"
        title="Payments"
        description="Payments received, thoughtfully recorded. No payment gateway involved."
        actions={
          <>
            <Button onClick={() => setRecording(true)}>Record payment</Button>
            <Button
              variant="secondary"
              onClick={() =>
                downloadCSV(
                  testHistory ? "JPfaral-test-payment-history.csv" : "JPfaral-payments.csv",
                  [
                    "Order",
                    "Customer",
                    "Amount",
                    "Transaction type",
                    "Record classification",
                    "Method",
                    "UTR",
                    "Received by",
                    "Date",
                    "Order record ID",
                  ],
                  rows.map((p) => {
                    const o = allOrders.find((o) => o.id === p.orderId);
                    return [
                      o?.number ?? "",
                      o?.customerName ?? "",
                      paymentAmount(p),
                      p.kind ?? "receipt",
                      testHistory ? "Deleted test order" : o?.deletedAt ? "Deleted order" : "Live ledger",
                      p.method,
                      p.utr,
                      data.staff.find((s) => s.id === p.receivedBy)?.name ?? "",
                      p.date,
                      p.orderId,
                    ];
                  }),
                )
              }
            >
              <Download size={16} />
              Export CSV
            </Button>
          </>
        }
      />
      <div className="stats-grid list-stats">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <div className={`stat-icon ${s.tone}`}>
                <s.icon size={18} />
              </div>
            </div>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
      <Panel>
        {testHistory && <div className="info-box">Test history only. These entries are retained for review and excluded from live payment totals. No refund was recorded by test cleanup.</div>}
        <div className="table-toolbar">
          <SearchInput
            label="Search payments"
            value={search}
            onChange={setSearch}
            placeholder="Search order, customer or UTR…"
          />
          <div className="payment-view-filters">
          <select aria-label="Payment records" value={view} onChange={(event) => setView(event.target.value)}>
            <option value="live">Live payments</option>
            <option value="test">Test history</option>
          </select>
          <select
            aria-label="Filter payment method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">All methods</option>
            <option>Cash</option>
            <option>Online</option>
          </select>
          </div>
        </div>
        <div className="date-filter-row">
          <Button variant="secondary" onClick={() => { setFrom(today()); setTo(today()); }}>Today’s payments</Button>
          <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>All dates</Button>
          <Field label="Payments from">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Payments to">
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          {(search || method || from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setMethod("");
                setFrom("");
                setTo("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        {from && to && from > to && <p className="field-error" role="alert">End date must be on or after the start date.</p>}
        <div className="payment-layout-toolbar">
          <div className="payment-view-filters" role="group" aria-label="Payment view">
            <Button variant={layout === "daily" ? "primary" : "secondary"} aria-pressed={layout === "daily"} onClick={() => setLayout("daily")}>Daily summary</Button>
            <Button variant={layout === "transactions" ? "primary" : "secondary"} aria-pressed={layout === "transactions"} onClick={() => setLayout("transactions")}>Transactions</Button>
          </div>
          {layout === "daily" && <Button variant="secondary" onClick={() => downloadCSV(testHistory ? "JPfaral-test-daily-payments.csv" : "JPfaral-daily-payments.csv",
            ["Payment day (IST)", "Cash net", "Online net", "Receipts", "Refunds", "Net received", "Transactions"],
            daily.map(day => [day.id, day.cash, day.online, day.receipts, day.refunds, day.net, day.transactions]))}><Download size={16} />Export daily summary</Button>}
        </div>
        <p className="payment-day-note muted">Payment dates use Indian time (IST). Cash and online totals are net of refunds; order dates do not affect these totals.</p>
        {layout === "daily" ? <DataTable rows={daily} pagination={false} initialSort="id" columns={[
          { key: "id", label: "Payment day", value: day => day.id, render: day => date(day.id, true) },
          { key: "cash", label: "Cash net", value: day => day.cash, render: day => money(day.cash) },
          { key: "online", label: "Online net", value: day => day.online, render: day => money(day.online) },
          { key: "receipts", label: "Receipts", value: day => day.receipts, render: day => money(day.receipts) },
          { key: "refunds", label: "Refunds", value: day => day.refunds, render: day => money(day.refunds) },
          { key: "net", label: "Net received", value: day => day.net, render: day => <strong>{money(day.net)}</strong> },
          { key: "transactions", label: "Transactions", value: day => day.transactions, render: day => <button className="text-link" aria-label={`View payments on ${day.id}`} onClick={() => { setFrom(day.id); setTo(day.id); setLayout("transactions"); }}>{day.transactions} · View list</button> },
        ]} /> : <DataTable
          pagination={false}
          rows={rows}
          initialSort="date"
          columns={[
            {
              key: "order",
              label: "Receipt no.",
              render: (p) => {
                const o = allOrders.find((o) => o.id === p.orderId);
                return (
                  <Link className="order-link" to={`/orders/${p.orderId}`}>
                    {o?.number}{o?.deletionTestData ? " · Test" : o?.deletedAt ? " · Deleted" : ""}
                  </Link>
                );
              },
            },
            {
              key: "customer",
              label: "Customer",
              render: (p) =>
                allOrders.find((o) => o.id === p.orderId)?.customerName,
            },
            {
              key: "amount",
              label: testHistory ? "Recorded test amount" : "Amount received",
              value: (p) => paymentAmount(p),
              render: (p) => (
                <strong
                  className={p.kind === "refund" ? "text-red" : "text-green"}
                >
                  {money(paymentAmount(p))}
                </strong>
              ),
            },
            {
              key: "kind",
              label: "Transaction",
              render: (p) => (p.kind === "refund" ? "Refund" : "Receipt"),
            },
            {
              key: "method",
              label: "Method",
              render: (p) => (
                <Badge tone={p.method === "Cash" ? "active" : "online"}>
                  {p.method}
                </Badge>
              ),
            },
            {
              key: "utr",
              label: "UTR number",
              render: (p) => <span className="mono">{p.utr || "—"}</span>,
            },
            {
              key: "staff",
              label: "Received by",
              render: (p) =>
                data.staff.find((s) => s.id === p.receivedBy)?.name,
            },
            {
              key: "date",
              label: "Payment date",
              value: (p) => new Date(p.date).getTime(),
              render: (p) => date(p.date, true),
            },
          ]}
        />}
      </Panel>
      <p className="export-note">
        Receipts and refunds are recorded as separate transactions. Earlier
        payments remain unchanged. Deleted test entries are available under Test history and excluded from live totals. Drafts are excluded from financial totals.
      </p>
      {recording && <PaymentDialog onClose={() => setRecording(false)} />}
    </>
  );
}
