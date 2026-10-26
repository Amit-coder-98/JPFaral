import { describe,expect,it } from "vitest";
import { seedData } from "../../src/data/mock";
import { MockRepository } from "../../src/services/mockRepository";
import { isOtherStandard, validateOtherStudent } from "../../src/utils/otherStudents";
import { orderSourceLabel } from "../../src/utils/orderSource";
import { schoolSummary } from "../../src/utils/schoolSummary";
import { metrics } from "../../src/utils/calculations";
import type { OrderInput } from "../../src/types";

const repo=()=>new MockRepository({...seedData(),orders:[],payments:[],logs:[],deletedOrders:[]});
const student=()=>({name:"New learner",standard:"1st",division:"",phone:""});
const form=(studentId:string):OrderInput=>({studentId,customerName:"Parent",customerPhone:"9876543210",items:[{productId:"p1",name:"मोतीचूर लाडू",price:440,quantity:0.5}],
  advance:20,paymentMethod:"Cash",utr:"",collectionDate:"2026-10-27",collectorType:"Student",collectorName:"New learner"});
describe("saved Others students",()=>{
  it("requires a real name and 1st-4th class while phone and division remain optional",()=>{
    expect(validateOtherStudent({...student(),name:"  New   learner "})).toEqual(student());
    for(const standard of ["1st","2nd","3rd","4th"]) expect(isOtherStandard(standard)).toBe(true);
    for(const patch of [{name:""},{name:"A"},{standard:""},{standard:"5th"},{phone:"123"},{division:"x".repeat(61)}]) expect(()=>validateOtherStudent({...student(),...patch})).toThrow();
  });
  it("reuses an identity across orders and normalized retries, adding an absent phone without clearing a real phone",()=>{
    const r=repo(),before=r.getSnapshot().students.length;
    const first=r.saveOtherStudent(student(),"u2");
    expect(r.saveOtherStudent({...student(),name:" NEW   LEARNER "},"u2").id).toBe(first.id);
    expect(r.saveOtherStudent({...student(),phone:"9876543210"},"u2").id).toBe(first.id);
    expect(r.saveOtherStudent(student(),"u2").phone).toBe("9876543210");
    r.saveOrder(form(first.id),"u2");r.saveOrder(form(first.id),"u2");
    expect(r.getSnapshot().students).toHaveLength(before+1);
    expect(r.getSnapshot().orders.every(order=>order.studentId===first.id)).toBe(true);
    expect(new Set(r.getSnapshot().orders.map(order=>order.number)).size).toBe(2);
    expect(()=>r.saveOtherStudent(student(),"unauthorized")).toThrow("authorized");
  });
  it("keeps namesakes distinguishable by class/division/phone and asks for selection when a name is ambiguous",()=>{
    const r=repo();
    const a=r.saveOtherStudent({...student(),phone:"9876543210"},"u2"),b=r.saveOtherStudent({...student(),phone:"9876543211"},"u2");
    expect(a.id).not.toBe(b.id);
    expect(()=>r.saveOtherStudent(student(),"u2")).toThrow("More than one student");
    expect(r.saveOtherStudent({...student(),standard:"2nd"},"u2").id).not.toBe(a.id);
    expect(r.saveOtherStudent({...student(),division:"B"},"u2").id).not.toBe(a.id);
  });
  it("counts junior classes and Others totals once per order, separates Stall, and qualifies saved junior students for standings",()=>{
    const r=repo(),first=r.saveOtherStudent(student(),"u2");
    const confirmed=r.saveOrder(form(first.id),"u2");
    r.saveOrder({...form(first.id),advance:0},"u2","Draft");
    const other=r.saveOtherStudent({...student(),name:"Second learner",standard:"4th",division:"B"},"u2");
    r.saveOrder({...form(other.id),items:[{...form(other.id).items[0],quantity:1}]},"u2");
    const stall=r.saveOrder({...form(""),collectorType:"Customer"},"u2");
    const summary=schoolSummary(r.getSnapshot().students,r.getSnapshot().orders);
    expect(summary.classes.find(group=>group.standard==="1st")).toMatchObject({students:1,sellers:1,orders:1,drafts:1,sales:220,received:20,pending:200});
    expect(summary.sources.map(group=>group.standard)).toEqual(["Stall","Others"]);
    expect(summary.sources[1]).toMatchObject({students:2,sellers:2,orders:2,drafts:1,sales:660,received:40,pending:620});
    expect(summary.sources[0]).toMatchObject({orders:1,sales:220,received:20,pending:200});
    expect(summary.leaders.map(leader=>leader.student.id)).toEqual([other.id,first.id]);
    expect(orderSourceLabel(confirmed)).toBe("Others");expect(orderSourceLabel(stall)).toBe("Stall");
    expect(metrics(r.getSnapshot().orders,r.getSnapshot().payments)).toMatchObject({count:3,sales:880});
  });
  it("retains junior historical bill identity on edits and excludes deleted orders from every dashboard source total",()=>{
    const r=repo(),first=r.saveOtherStudent({...student(),division:"A"},"u2");
    const order=r.saveOrder({...form(first.id),advance:0},"u2");
    const changed=r.saveOrder({...order,customerName:"Corrected parent"},"u2","Confirmed",order.id);
    expect(changed.studentSnapshot).toEqual({name:first.name,standard:"1st",division:"A"});
    r.deleteOrders({orders:[{id:changed.id,version:changed.version!}],reason:"Test only",requestId:crypto.randomUUID()},"u1");
    const summary=schoolSummary(r.getSnapshot().students,[...r.getSnapshot().orders,...r.getSnapshot().deletedOrders!]);
    expect(summary.sources.every(group=>group.orders===0 && group.sales===0)).toBe(true);expect(summary.leaders).toHaveLength(0);
  });
});
