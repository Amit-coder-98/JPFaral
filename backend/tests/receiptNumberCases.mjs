import { randomUUID } from 'node:crypto';

export function receiptNumberCases({test,assert,db,admin,staff,inactive,save,input,productId,row,pay,asUser,migration,cleanup,targets}) {
  const make = async (advance=0,status='Confirmed',request=randomUUID()) => {
    const price=Number((await db().query('select price_per_kg from public.products where id=$1',[productId])).rows[0].price_per_kg);
    return save(input({items:[{productId,price,quantity:0.25}],advance}),staff,null,null,status,request);
  };
  const active = async () => (await db().query('select * from public.orders where deleted_at is null order by id')).rows;
  const clear = async () => {
    for (;;) {const ids=(await active()).slice(0,100).map(order=>order.id);if(!ids.length)return;await cleanup(await targets(ids));}
  };
  const receipt = order => order.receipt_number ?? order.order_number;
  const snapshots = async () => (await db().query("select to_jsonb(o)-'receipt_number' data from public.orders o order by id")).rows;
  test('receipt upgrade preserves every legacy order, archive, payment and audit without backfilling history',async()=>{
    const id=await make(),original=await row(id),before=await snapshots();
    const payments=(await db().query('select * from public.payments order by id')).rows;
    const logs=(await db().query('select * from public.audit_logs order by id')).rows;
    await db().query(await migration());
    assert.deepEqual(await snapshots(),before);
    assert.deepEqual((await db().query('select * from public.payments order by id')).rows,payments);
    assert.deepEqual((await db().query('select * from public.audit_logs order by id')).rows,logs);
    assert.equal((await row(id)).receipt_number,null);
    assert.equal(receipt(await row(id)),original.order_number);
    assert.equal((await db().query("select count(*) from pg_constraint where conrelid='public.orders'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (order_number)'")).rows[0].count,'1');
  });
  test('deleting all active orders restarts customer receipts at one while internal references remain unique',async()=>{
    await clear();
    const first=await make(),before=await row(first);
    assert.equal(before.receipt_number,'JP-0001');
    await cleanup(await targets([first]));
    const archive=await row(first),next=await make(),after=await row(next);
    assert.equal(after.receipt_number,'JP-0001');
    assert.notEqual(after.id,archive.id);assert.notEqual(after.order_number,archive.order_number);
    assert.deepEqual(await row(first),archive);
    assert.equal((await active()).length,1);
  });
  test('a freed middle receipt is reused without collisions or renumbering other active orders',async()=>{
    await clear();
    const ids=[];for(let i=0;i<3;i++)ids.push(await make());
    const original=await Promise.all(ids.map(row));
    assert.deepEqual(original.map(receipt),['JP-0001','JP-0002','JP-0003']);
    await cleanup(await targets([ids[1]]));
    const next=await row(await make());assert.equal(next.receipt_number,'JP-0002');
    assert.deepEqual(await row(ids[0]),original[0]);assert.deepEqual(await row(ids[2]),original[2]);
    assert.equal(new Set((await active()).map(receipt)).size,3);
  });
  test('paid collected test archives retain their ledger and separate audit identity after receipt reuse',async()=>{
    await clear();
    const id=await make(10),before=await row(id);
    await asUser(staff,'select public.collect_order($1,$2,$3,$4)',[id,before.version,randomUUID(),Number(before.total_amount)-10]);
    const ledger=(await db().query('select * from public.payments where order_id=$1 order by id',[id])).rows;
    await cleanup(await targets([id]));
    const archive=await row(id),nextId=await make(20),next=await row(nextId);
    assert.equal(next.receipt_number,archive.receipt_number);
    assert.notEqual(next.order_number,archive.order_number);
    assert.deepEqual((await db().query('select * from public.payments where order_id=$1 order by id',[id])).rows,ledger);
    const oldLogs=(await db().query('select * from public.audit_logs where record_id=$1',[id])).rows;
    const newLogs=(await db().query('select * from public.audit_logs where record_id=$1',[nextId])).rows;
    assert.ok(oldLogs.some(log=>log.action==='Deleted'));assert.ok(newLogs.length);
    assert.ok(oldLogs.every(log=>log.record_label===archive.order_number));
    assert.ok(newLogs.every(log=>log.record_label===next.order_number));
    assert.deepEqual(await row(id),archive);
    await assert.rejects(pay(id,1),/Deleted/);
  });
  test('failed saves roll back a public receipt allocation and creation retries retain the same UUID and receipt',async()=>{
    await clear();
    const price=Number((await db().query('select price_per_kg from public.products where id=$1',[productId])).rows[0].price_per_kg);
    await assert.rejects(save(input({items:[{productId,price,quantity:0.3}],advance:0})),/0.25/);
    assert.equal((await active()).length,0);
    const request=randomUUID(),id=await make(0,'Confirmed',request),before=await row(id);
    assert.equal(before.receipt_number,'JP-0001');
    assert.equal(await make(0,'Confirmed',request),id);
    assert.deepEqual(await row(id),before);assert.equal((await active()).length,1);
  });
  test('draft confirmation and editing retain their assigned receipt and internal reference',async()=>{
    await clear();
    const id=await make(0,'Draft'),draft=await row(id);
    const price=Number((await db().query('select price_per_kg from public.products where id=$1',[productId])).rows[0].price_per_kg);
    const form=input({items:[{productId,price,quantity:0.5}],advance:0});
    await save(form,staff,id,draft.version,'Confirmed');
    const confirmed=await row(id);
    assert.equal(confirmed.receipt_number,draft.receipt_number);assert.equal(confirmed.order_number,draft.order_number);
    await assert.rejects(db().query("update public.orders set receipt_number='JP-9999' where id=$1",[id]),/cannot be changed/);
    await assert.rejects(db().query("update public.orders set order_number='JP-9999' where id=$1",[id]),/cannot be changed/);
  });
  test('allocation and release preserve backend authorization and failed deletion never frees a receipt',async()=>{
    await clear();const id=await make(10),before=await row(id);
    for(const actor of [staff,inactive])await assert.rejects(cleanup(await targets([id]),true,randomUUID(),actor),/authorized/);
    await assert.rejects(cleanup(await targets([id]),false),error => /Refund received payments/.test(error.message) && error.message.includes(before.receipt_number) && !error.message.includes(before.order_number));
    await assert.rejects(asUser(staff,'select private.next_receipt_number()'),/permission denied/);
    await assert.rejects(asUser(staff,"update public.orders set receipt_number='JP-0002' where id=$1",[id]),/permission denied/);
    await assert.rejects(asUser(null,'select public.save_order($1,$2)',[input(),randomUUID()],'anon'),/permission denied/);
    await assert.rejects(cleanup([{id,version:before.version-1}]),/current version|changed|requires/);
    assert.deepEqual(await row(id),before);
    assert.equal((await row(await make())).receipt_number,'JP-0002');
  });
  test('concurrent new orders receive distinct lowest available active receipt numbers',async()=>{
    await clear();
    const ids=await Promise.all(Array.from({length:12},()=>make()));
    const rows=await Promise.all(ids.map(row));
    assert.equal(new Set(rows.map(receipt)).size,12);
    assert.deepEqual(rows.map(receipt).sort(),Array.from({length:12},(_,i)=>`JP-${String(i+1).padStart(4,'0')}`));
    assert.equal(new Set(rows.map(order=>order.order_number)).size,12);
  });
  test('concurrent deletion and creation never duplicate an active receipt and the next save fills a committed gap',async()=>{
    await clear();const first=await make(),second=await make();
    const [,third]=await Promise.all([cleanup(await targets([second])),make()]);
    const live=await active(),used=new Set(live.map(receipt));assert.equal(used.size,2);
    assert.ok(live.some(order=>order.id===first));assert.ok(live.some(order=>order.id===third));
    let slot=1;while(used.has(`JP-${String(slot).padStart(4,'0')}`))slot++;
    assert.equal((await row(await make())).receipt_number,`JP-${String(slot).padStart(4,'0')}`);
  });
  test('replaying the receipt migration changes no assigned receipt, payment or audit history',async()=>{
    const orders=(await db().query('select * from public.orders order by id')).rows;
    const payments=(await db().query('select * from public.payments order by id')).rows;
    const logs=(await db().query('select * from public.audit_logs order by id')).rows;
    await db().query(await migration());
    assert.deepEqual((await db().query('select * from public.orders order by id')).rows,orders);
    assert.deepEqual((await db().query('select * from public.payments order by id')).rows,payments);
    assert.deepEqual((await db().query('select * from public.audit_logs order by id')).rows,logs);
    assert.equal((await db().query("select count(*) from pg_indexes where schemaname='public' and indexname='orders_active_receipt_number'")).rows[0].count,'1');
  });
}
