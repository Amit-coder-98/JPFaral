import { describe, expect, it } from "vitest";
import { seedData } from "../../src/data/mock";
import { MockRepository } from "../../src/services/mockRepository";
import { orderSchema } from "../../src/services/validation";
import { balance, metrics, orderTotal } from "../../src/utils/calculations";
import { cookingPlan } from "../../src/utils/cookingPlan";
import { isStallOrder, orderSourceLabel } from "../../src/utils/orderSource";
import { schoolSummary } from "../../src/utils/schoolSummary";
import type { OrderInput } from "../../src/types";

const input = (): OrderInput => ({studentId:"",customerName:"Walk-in customer",customerPhone:"9876543210",
  items:[{productId:"p1",name:"मोतीचूर लाडू",price:440,quantity:0.75}],advance:100,paymentMethod:"Cash",utr:"",
  collectionDate:"2026-10-25",collectorType:"Customer",collectorName:"Walk-in customer"});
const repository = () => new MockRepository({...seedData(),orders:[],payments:[],logs:[],deletedOrders:[]});

describe("Stall orders",()=>{
  it("accepts a direct customer without a student and still requires customer, collector and payment details",()=>{
    expect(orderSchema.safeParse(input()).success).toBe(true);
    for(const patch of [{collectorType:"Student"},{customerName:""},{customerPhone:""},{customerPhone:"123"},
      {collectorName:""},{paymentMethod:"Online",utr:""},{advance:331}])
      expect(orderSchema.safeParse({...input(),...patch}).success).toBe(false);
    expect(orderSchema.safeParse({...input(),items:[{...input().items[0],quantity:0.3}]}).success).toBe(false);
    expect(isStallOrder(input())).toBe(true);
    expect(orderSourceLabel({...input(),studentId:"s1"})).toBe("Student");
    expect(isStallOrder({...input(),collectorType:"Student"})).toBe(false);
  });

  it("saves and edits the same receipt without adding a directory student or replacing recorded advances",()=>{
    const repo=repository(), students=structuredClone(repo.getSnapshot().students);
    const order=repo.saveOrder(input(),"u2");
    expect(orderTotal(order)).toBe(330); expect(balance(order)).toBe(230);
    const payments=structuredClone(repo.getSnapshot().payments);
    const edited=repo.saveOrder({...order,customerName:"Corrected customer"},"u1","Confirmed",order.id);
    expect(edited).toMatchObject({id:order.id,number:order.number,studentId:"",collectorType:"Customer"});
    expect(edited.studentSnapshot).toBeUndefined();
    expect(repo.getSnapshot().payments).toEqual(payments);
    expect(repo.getSnapshot().students).toEqual(students);
    expect(()=>repo.saveOrder({...edited,advance:200},"u1","Confirmed",order.id)).toThrow("immutable");
    expect(()=>repo.saveOrder(input(),"unknown-user")).toThrow();
  });

  it("resumes an incomplete Stall draft, preserving its source and receipt",()=>{
    const repo=repository();
    const draft=repo.saveOrder({...input(),customerName:"",customerPhone:"",collectorName:"",advance:0},"u2","Draft");
    expect(isStallOrder(draft)).toBe(true);
    expect(metrics(repo.getSnapshot().orders,repo.getSnapshot().payments).count).toBe(0);
    const order=repo.saveOrder({...draft,...input()},"u2","Confirmed",draft.id);
    expect(order.number).toBe(draft.number); expect(isStallOrder(order)).toBe(true);
    expect(repo.getSnapshot().payments).toHaveLength(1);
  });

  it("includes Stall in sales and cooking demand without awarding school students or divisions its sales",()=>{
    const repo=repository(), order=repo.saveOrder(input(),"u2"), state=repo.getSnapshot();
    expect(metrics(state.orders,state.payments)).toMatchObject({count:1,sales:330,collected:100,pending:230});
    const plan=cookingPlan(state.orders,state.products,{basis:"collection",from:order.collectionDate,to:order.collectionDate,category:"",search:""});
    expect(plan.totals).toMatchObject({orders:1,pendingKg:0.75});
    const summary=schoolSummary(state.students,state.orders);
    expect(summary.leaders).toHaveLength(0);
    expect(summary.classes.every(group=>group.orders===0 && group.sales===0)).toBe(true);
  });

  it("records a missed advance and settles the balance for Stall using the same immutable ledger",()=>{
    const repo=repository(), order=repo.saveOrder(input(),"u2");
    repo.recordPayment({orderId:order.id,amount:30,method:"Online",utr:"STALL-ADVANCE",kind:"receipt",requestId:crypto.randomUUID()},"u2");
    const before=structuredClone(repo.getSnapshot().payments), current=repo.getSnapshot().orders[0];
    repo.collectOrder({orderId:order.id,version:current.version!,amount:balance(current),method:"Cash",utr:"",requestId:crypto.randomUUID()},"u2");
    expect(repo.getSnapshot().orders[0]).toMatchObject({status:"Collected",studentId:"",number:order.number});
    expect(balance(repo.getSnapshot().orders[0])).toBe(0);
    expect(repo.getSnapshot().payments).toHaveLength(3);
    for(const payment of before) expect(repo.getSnapshot().payments).toContainEqual(payment);
    expect(repo.getSnapshot().payments.reduce((sum,payment)=>sum+payment.amount,0)).toBe(330);
  });
});
