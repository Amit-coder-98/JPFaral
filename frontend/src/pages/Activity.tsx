import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { History, ShoppingBag, Pencil, CalendarDays } from "lucide-react";
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
import { dateTime, today, dayKey, initials } from "../utils/format";
export default function Activity({ personal = false }: { personal?: boolean }) {
  const { data, user, isMock } = useApp();
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const [staff, setStaff] = useState(params.get("user") ?? "");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const all = data.logs.filter((l) => !personal || l.userId === user?.id);
  const rows = all.filter(
    (l) =>
      (!staff || l.userId === staff) &&
      (!action || l.action === action) &&
      (!from || dayKey(l.timestamp) >= from) &&
      (!to || dayKey(l.timestamp) <= to) &&
      `${l.recordId} ${l.summary} ${l.recordType} ${data.staff.find((s) => s.id === l.userId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow={personal ? "YOUR CONTRIBUTIONS" : "A THOUGHTFUL PAPER TRAIL"}
        title={personal ? "My activity" : "Activity & audit logs"}
        description={
          personal
            ? "Your orders, your edits, and the care you put into every entry."
            : "A shared timeline of changes across your festive workspace."
        }
      />
      {personal && (
        <div className="report-stats">
          {[
            {
              title: "Orders created",
              value: data.orders.filter((o) => o.createdBy === user?.id).length,
              icon: ShoppingBag,
            },
            {
              title: "Order edits",
              value: all.filter(
                (l) => l.recordType === "Order" && l.action === "Edited",
              ).length,
              icon: Pencil,
            },
            {
              title: "Today’s activity",
              value: all.filter((l) => dayKey(l.timestamp) === today()).length,
              icon: CalendarDays,
            },
          ].map((s) => (
            <div key={s.title}>
              <span>
                <s.icon size={16} />
                {s.title}
              </span>
              <strong>{s.value}</strong>
            </div>
          ))}
        </div>
      )}
      <Panel>
        <div className="table-toolbar">
          <SearchInput
            label="Search activity"
            value={search}
            onChange={setSearch}
            placeholder="Search record, person or change…"
          />
          <div className="filter-actions">
            {!personal && (
              <select
                aria-label="Filter activity user"
                value={staff}
                onChange={(e) => setStaff(e.target.value)}
              >
                <option value="">All users</option>
                {data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Filter activity action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">All actions</option>
              {["Created", "Edited", "Imported", "Updated", "Deleted"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="date-filter-row">
          <Field label="Activity from">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Activity to">
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          {(search || staff || action || from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStaff("");
                setAction("");
                setFrom("");
                setTo("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        <DataTable
          fitViewport
          rows={rows}
          initialSort="timestamp"
          columns={[
            {
              key: "user",
              label: "User",
              render: (l) => {
                const name =
                  data.staff.find((s) => s.id === l.userId)?.name ??
                  "Demo User";
                return (
                  <div className="student-name-button">
                    <span className="avatar color-2">{initials(name)}</span>
                    <strong>{name}</strong>
                  </div>
                );
              },
            },
            {
              key: "action",
              label: "Action",
              render: (l) => (
                <Badge tone={l.action === "Created" ? "active" : "online"}>
                  {l.action}
                </Badge>
              ),
            },
            {
              key: "record",
              label: "Record",
              render: (l) => {
                const order = [...data.orders, ...(data.deletedOrders ?? [])].find((o) => l.orderId ? o.id === l.orderId : (o.reference ?? o.number) === l.recordId);
                return (
                  <div className="cell-stack">
                    <strong>
                      {order ? (
                        <Link className="order-link" to={`/orders/${order.id}`}>
                          {l.recordId}
                        </Link>
                      ) : (
                        l.recordId
                      )}
                    </strong>
                    <span>{l.recordType}</span>
                  </div>
                );
              },
            },
            {
              key: "changes",
              label: "Summary of changes",
              render: (l) => (
                <div className="audit-cell">
                  <span>{l.summary}</span>
                  {l.changes.map((c, i) => (
                    <div key={i}>
                      <strong>{c.field}:</strong> <del>{c.before}</del> →{" "}
                      <span>{c.after}</span>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: "timestamp",
              label: "Timestamp",
              value: (l) => new Date(l.timestamp).getTime(),
              render: (l) => dateTime(l.timestamp),
            },
          ]}
        />
      </Panel>
      {personal && (
        <Panel
          title="Your recent timeline"
          description="The latest activity from your order desk."
          className="timeline-panel"
        >
          <div className="activity-feed">
            {all.slice(0, 6).map((l) => (
              <div key={l.id}>
                <div className="activity-marker">
                  <History size={15} />
                </div>
                <div>
                  <strong>
                    {l.recordId} · {l.action}
                  </strong>
                  <p>{l.summary}</p>
                  <span>{dateTime(l.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <p className="export-note">
        {isMock
          ? "Audit events live in memory for this demo."
          : "Audit records are generated by the database. Detailed values are available only to authorized administrators; personal activity shows a limited summary."}
      </p>
    </>
  );
}
