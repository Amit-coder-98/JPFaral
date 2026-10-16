import { randomUUID } from 'node:crypto';

// Registered after the pre-upgrade tests: exercise upgrading real legacy Ready
// orders and then the complete final collection/payment authorization surface.
export function collectionCases({ test, assert, db, actor, staff, inactive, save, input, productId, row, pay, asUser, migration, cleanup, targets }) {
  const checkout = async (id, amount, options={}) => asUser(options.actor ?? staff,
    'select public.collect_order($1,$2,$3,$4,$5,$6)',
    [id, options.version ?? (await row(id)).version, options.request ?? randomUUID(), amount, options.method ?? 'Cash', options.reference ?? '']);
  const make = async (advance=10,status='Confirmed') => {
    const price=Number((await db().query('select price_per_kg from public.products where id=$1',[productId])).rows[0].price_per_kg);
    return save(input({items:[{productId,price,quantity:1}],advance}),staff,null,null,status);
  };
  const receipts = async id => (await db().query('select * from public.payments where order_id=$1 order by id',[id])).rows;
  test('collection migration preserves legacy Ready orders, historical snapshots and existing ledger', async()=>{
    const id=await make();
    await asUser(staff,"select public.set_order_status($1,'Ready',$2)",[id,(await row(id)).version]);
    const original=await row(id), ledger=await receipts(id);
    await db().query(await migration());
    assert.deepEqual(await row(id),original); assert.deepEqual(await receipts(id),ledger);
    await checkout(id,Number(original.total_amount)-10);
    assert.equal((await row(id)).status,'Collected');
    assert.equal((await receipts(id)).length,2);
  });
  test('confirmed orders collect directly and append only the remaining receipt, with actor-derived audit',async()=>{
    const id=await make(20), original=await row(id), ledger=await receipts(id);
    const request=randomUUID();
    const options={request,version:original.version,method:'Online',reference:' checkout-'+request+' '};
    await checkout(id,Number(original.total_amount)-20,options);
    const after=await row(id), all=await receipts(id);
    assert.equal(after.status,'Collected'); assert.equal(after.order_number,original.order_number);
    assert.deepEqual(all.find(payment=>payment.id===ledger[0].id),ledger[0]);
    const last=all.find(payment=>payment.request_id===request);
    assert.equal(last.received_by,staff); assert.equal(last.reference,'checkout-'+request);
    assert.equal(Number(last.amount),Number(original.total_amount)-20);
    const logs=(await db().query('select * from public.audit_logs where record_id=$1 and updated_values->>\'status\'=\'Collected\'',[id])).rows;
    assert.equal(logs.at(-1).actor_id,staff);
    const version=after.version;
    await checkout(id,Number(original.total_amount)-20,options);
    assert.equal((await receipts(id)).length,2); assert.equal((await row(id)).version,version);
    await assert.rejects(checkout(id,1,options),/already been used/);
    await assert.rejects(checkout(id,Number(original.total_amount)-20,{...options,actor}),/already been used/);
  });
  test('fully paid orders collect without adding zero-value or duplicate receipts',async()=>{
    const id=await make(0), header=await row(id);
    await pay(id,header.total_amount);
    const ledger=await receipts(id);
    await checkout(id,0);
    assert.equal((await row(id)).status,'Collected'); assert.deepEqual(await receipts(id),ledger);
  });
  test('invalid/partial/overpaid/nonfinite collection payments roll back handover, receipts and retry records',async()=>{
    const id=await make(0), before=await row(id), ledger=await receipts(id);
    for(const amount of [0,-1,0.001,'NaN','Infinity',Number(before.total_amount)+1]) {
      const request=randomUUID();
      await assert.rejects(checkout(id,amount,{request}),/Invalid|balance/);
      assert.deepEqual(await row(id),before); assert.deepEqual(await receipts(id),ledger);
      assert.equal((await db().query('select count(*) from private.order_collection_requests where request_id=$1',[request])).rows[0].count,'0');
    }
    await assert.rejects(checkout(id,Number(before.total_amount),{method:'Online'}),/UTR/);
    await assert.rejects(checkout(id,Number(before.total_amount),{method:'Cheque'}),/Invalid/);
  });
  test('collection enforces inactive/anonymous authorization, stale versions and private table protection',async()=>{
    const id=await make(0), before=await row(id);
    await assert.rejects(checkout(id,Number(before.total_amount),{actor:inactive}),/authorized/);
    await assert.rejects(asUser(null,'select public.collect_order($1,$2,$3,0)',[id,before.version,randomUUID()],'anon'),/permission denied/);
    await pay(id,1);
    await assert.rejects(checkout(id,Number(before.total_amount)-1,{version:before.version}),/changed/);
    await assert.rejects(asUser(actor,'select * from private.order_collection_requests'),/permission denied/);
    await assert.rejects(asUser(actor,'select private.immutable_collection_request()'),/permission denied/);
  });
  test('retired Ready transitions, drafts, deleted orders and unpaid status-only handovers are blocked',async()=>{
    const id=await make(0), before=await row(id);
    await assert.rejects(asUser(staff,"select public.set_order_status($1,'Ready',$2)",[id,before.version]),/Invalid/);
    await assert.rejects(asUser(staff,"select public.set_order_status($1,'Collected',$2)",[id,before.version]),/balance/);
    await assert.rejects(db().query("update public.orders set status='Ready' where id=$1",[id]),/removed/);
    const draft=await make(0,'Draft');
    await assert.rejects(checkout(draft,0),/confirmed/);
    const removed=await make(0);
    await cleanup(await targets([removed]));
    await assert.rejects(checkout(removed,0),/Deleted/);
  });
  test('payment-reference collisions roll back the entire checkout',async()=>{
    const first=await make(0), second=await make(0), reference='unique-'+randomUUID();
    await checkout(first,Number((await row(first)).total_amount),{method:'Online',reference});
    const before=await row(second), ledger=await receipts(second);
    await assert.rejects(checkout(second,Number(before.total_amount),{method:'Online',reference}),/unique|duplicate/i);
    assert.deepEqual(await row(second),before); assert.deepEqual(await receipts(second),ledger);
  });
  test('concurrent collection requests charge once and record one handover',async()=>{
    const id=await make(0), before=await row(id), amount=Number(before.total_amount);
    const results=await Promise.allSettled([checkout(id,amount,{version:before.version}),checkout(id,amount,{version:before.version})]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal((await receipts(id)).length,1); assert.equal((await row(id)).status,'Collected');
  });
  test('collection races with a separate receipt never double-charge or collect an unpaid order',async()=>{
    const id=await make(0), before=await row(id);
    await Promise.allSettled([checkout(id,Number(before.total_amount),{version:before.version}),pay(id,1)]);
    const header=await row(id), ledger=await receipts(id), net=ledger.reduce((sum,p)=>sum+(p.kind==='refund'?-1:1)*Number(p.amount),0);
    assert.ok(net<=Number(header.total_amount));
    if(header.status==='Collected')assert.equal(net,Number(header.total_amount));
    else assert.equal(net,1);
  });
  test('replaying the collection migration preserves immutable requests, original bill numbers, ledger and audit history',async()=>{
    const id=await make(0), request=randomUUID();
    await checkout(id,Number((await row(id)).total_amount),{request});
    const before=await row(id), ledger=await receipts(id);
    const logs=(await db().query('select * from public.audit_logs where record_id=$1 order by id',[id])).rows;
    await db().query(await migration());
    assert.deepEqual(await row(id),before); assert.deepEqual(await receipts(id),ledger);
    assert.deepEqual((await db().query('select * from public.audit_logs where record_id=$1 order by id',[id])).rows,logs);
    await assert.rejects(db().query('delete from private.order_collection_requests where request_id=$1',[request]),/immutable/);
    await assert.rejects(asUser(actor,'update public.payments set amount=0 where order_id=$1',[id]),/permission denied/);
    await assert.rejects(pay(id,1,'Cash','','refund',staff),/authorized/);
  });
}
