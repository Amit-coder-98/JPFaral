import type { Order, Student } from "../types";
import { divisions } from "../data/reference";
import { orderTotal } from "./calculations";
import { isStallOrder } from "./orderSource";
import { isOtherStandard, otherStandards } from "./otherStudents";

export type RankingMetric = "sales" | "collected" | "quantity";
export function schoolSummary(students: Student[], orders: Order[], metric: RankingMetric = "sales") {
  const juniorDivisions = otherStandards.map(standard => [standard,[...new Set([
    ...students.filter(student=>student.standard===standard).map(student=>student.division),
    ...orders.filter(order=>!order.deletedAt && order.studentSnapshot?.standard===standard).map(order=>order.studentSnapshot!.division),
  ])]] as const).map(([standard,names])=>[standard,names.length ? names : [""]] as const);
  const classes = [...juniorDivisions,...Object.entries(divisions)].flatMap(([standard, names]) => names.map(division => ({
    standard, division, students: students.filter(student => student.standard === standard && student.division === division).length,
    sellers: new Set<string>(), orders: 0, drafts: 0, awaiting: 0, collected: 0, salesPaise: 0, receivedPaise: 0,
  })));
  const sources = [
    {standard:"Stall",division:"Direct customer total",students:0},
    {standard:"Others",division:"1st–4th total",students:students.filter(student=>isOtherStandard(student.standard)).length},
  ].map(source=>({...source,sellers:new Set<string>(),orders:0,drafts:0,awaiting:0,collected:0,salesPaise:0,receivedPaise:0}));
  const leaders = new Map<string, { student: Student; orders: number; collected: number; salesPaise: number; quarters: number; receivedPaise: number }>();
  for (const order of orders.filter(order => !order.deletedAt)) {
    const student = students.find(student => student.id === order.studentId);
    const identity = student ?? order.studentSnapshot;
    const group = classes.find(group => group.standard === identity?.standard && group.division === identity?.division);
    const source = isStallOrder(order) ? sources[0] : isOtherStandard(identity?.standard) ? sources[1] : undefined;
    const groups = [group,source].filter((value):value is typeof classes[number]=>!!value);
    if (order.status === "Draft") { groups.forEach(group=>group.drafts++); continue; }
    const salesPaise = Math.round(orderTotal(order) * 100);
    const receivedPaise = Math.round(order.advance * 100);
    for (const group of groups) {
      group.orders++; group.salesPaise += salesPaise; group.receivedPaise += receivedPaise;
      if (student) group.sellers.add(student.id);
      if (order.status === "Collected") group.collected++; else group.awaiting++;
    }
    if (!student) continue;
    const leader = leaders.get(student.id) ?? { student, orders: 0, collected: 0, salesPaise: 0, quarters: 0, receivedPaise: 0 };
    leader.orders++; leader.salesPaise += salesPaise; leader.receivedPaise += receivedPaise;
    leader.quarters += order.items.reduce((sum, item) => sum + Math.round(item.quantity * 4), 0);
    if (order.status === "Collected") leader.collected++;
    leaders.set(student.id, leader);
  }
  const score = (leader: typeof leaders extends Map<string, infer T> ? T : never) => metric === "sales" ? leader.salesPaise : metric === "collected" ? leader.collected : leader.quarters;
  const sorted = [...leaders.values()].filter(leader => score(leader) > 0).sort((a,b) => score(b) - score(a) || a.student.name.localeCompare(b.student.name) || a.student.id.localeCompare(b.student.id));
  let rank = 0;
  const finished = (groups:typeof classes) => groups.map(({sellers,salesPaise,receivedPaise,...group})=>({...group,sellers:sellers.size,sales:salesPaise/100,received:receivedPaise/100,pending:(salesPaise-receivedPaise)/100}));
  return {
    classes: finished(classes),
    sources: finished(sources),
    leaders: sorted.map((leader, index) => { if (!index || score(leader) !== score(sorted[index - 1])) rank = index + 1;
      return { ...leader, rank, sales: leader.salesPaise / 100, quantity: leader.quarters / 4, received: leader.receivedPaise / 100, pending: (leader.salesPaise - leader.receivedPaise) / 100 }; }),
  };
}
