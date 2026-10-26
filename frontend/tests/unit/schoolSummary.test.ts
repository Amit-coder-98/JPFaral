import { describe, expect, it } from "vitest";
import { schoolSummary } from "../../src/utils/schoolSummary";
import { seedData } from "../../src/data/mock";
import type { Order, Student } from "../../src/types";
const students: Student[] = [
  {id:"a",name:"Student A",phone:"",standard:"5th",division:"Devi Padmini"},
  {id:"b",name:"Student B",phone:"",standard:"5th",division:"Rana Pratap"},
  {id:"c",name:"Student C",phone:"",standard:"5th",division:"Rana Pratap"},
];
const order = (studentId:string, quantity=1, overrides:Partial<Order>={}): Order => ({...seedData().orders[0],id:crypto.randomUUID(),studentId,
  studentSnapshot:undefined,status:"Confirmed",advance:100,items:[{productId:"p1",name:"मोतीचूर लाडू",price:440,quantity}],...overrides});
describe("school division dashboard and gift standings",()=>{
  it("counts every division, directory students, distinct sellers, collections, drafts and pending money",()=>{
    const summary=schoolSummary(students,[order("a",0.25),order("a",0.5,{status:"Collected",advance:220}),order("b",1),order("b",10,{status:"Draft"}),order("b",100,{deletedAt:"2026-10-16"})]);
    expect(summary.classes).toHaveLength(16);
    expect(summary.classes.find(row=>row.division==="Devi Padmini")).toMatchObject({students:1,sellers:1,orders:2,awaiting:1,collected:1,sales:330,received:320,pending:10,drafts:0});
    expect(summary.classes.find(row=>row.division==="Rana Pratap")).toMatchObject({students:2,sellers:1,orders:1,drafts:1,sales:440,pending:340});
    expect(summary.leaders.map(row=>row.student.id)).toEqual(["b","a"]);
    expect(summary.leaders[0]).toMatchObject({rank:1,sales:440,quantity:1,orders:1});
  });
  it("gives equal ranks for equal sales and does not rank students without confirmed sales",()=>{
    const summary=schoolSummary(students,[order("a"),order("b"),order("c",10,{status:"Draft"})]);
    expect(summary.leaders.map(row=>row.rank)).toEqual([1,1]);
  });
  it("uses current student division after a directory repair and handles absent historical identities",()=>{
    const summary=schoolSummary(students,[order("a",1,{studentSnapshot:{name:"Student A",standard:"8th",division:"Rani Channamma"}}),order("missing",1,{studentSnapshot:{name:"Historical",standard:"6th",division:"Mahaveer"}})]);
    expect(summary.classes.find(row=>row.division==="Devi Padmini")?.orders).toBe(1);
    expect(summary.classes.find(row=>row.division==="Mahaveer")?.orders).toBe(1);
    expect(summary.leaders).toHaveLength(1);
  });
});
