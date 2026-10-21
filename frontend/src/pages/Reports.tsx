import { orderStatusLabel } from "../utils/orderStatus";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { useApp } from "../app/Provider";
import { Button, Field, PageHeader, Panel } from "../components/ui";
import { BreakdownChart, Donut, dailyData } from "../components/reports/Charts";
import {
  metrics,
  orderTotal,
  balance,
  lineTotal,
  paymentAmount,
} from "../utils/calculations";
import { money, date, dayKey } from "../utils/format";
import { downloadCSV } from "../utils/export";
import { divisions } from "../data/reference";
import { sortCatalogue } from "../utils/catalogue";
export default function Reports() {
  const { data } = useApp();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState("day");
  const [standard, setStandard] = useState("");
  const orders = data.orders.filter(
    (o) =>
      o.status !== "Draft" &&
      (!from || dayKey(o.createdAt) >= from) &&
      (!to || dayKey(o.createdAt) <= to),
  );
  const ids = new Set(orders.map((o) => o.id));
  const payments = data.payments.filter((p) => ids.has(p.orderId));
  const m = metrics(orders, payments);
  const daily = dailyData(orders);
  const grouped = new Map<string, number>();
  daily.forEach((d) => {
    const key =
      period === "month"
        ? d.day.slice(0, 7)
        : period === "week"
          ? `Week ${Math.ceil(Number(d.day.slice(8)) / 7)} · ${d.day.slice(0, 7)}`
          : date(d.day);
    grouped.set(key, (grouped.get(key) ?? 0) + d.sales);
  });
  const byStandard = Object.keys(divisions).map((name) => ({
    name,
    value: orders.filter(
      (o) =>
        (o.studentSnapshot ?? data.students.find((s) => s.id === o.studentId))
          ?.standard === name,
    ).length,
  }));
  const byDivision = (
    standard ? divisions[standard] : Object.values(divisions).flat()
  ).map((name) => ({
    name,
    value: orders.filter(
      (o) =>
        (o.studentSnapshot ?? data.students.find((s) => s.id === o.studentId))
          ?.division === name,
    ).length,
  }));
  const byProduct = sortCatalogue(data.products)
    .map((p) => ({
      name: p.name,
      value: orders.reduce(
        (s, o) =>
          s +
          o.items
            .filter((i) => i.productId === p.id)
            .reduce((n, i) => n + lineTotal(i), 0),
        0,
      ),
    }));
  const byStaff = data.staff.map((s) => ({
    name: s.name.split(" ")[0],
    value: orders.filter((o) => o.createdBy === s.id).length,
  }));
  const cash = payments
    .filter((p) => p.method === "Cash")
    .reduce((s, p) => s + paymentAmount(p), 0);
  return (
    <>
      <PageHeader
        eyebrow="THE SEASON, IN PERSPECTIVE"
        title="Reports & analytics"
        description="See the bigger picture, one thoughtful insight at a time."
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} />
              Print report
            </Button>
            <Button
              onClick={() =>
                downloadCSV(
                  "JPfaral-season-report.csv",
                  [
                    "Order",
                    "Customer",
                    "Date",
                    "Sales",
                    "Received",
                    "Outstanding",
                    "Status",
                  ],
                  orders.map((o) => [
                    o.number,
                    o.customerName,
                    o.createdAt,
                    orderTotal(o),
                    o.advance,
                    balance(o),
                    orderStatusLabel(o.status),
                  ]),
                )
              }
            >
              <Download size={16} />
              Export CSV
            </Button>
          </>
        }
      />
      <div id="print-area" className="report-print">
        <div className="report-title print-only">
          <h1>JPfaral · Diwali 2026 report</h1>
          <p>
            {from || "Season start"} — {to || "Season end"}
          </p>
        </div>
        <Panel>
          <div className="report-filters">
            <Field label="Orders from">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="Orders to">
              <input
                type="date"
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="Sales grouping">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="day">Daily</option>
                <option value="week">Weekly (1–7, 8–14…)</option>
                <option value="month">Monthly</option>
              </select>
            </Field>
            {(from || to) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Clear dates
              </Button>
            )}
            <span className="muted">{orders.length} confirmed orders</span>
          </div>
        </Panel>
        <div className="report-stats">
          {[
            { name: "Sales", value: money(m.sales) },
            { name: "Payments for these orders", value: money(m.collected) },
            { name: "Outstanding balances", value: money(m.pending) },
            { name: "Awaiting collection", value: m.awaiting },
          ].map((s) => (
            <div key={s.name}>
              <span>{s.name}</span>
              <strong>{s.value}</strong>
            </div>
          ))}
        </div>
        <div className="reports-grid">
          <Panel
            title={`Sales by ${period}`}
            description="Order value, grouped by order date."
          >
            <BreakdownChart
              data={[...grouped].map(([name, value]) => ({ name, value }))}
              currency
            />
          </Panel>
          <Panel
            title="Orders by standard"
            description="Every classroom’s contribution."
          >
            <BreakdownChart data={byStandard} />
          </Panel>
          <Panel
            title="Sales by product"
            description="The favourites, at their recorded prices."
          >
            <BreakdownChart data={byProduct} currency horizontal />
          </Panel>
          <Panel
            title="Cash vs online"
            description="Payments associated with the orders in this period."
          >
            <Donut
              data={[
                { name: "Cash", value: cash },
                { name: "Online", value: m.collected - cash },
              ]}
              center={money(m.collected)}
              caption="TOTAL RECEIVED"
            />
          </Panel>
          <Panel
            title="Orders by staff member"
            description="A season powered by your team."
          >
            <BreakdownChart data={byStaff} />
          </Panel>
          <Panel
            title="Collection status"
            description="From order desk to a happy handover."
          >
            <BreakdownChart
              data={["Confirmed", "Collected"].map((name) => ({
                name,
                value: orders.filter((o) => orderStatusLabel(o.status) === name).length,
              }))}
            />
          </Panel>
          <Panel
            title="Orders by division"
            description="A closer look at classroom contributions."
            actions={
              <select
                aria-label="Report standard"
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
              >
                <option value="">All standards</option>
                {Object.keys(divisions).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            }
          >
            <BreakdownChart data={byDivision} horizontal />
          </Panel>
          <Panel
            title="Outstanding balances"
            description="Open balances, grouped by standard."
          >
            <BreakdownChart
              data={Object.keys(divisions).map((name) => ({
                name,
                value: orders
                  .filter(
                    (o) =>
                      (
                        o.studentSnapshot ??
                        data.students.find((s) => s.id === o.studentId)
                      )?.standard === name,
                  )
                  .reduce((s, o) => s + balance(o), 0),
              }))}
              currency
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
