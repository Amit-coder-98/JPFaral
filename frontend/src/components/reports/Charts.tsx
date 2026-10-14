import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import { useApp } from "../../app/Provider";
import type { Order } from "../../types";
import { orderTotal } from "../../utils/calculations";
import { date, dayKey, money } from "../../utils/format";
import { Empty } from "../ui";
const colors = [
  "#9b5665",
  "#dfa165",
  "#6d9380",
  "#b8a08a",
  "#8598ac",
  "#c6aa55",
];
function useChartReducedMotion() {
  const prefersReduced = useReducedMotion();
  const { data } = useApp();
  return prefersReduced || data.settings.reduceMotion;
}
export function dailyData(orders: Order[]) {
  const days = new Map<
    string,
    { day: string; sales: number; orders: number }
  >();
  orders
    .filter((o) => o.status !== "Draft")
    .forEach((o) => {
      const day = dayKey(o.createdAt);
      const entry = days.get(day) ?? { day, sales: 0, orders: 0 };
      entry.sales += orderTotal(o);
      entry.orders++;
      days.set(day, entry);
    });
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}
export function SalesChart({
  orders,
  count = false,
}: {
  orders: Order[];
  count?: boolean;
}) {
  const reduced = useChartReducedMotion();
  const data = dailyData(orders);
  if (!data.length) return <Empty title="No sales in this period" />;
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 8, left: -15, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id={count ? "orders-fill" : "sales-fill"}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#c77d48" stopOpacity={0.16} />
              <stop offset="100%" stopColor="#c77d48" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 4"
            vertical={false}
            stroke="#eee9e2"
          />
          <XAxis
            dataKey="day"
            tickFormatter={(v) => date(String(v))}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8c8984", fontSize: 11 }}
            minTickGap={24}
            dy={8}
          />
          <YAxis
            tickFormatter={(v) => (count ? String(v) : `₹${Number(v) / 1000}k`)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8c8984", fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(v) => (count ? `${v} orders` : money(Number(v)))}
            labelFormatter={(v) => date(String(v), true)}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e8e1d8",
              fontSize: 12,
            }}
            cursor={{ stroke: "#dacfc3", strokeDasharray: "4 4" }}
          />
          <Area
            type="monotone"
            dataKey={count ? "orders" : "sales"}
            name={count ? "Orders" : "Sales"}
            stroke="#be7a45"
            strokeWidth={2.5}
            fill={`url(#${count ? "orders-fill" : "sales-fill"})`}
            isAnimationActive={!reduced}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function BreakdownChart({
  data,
  currency = false,
  horizontal = false,
}: {
  data: { name: string; value: number }[];
  currency?: boolean;
  horizontal?: boolean;
}) {
  const reduced = useChartReducedMotion();
  if (!data.some((d) => d.value))
    return <Empty title="No data in this period" />;
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 14, left: horizontal ? 12 : -15, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 4"
            vertical={false}
            stroke="#eee9e2"
          />
          <XAxis
            type={horizontal ? "number" : "category"}
            dataKey={horizontal ? undefined : "name"}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#8c8984" }}
          />
          <YAxis
            type={horizontal ? "category" : "number"}
            dataKey={horizontal ? "name" : undefined}
            width={horizontal ? 100 : 55}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#8c8984" }}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(v) => (currency ? money(Number(v)) : v)}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e8e1d8",
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="value"
            name={currency ? "Sales" : "Orders"}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={34}
            isAnimationActive={!reduced}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Donut({
  data,
  center,
  caption,
}: {
  data: { name: string; value: number }[];
  center: string;
  caption: string;
}) {
  const reduced = useChartReducedMotion();
  if (!data.some((d) => d.value)) return <Empty title="No payments yet" />;
  if (data.some((d) => d.value < 0))
    return (
      <div className="payment-breakdown">
        <strong>{center}</strong>
        <p className="muted">{caption}</p>
        {data.map((d) => (
          <p key={d.name}>
            {d.name}: <strong>{money(d.value)}</strong>
          </p>
        ))}
      </div>
    );
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height={215} minWidth={0}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={66}
            outerRadius={84}
            paddingAngle={3}
            stroke="none"
            isAnimationActive={!reduced}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => money(Number(v))}
            contentStyle={{ borderRadius: 10, border: "1px solid #e8e1d8" }}
          />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 11 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <strong>{center}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}
