import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  ShoppingBag,
  IndianRupee,
  Wallet,
  Clock3,
  PackageCheck,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../app/Provider";
import { Empty, PageHeader, Panel } from "../components/ui";
import { OrderTable } from "../components/orders/OrderTable";
import { SchoolOverview } from "../components/reports/SchoolOverview";
import { metrics, orderTotal } from "../utils/calculations";
import {
  money,
  number,
  dateTime,
  date,
  today,
} from "../utils/format";
export default function Dashboard() {
  const { data, user } = useApp();
  const personal = user?.role !== "Super Admin";
  const orders = useMemo(
    () => data.orders.filter((o) => !personal || o.createdBy === user?.id),
    [data.orders, personal, user?.id],
  );
  const m = metrics(orders, data.payments);
  const confirmed = orders.filter((o) => o.status !== "Draft");
  const logs = data.logs
    .filter((l) => !personal || l.userId === user?.id)
    .slice(0, 4);
  const stats = [
    {
      title: "Total orders",
      value: number(orders.length),
      icon: ShoppingBag,
      note: `${orders.filter((o) => o.status === "Draft").length} draft orders`,
      tone: "maroon",
    },
    {
      title: "Total sales",
      value: money(m.sales),
      icon: IndianRupee,
      note: "Across confirmed orders",
      tone: "orange",
    },
    {
      title: "Amount collected",
      value: money(m.collected),
      icon: Wallet,
      note: `${m.sales ? Math.round((m.collected / m.sales) * 100) : 0}% of total sales`,
      tone: "green",
    },
    {
      title: "Pending balance",
      value: money(m.pending),
      icon: Clock3,
      note: `${confirmed.filter((o) => o.advance < orderTotal(o)).length} orders with balance due`,
      tone: "amber",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="OVERVIEW"
        title="Dashboard"
        description={
          personal
            ? "Your orders, payments and collections."
            : "Orders, payments and collections at a glance."
        }
        actions={
          <>
            <Link
              to="/reports"
              className={`button secondary ${personal ? "hidden" : ""}`}
            >
              <ArrowUpRight size={16} />
              View reports
            </Link>
            <Link to="/orders/new" className="button primary">
              <Plus size={17} />
              Create order
            </Link>
          </>
        }
      />
      <div className="stats-grid">
        {stats.map(({ title, value, icon: Icon, note, tone }) => (
          <section className="stat-card" key={title}>
            <div className="stat-top">
              <span>{title}</span>
              <div className={`stat-icon ${tone}`}>
                <Icon size={18} />
              </div>
            </div>
            <strong>{value}</strong>
            <div className="stat-note">
              <span className={`note-dot ${tone}`} />
              {note}
            </div>
          </section>
        ))}
      </div>
      <div className="daily-strip">
        <div>
          <span className="mini-stat-icon">
            <CalendarDays size={17} />
          </span>
          <span>
            Today’s orders <strong>{m.today}</strong>
          </span>
          <span className="muted">
            {date(today())}
          </span>
          <Link to={`/orders?from=${today()}&to=${today()}${personal ? `&staff=${user?.id}` : ""}`}>View today’s full list <ArrowRight size={14} /></Link>
        </div>
        <div>
          <span className="mini-stat-icon">
            <PackageCheck size={18} />
          </span>
          <span>
            Awaiting collection <strong>{confirmed.filter((o) => o.status !== "Collected").length}</strong>
          </span>
          <Link to="/orders?status=Confirmed">
            View pending collections <ArrowRight size={14} />
          </Link>
        </div>
      </div>
      <SchoolOverview />
      <Panel
        title={personal ? "Your recent orders" : "Recent orders"}
        description="The latest entries from your order desk."
        actions={
          <Link to="/orders" className="text-link">
            View all orders <ArrowRight size={14} />
          </Link>
        }
        className="recent-orders"
      >
        {orders.length ? <OrderTable
          orders={[...orders]
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 5)}
          compact
        /> : <Empty
          title="No orders yet"
          description="Create your first order to start tracking sales and payments."
          action={<Link to="/orders/new" className="button primary">Create order</Link>}
        />}
      </Panel>
      {logs.length > 0 && <div className="dashboard-activity">
        <Panel
          title="Recent activity"
          description={
            personal ? "Your latest updates." : "Latest changes to shared records."
          }
          actions={
            <Link
              to={personal ? "/my-activity" : "/activity"}
              className="text-link"
            >
              <ArrowUpRight size={17} />
            </Link>
          }
        >
          <div className="activity-feed">
            {logs.map((l) => (
              <div key={l.id}>
                <div className="activity-marker">
                  <ShoppingBag size={14} />
                </div>
                <div>
                  <strong>
                    {
                      data.staff
                        .find((s) => s.id === l.userId)
                        ?.name.split(" ")[0] ?? "System"
                    }{" "}
                    {l.action.toLowerCase()} {l.recordId}
                  </strong>
                  <p>{l.summary}</p>
                  <span>{dateTime(l.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
          <Link to="/students" className="student-quick-link">
            Find a student & their previous orders <ArrowRight size={15} />
          </Link>
        </Panel>
      </div>}
    </>
  );
}
