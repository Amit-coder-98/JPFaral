import { useState } from "react";
import { useApp } from "../../app/Provider";
import { Button, DataTable, Panel } from "../ui";
import { schoolSummary } from "../../utils/schoolSummary";
import { money } from "../../utils/format";
import { downloadCSV } from "../../utils/export";
import { isOtherStandard, otherStandards } from "../../utils/otherStudents";

export function SchoolOverview() {
  const { data } = useApp();
  const [standard, setStandard] = useState("");
  const summary = schoolSummary(data.students, data.orders);
  const classes = [...summary.classes,...summary.sources].filter(group => !standard || group.standard === standard);
  const leaders = summary.leaders.filter(leader => !standard || (standard === "Others" ? isOtherStandard(leader.student.standard) : leader.student.standard === standard));
  return <div className="school-overview">
    <Panel title="Class & division summary" description="School-wide totals. Participating students have at least one confirmed order. Deleted orders are excluded."
      actions={<div className="school-summary-actions"><select aria-label="Dashboard standard" value={standard} onChange={event => setStandard(event.target.value)}><option value="">All standards & sources</option>{[...otherStandards,...new Set(summary.classes.map(group=>group.standard).filter(value=>!isOtherStandard(value))),"Stall","Others"].map(value => <option key={value}>{value}</option>)}</select>
        <Button variant="secondary" onClick={() => downloadCSV("class-division-summary.csv", ["Standard","Division","Students","Participating students","Orders","Awaiting collection","Collected","Drafts","Sales","Received","Outstanding"], classes.map(group => [group.standard,group.division,group.students,group.sellers,group.orders,group.awaiting,group.collected,group.drafts,group.sales,group.received,group.pending]))}>Export CSV</Button></div>}>
      <div className="order-source-totals">{summary.sources.map(source=><button type="button" key={source.standard} onClick={()=>setStandard(source.standard)} aria-pressed={standard===source.standard}>
        <strong>{source.standard}</strong><span><b>{source.orders}</b> {source.orders===1 ? "order" : "orders"} · {source.drafts} drafts</span><small>{source.standard==="Others" ? `${source.students} ${source.students===1 ? "student" : "students"} · ` : ""}{source.awaiting} awaiting collection · {money(source.sales)} sales · {money(source.pending)} outstanding</small>
      </button>)}</div>
      <DataTable rows={classes.map(group => ({ ...group, id: `${group.standard}-${group.division}` }))} pageSize={6} columns={[
        { key: "class", label: "Class / division", render: group => <div className="cell-stack"><strong>{group.standard}</strong><span>{group.division || "Division not supplied"}</span></div> },
        { key: "students", label: "Students", render: group => group.students },
        { key: "sellers", label: "Participating", render: group => group.sellers },
        { key: "orders", label: "Orders", render: group => group.orders },
        { key: "awaiting", label: "Awaiting collection", render: group => group.awaiting },
        { key: "collected", label: "Collected", render: group => group.collected },
        { key: "drafts", label: "Drafts", render: group => group.drafts },
        { key: "sales", label: "Sales", render: group => money(group.sales) },
        { key: "received", label: "Received", render: group => money(group.received) },
        { key: "pending", label: "Outstanding", render: group => money(group.pending) },
      ]} />
    </Panel>
    <Panel title="Student sales leaderboard" description="Ranked by total sales value across all staff. Ties share a rank; drafts and deleted orders do not qualify. Final prizes can be decided after collections."
      actions={<div className="school-summary-actions">
        <Button variant="secondary" onClick={() => downloadCSV("student-sales-leaderboard.csv", ["Rank","Student","Standard","Division","Orders","Collected","Sales","Quantity kg","Outstanding"], leaders.map(leader => [leader.rank,leader.student.name,leader.student.standard,leader.student.division,leader.orders,leader.collected,leader.sales,leader.quantity,leader.pending]))}>Export rankings</Button></div>}>
      <DataTable rows={leaders.map(leader => ({ ...leader, id: leader.student.id }))} pageSize={5} columns={[
        { key: "rank", label: "Overall rank", render: leader => <strong className={leader.rank === 1 ? "text-green" : ""}>#{leader.rank}</strong> },
        { key: "student", label: "Student", render: leader => <div className="cell-stack"><strong>{leader.student.name}</strong><span>{[leader.student.standard,leader.student.division].filter(Boolean).join(" · ")}</span></div> },
        { key: "orders", label: "Orders", render: leader => leader.orders },
        { key: "collected", label: "Collected", render: leader => leader.collected },
        { key: "sales", label: "Sales value", render: leader => money(leader.sales) },
        { key: "quantity", label: "Quantity", render: leader => `${leader.quantity} kg` },
        { key: "pending", label: "Outstanding", render: leader => money(leader.pending) },
      ]} />
    </Panel>
  </div>;
}
