import { describe, expect, it } from "vitest";
import { seedData } from "../../src/data/mock";
import { MockRepository } from "../../src/services/mockRepository";
import { activeOrderSerials, balance } from "../../src/utils/calculations";
import { orderStatusLabel } from "../../src/utils/orderStatus";
import { moneyInPaise } from "../../src/utils/pricing";
import type { CollectionInput, OrderInput } from "../../src/types";

const form = (advance = 20): OrderInput => ({ studentId:"s1", customerName:"Collection customer",customerPhone:"9876543210",
  items:[{productId:"p1",name:"मोतीचूर लाडू",price:440,quantity:0.25}],advance,paymentMethod:"Cash",utr:"",
  collectionDate:"2026-10-20",collectorType:"Student",collectorName:"Student" });
const repository = () => new MockRepository({...seedData(),orders:[],payments:[],logs:[],deletedOrders:[]});
const request = (repo: MockRepository, id: string, overrides: Partial<CollectionInput> = {}): CollectionInput => {
  const order=repo.getSnapshot().orders.find(order=>order.id===id)!;
  return {orderId:id,version:order.version!,amount:balance(order),method:"Cash",utr:"",requestId:crypto.randomUUID(),...overrides};
};
describe("payment at collection",()=>{
  it("converts decimal payment amounts safely, including the numeric capacity and invalid fractions",()=>{
    expect(moneyInPaise(1.1)).toBe(110); expect(moneyInPaise(0.29)).toBe(29);
    expect(moneyInPaise(9999999999.99)).toBe(999999999999);
    for(const value of [NaN,Infinity,-1,0.001,10000000000])expect(moneyInPaise(value)).toBeNull();
  });
  it("settles the remaining amount directly from Confirmed, retains the advance and retries once",()=>{
    const repo=repository(), order=repo.saveOrder(form(),"u1"), original=structuredClone(repo.getSnapshot().payments);
    const input=request(repo,order.id);
    repo.collectOrder(input,"u2");
    const state=repo.getSnapshot(), collected=state.orders[0];
    expect(collected.status).toBe("Collected"); expect(balance(collected)).toBe(0);
    expect(state.payments).toHaveLength(2); expect(state.payments[0]).toEqual(original[0]);
    expect(state.payments[1]).toMatchObject({amount:90,receivedBy:"u2",kind:"receipt"});
    const logs=state.logs.length;
    repo.collectOrder(input,"u2"); expect(repo.getSnapshot().payments).toHaveLength(2); expect(repo.getSnapshot().logs).toHaveLength(logs);
    expect(()=>repo.collectOrder({...input,amount:89},"u2")).toThrow("already been used");
  });
  it("does not create an additional payment for fully paid orders",()=>{
    const repo=repository(), order=repo.saveOrder(form(110),"u1"), payments=structuredClone(repo.getSnapshot().payments);
    repo.collectOrder(request(repo,order.id),"u1"); expect(repo.getSnapshot().payments).toEqual(payments);
  });
  it("rejects partial, invalid, nonfinite and excessive amounts without changes",()=>{
    const repo=repository(), order=repo.saveOrder(form(),"u1"), before=repo.getSnapshot();
    for(const amount of [0,10,-1,90.001,NaN,Infinity,91]) expect(()=>repo.collectOrder(request(repo,order.id,{amount}),"u1")).toThrow();
    expect(repo.getSnapshot()).toBe(before);
    expect(()=>repo.setOrderStatus(order.id,"Collected","u1")).toThrow("balance");
    expect(()=>repo.setOrderStatus(order.id,"Ready","u1")).toThrow("Invalid");
  });
  it("rejects stale requests, inactive actors, drafts, deleted orders and missing online references",()=>{
    const repo=repository(), order=repo.saveOrder(form(),"u1");
    expect(()=>repo.collectOrder(request(repo,order.id,{version:0}),"u1")).toThrow("changed");
    expect(()=>repo.collectOrder(request(repo,order.id),"missing")).toThrow("authorized");
    expect(()=>repo.collectOrder(request(repo,order.id,{method:"Online"}),"u1")).toThrow("UTR");
    const draft=repo.saveOrder(form(0),"u1","Draft");
    expect(()=>repo.collectOrder(request(repo,draft.id),"u1")).toThrow("confirmed");
    repo.deleteOrders({orders:[{id:order.id,version:order.version!}],reason:"Testing archive",requestId:crypto.randomUUID(),testCleanup:true},"u1");
    expect(()=>repo.collectOrder({orderId:order.id,version:1,amount:90,method:"Cash",utr:"",requestId:crypto.randomUUID()},"u1")).toThrow("deleted");
  });
  it("continues to display legacy Ready snapshots as Confirmed",()=>{ expect(orderStatusLabel("Ready")).toBe("Confirmed"); });
  it("starts receipt and list numbers at one after deleting all active test orders without reusing internal references",()=>{
    const repo=repository(), first=repo.saveOrder(form(0),"u1"), second=repo.saveOrder(form(0),"u1");
    repo.deleteOrders({orders:[first,second].map(order=>({id:order.id,version:order.version!})),reason:"Delete test entries",requestId:crypto.randomUUID()},"u1");
    const next=repo.saveOrder(form(0),"u1");
    expect(next.number).toBe("JP-0001");
    expect(next.reference).toBe("JP-0003");
    expect(next.id).not.toBe(first.id);
    expect(repo.getSnapshot().deletedOrders!.map(order => order.number)).toEqual(["JP-0001", "JP-0002"]);
    expect(activeOrderSerials([...repo.getSnapshot().orders,...repo.getSnapshot().deletedOrders!]).get(next.id)).toBe(1);
    expect(activeOrderSerials(repo.getSnapshot().orders).size).toBe(1);
  });
  it("reuses a freed middle receipt number without changing other active receipts or their payment/audit identity",()=>{
    const repo=repository(), first=repo.saveOrder(form(10),"u1"), middle=repo.saveOrder(form(0),"u1"), last=repo.saveOrder(form(0),"u1");
    repo.deleteOrders({orders:[{id:middle.id,version:middle.version!}],reason:"Duplicate test entry",requestId:crypto.randomUUID()},"u1");
    const next=repo.saveOrder(form(20),"u1");
    expect(next.number).toBe(middle.number); expect(next.reference).toBe("JP-0004");
    expect(new Set(repo.getSnapshot().orders.map(order=>order.number)).size).toBe(3);
    expect(repo.getSnapshot().orders.find(order=>order.id===first.id)?.number).toBe(first.number);
    expect(repo.getSnapshot().orders.find(order=>order.id===last.id)?.number).toBe(last.number);
    expect(repo.getSnapshot().payments.filter(payment=>payment.orderId===first.id)[0].amount).toBe(10);
    expect(repo.getSnapshot().payments.filter(payment=>payment.orderId===next.id)[0].amount).toBe(20);
    expect(repo.getSnapshot().logs.filter(log=>log.orderId===next.id).every(log=>log.recordId===next.number)).toBe(true);
    expect(repo.getSnapshot().logs.find(log=>log.action==="Deleted"&&log.orderId===middle.id)).toBeTruthy();
  });
});
