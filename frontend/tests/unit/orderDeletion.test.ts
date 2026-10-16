import { describe, expect, it } from "vitest";
import { seedData } from "../../src/data/mock";
import { MockRepository } from "../../src/services/mockRepository";
import { ledgerPayments, metrics } from "../../src/utils/calculations";
import { orderDeletionBlock, validateOrderDeletion } from "../../src/utils/orderDeletion";
import type { Order, OrderInput } from "../../src/types";

// Legacy snapshots may be collected with outstanding balances before the checkout migration.
function legacyStatus(repo: MockRepository, id: string, status: Order["status"]) {
 const order=repo.getSnapshot().orders.find(order=>order.id===id)!;
 Object.assign(order,{status,version:(order.version ?? 1)+1});
}
function fixture() {
  const initial = seedData();
  return new MockRepository({ ...initial, orders: [], payments: [], logs: [], deletedOrders: [] });
}
const input = (advance = 0): OrderInput => ({
  studentId: "s1", customerName: "Test Customer", customerPhone: "9876543210",
  items: [{ productId: "p1", name: "मोतीचूर लाडू", price: 440, quantity: 0.5 }],
  advance, paymentMethod: "Cash", utr: "", collectionDate: "2026-10-20",
  collectorType: "Student", collectorName: "Student",
});
const request = (orders: Order[], reason = "Test order entered by mistake") => ({
  orders: orders.map((order) => ({ id: order.id, version: order.version ?? 1 })), reason, requestId: crypto.randomUUID(),
});

describe("reviewed order deletion", () => {
  it("removes active totals, preserves bill snapshots and audit reasons, and never reuses a number", () => {
    const repo = fixture();
    const order = repo.saveOrder(input(), "u1");
    const before = structuredClone(order);
    repo.deleteOrders(request([order]), "u1");
    const state = repo.getSnapshot();
    expect(state.orders).toHaveLength(0);
    expect(metrics(state.orders, state.payments)).toMatchObject({ count: 0, sales: 0, pending: 0 });
    expect(state.deletedOrders![0]).toMatchObject({ id: before.id, number: before.number, items: before.items, deletedBy: "u1" });
    expect(state.logs[0]).toMatchObject({ action: "Deleted", recordId: before.number, userId: "u1" });
    const next=repo.saveOrder(input(), "u1");
    expect(next.number).toBe(order.number);
    expect(next.reference).not.toBe(order.reference);
    expect(next.id).not.toBe(order.id);
    expect(() => repo.saveOrder(input(), "u1", "Confirmed", order.id)).toThrow("Deleted");
  });
  it("requires an active Super Admin even for a staff-owned draft", () => {
    const repo = fixture();
    const draft = repo.saveOrder(input(), "u2", "Draft");
    expect(() => repo.deleteOrders(request([draft]), "u2")).toThrow("Super Admin");
    const admin = repo.getSnapshot().staff.find((user) => user.id === "u1")!;
    const snapshot = { ...repo.getSnapshot(), staff: repo.getSnapshot().staff.map((user) => user.id === admin.id ? {...user,active:false} : user) };
    expect(() => new MockRepository(snapshot).deleteOrders(request([draft]), "u1")).toThrow("Super Admin");
    expect(repo.getSnapshot().orders).toHaveLength(1);
  });
  it("rejects a paid, collected or stale target atomically", () => {
    const repo = fixture();
    const good = repo.saveOrder(input(), "u1");
    const paid = repo.saveOrder(input(10), "u1");
    expect(() => repo.deleteOrders(request([good, paid]), "u1")).toThrow("Refund");
    expect(repo.getSnapshot().orders).toHaveLength(2);
    const stale = request([good]);
    legacyStatus(repo, good.id, "Ready");
    expect(() => repo.deleteOrders(stale, "u1")).toThrow("changed");
    legacyStatus(repo, good.id, "Collected");
    expect(orderDeletionBlock(repo.getSnapshot().orders.find((order) => order.id === good.id)!)).toContain("Collected");
  });
  it("keeps every receipt and refund after a fully refunded test order is removed", () => {
    const repo = fixture();
    const paid = repo.saveOrder(input(10), "u1");
    repo.recordPayment({ orderId: paid.id, amount: 10, method: "Cash", utr: "", kind: "refund", requestId: crypto.randomUUID() }, "u1");
    const order = repo.getSnapshot().orders[0];
    const payments = structuredClone(repo.getSnapshot().payments);
    repo.deleteOrders(request([order]), "u1");
    expect(repo.getSnapshot().payments).toEqual(payments);
    expect(repo.getSnapshot().deletedOrders![0].advance).toBe(0);
  });
  it("requires explicit admin confirmation for collected tests and records the override", () => {
    const repo = fixture();
    const order = repo.saveOrder(input(), "u1");
    legacyStatus(repo, order.id, "Collected");
    const batch = request(repo.getSnapshot().orders);
    expect(() => repo.deleteOrders(batch, "u1")).toThrow("confirmation");
    expect(() => repo.deleteOrders({...batch,allowCollected:true}, "u2")).toThrow("Super Admin");
    repo.deleteOrders({...batch,allowCollected:true}, "u1");
    expect(repo.getSnapshot().orders).toHaveLength(0);
    expect(repo.getSnapshot().deletedOrders![0]).toMatchObject({status:"Collected",deletionCollectedOverride:true});
    expect(() => repo.deleteOrders(batch, "u1")).toThrow("already been used");
  });
  it("collected confirmation does not waive the received-payment rule", () => {
    const repo = fixture();
    const order = repo.saveOrder(input(10), "u1");
    legacyStatus(repo, order.id, "Collected");
    expect(() => repo.deleteOrders({...request(repo.getSnapshot().orders),allowCollected:true}, "u1")).toThrow("Refund");
    expect(repo.getSnapshot().orders).toHaveLength(1);
  });
  it("archives paid collected tests without a refund, preserves history and separates test ledger totals", () => {
    const repo = fixture();
    const test = repo.saveOrder(input(100), "u1");
    const real = repo.saveOrder(input(10), "u1");
    legacyStatus(repo, test.id, "Collected");
    const order = repo.getSnapshot().orders.find(o => o.id === test.id)!;
    const payments = structuredClone(repo.getSnapshot().payments);
    const batch = {...request([order]), testCleanup:true};
    expect(() => repo.deleteOrders(batch, "u2")).toThrow("Super Admin");
    repo.deleteOrders(batch, "u1");
    const state = repo.getSnapshot();
    expect(state.payments).toEqual(payments);
    expect(state.deletedOrders![0]).toMatchObject({items:test.items,advance:100,status:"Collected",deletionTestData:true,deletionCollectedOverride:true});
    expect(state.payments.some(p => p.kind === "refund")).toBe(false);
    expect(metrics(state.orders,state.payments)).toMatchObject({count:1,collected:10});
    expect(ledgerPayments(state.payments,state.deletedOrders!)).toEqual(payments.filter(p => p.orderId === real.id));
    expect(ledgerPayments(state.payments,state.deletedOrders!,true)).toEqual(payments.filter(p => p.orderId === test.id));
    const events=state.logs.length;
    repo.deleteOrders(batch,"u1");
    expect(repo.getSnapshot().logs).toHaveLength(events);
    expect(() => repo.deleteOrders({...batch,testCleanup:false},"u1")).toThrow("already been used");
  });
  it("test cleanup still rejects stale targets atomically and invalid confirmation values", () => {
    const repo=fixture();
    const orders=[repo.saveOrder(input(10),"u1"),repo.saveOrder(input(),"u1")];
    const batch={...request(orders),testCleanup:true};
    repo.recordPayment({orderId:orders[0].id,amount:10,method:"Cash",utr:"",kind:"receipt",requestId:crypto.randomUUID()},"u1");
    expect(() => repo.deleteOrders(batch,"u1")).toThrow("changed");
    expect(repo.getSnapshot().orders).toHaveLength(2);
    expect(() => validateOrderDeletion({...batch,testCleanup:"true" as never})).toThrow("boolean");
  });
  it("retries the same batch without duplicate events and rejects a changed retry", () => {
    const repo = fixture();
    const orders = [repo.saveOrder(input(), "u1"), repo.saveOrder(input(), "u1")];
    const batch = request(orders);
    repo.deleteOrders(batch, "u1");
    const logs = repo.getSnapshot().logs.length;
    repo.deleteOrders({ ...batch, orders: [...batch.orders].reverse() }, "u1");
    expect(repo.getSnapshot().logs).toHaveLength(logs);
    expect(() => repo.deleteOrders({ ...batch, reason: "A different reason" }, "u1")).toThrow("already been used");
  });
  it("requires a reason, distinct versioned targets and no more than 100 selected rows", () => {
    const base = { orders: [{ id: "order", version: 1 }], reason: "Test", requestId: crypto.randomUUID() };
    expect(() => validateOrderDeletion(base)).not.toThrow();
    for (const bad of [
      {...base,reason:"  "}, {...base,reason:"x".repeat(501)}, {...base,orders:[]},
      {...base,orders:[base.orders[0],base.orders[0]]}, {...base,orders:[{id:"order",version:0}]},
      {...base,orders:Array.from({length:101},(_,i)=>({id:String(i),version:1}))},
    ]) expect(() => validateOrderDeletion(bad)).toThrow();
  });
});
