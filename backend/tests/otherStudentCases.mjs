import { randomUUID } from "node:crypto";

export function otherStudentCases({test,assert,db,admin,staff,inactive,studentId,asUser,save,input,row,pay,migration}) {
  const create=(name="Junior student",standard="1st",division="",phone="",actor=staff,role="authenticated")=>
    asUser(actor,"select public.save_other_student($1,$2,$3,$4) id",[name,standard,division,phone],role).then(result=>result.rows[0].id);
  const student=id=>db().query("select * from public.students where id=$1",[id]).then(result=>result.rows[0]);
  const history=async()=>({
    students:(await db().query("select to_jsonb(s)-'other_division' data from public.students s order by id")).rows,
    orders:(await db().query("select * from public.orders order by id")).rows,
    items:(await db().query("select * from public.order_items order by id")).rows,
    payments:(await db().query("select * from public.payments order by id")).rows,
    audit:(await db().query("select * from public.audit_logs order by id")).rows,
    divisions:(await db().query("select * from public.school_divisions order by id")).rows,
    policies:(await db().query("select * from pg_policies where schemaname='public' order by tablename,policyname")).rows,
    financial:(await db().query("select proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_order','record_payment','collect_order','delete_orders') order by proname")).rows,
  });
  test("Others migration preserves the senior directory, all existing financial history, RPC definitions and RLS",async()=>{
    const before=await history();
    await db().query(await migration());
    assert.deepEqual(await history(),before);
    assert.equal((await db().query("select count(*) from public.school_divisions")).rows[0].count,"12");
  });
  test("active staff save 1st-4th students with optional phone/division; invalid class/contact data cannot be stored",async()=>{
    for(const standard of ["1st","2nd","3rd","4th"]) {
      const id=await create(`Junior ${standard}`,standard);
      assert.equal((await student(id)).standard,standard); assert.equal((await student(id)).phone,null); assert.equal((await student(id)).division_id,null);
    }
    for(const args of [["A","1st"],["Junior","5th"],["Junior",null],["Junior","2nd","A","123"],["Junior","2nd","x".repeat(61)],["x".repeat(121),"1st"]])
      await assert.rejects(create(...args),/student|standard|phone|Division/i);
    await assert.rejects(db().query("insert into public.students(name,standard,division_id) values('Invalid senior','5th',null)"),/students_class_assignment/);
    await assert.rejects(db().query("insert into public.students(name,standard,division_id) values('Invalid junior','1st',1)"),/constraint/);
  });
  test("student name search identities and concurrent retries reuse the same saved student without touching senior records",async()=>{
    const senior=await student(studentId);
    const ids=await Promise.all(Array.from({length:4},()=>create("  New   Learner  ","2nd"," A ")));
    assert.equal(new Set(ids).size,1); const id=ids[0];
    assert.equal((await student(id)).name,"New Learner"); assert.equal((await student(id)).other_division,"A");
    assert.equal(await create("new learner","2nd","a"),id);
    assert.equal(await create("New Learner","2nd","A","9876500001"),id);
    assert.equal((await student(id)).phone,"9876500001");
    assert.equal(await create("New Learner","2nd","A"),id);
    assert.equal((await student(id)).phone,"9876500001");
    assert.notEqual(await create("New Learner","3rd","A"),id);
    assert.notEqual(await create("New Learner","2nd","B"),id);
    assert.deepEqual(await student(studentId),senior);
  });
  test("same-name students with distinct phones remain selectable and ambiguous no-phone saves require selection",async()=>{
    const first=await create("Same Name","4th","B","9876500002"),second=await create("Same Name","4th","B","9876500003");
    assert.notEqual(first,second);
    await assert.rejects(create("Same Name","4th","B"),/More than one student/);
    assert.equal(await create("Same Name","4th","B","9876500002"),first);
    assert.equal((await student(first)).phone,"9876500002"); assert.equal((await student(second)).phone,"9876500003");
  });
  test("Others orders retain a real student FK, manual class snapshot, prices and immutable payments across edits and collection",async()=>{
    const id=await create("छोटा विद्यार्थी","3rd","A");
    const data=input({studentId:id,collectorName:"छोटा विद्यार्थी"});
    const orderId=await save(data), original=await row(orderId);
    assert.equal(original.student_id,id); assert.equal(original.student_standard,"3rd"); assert.equal(original.student_division,"A");
    assert.equal(original.student_name,"छोटा विद्यार्थी"); assert.equal(Number(original.total_amount),61.75);
    const payment=(await db().query("select * from public.payments where order_id=$1",[orderId])).rows;
    await db().query("update public.students set other_division='B' where id=$1",[id]);
    await save({...data,customerName:"Updated customer"},staff,orderId,original.version);
    assert.equal((await row(orderId)).student_division,"A");
    assert.deepEqual((await db().query("select * from public.payments where order_id=$1",[orderId])).rows,payment);
    await assert.rejects(save({...data,customerPhone:""}),/constraint/);
    await pay(orderId,20,"Online",`OTHERS-${randomUUID()}`);
    const current=await row(orderId);
    await asUser(staff,"select public.collect_order($1,$2,$3,$4,$5,$6)",[orderId,current.version,randomUUID(),31.75,"Cash",""]);
    assert.equal((await row(orderId)).status,"Collected"); assert.equal((await row(orderId)).student_division,"A");
    assert.equal((await row(orderId)).receipt_number,original.receipt_number);
    const logs=(await asUser(admin,"select * from public.audit_logs where record_id=$1",[id])).rows;
    assert.ok(logs.some(log=>log.actor_id===staff && log.action==="Created"));
  });
  test("Others RPC cannot bypass inactive/anonymous checks, direct directory writes or school imports",async()=>{
    for(const [actor,role] of [[inactive,"authenticated"],[null,"anon"]]) await assert.rejects(create("Denied","1st","","",actor,role),/authorized|permission denied/);
    await assert.rejects(asUser(staff,"insert into public.students(name,standard,division_id) values('Direct write','1st',null)"),/permission denied/);
    const id=await create("Protected student","1st");
    await assert.rejects(asUser(staff,"update public.students set name='Tampered' where id=$1",[id]),/permission denied/);
    await assert.rejects(asUser(staff,"select public.import_students($1,$2)",[JSON.stringify([{name:"Imported junior",standard:"1st",division:""}]),randomUUID()]),/authorized/);
    await assert.rejects(asUser(staff,"select private.snapshot_other_student()"),/permission denied/);
  });
  test("replaying Others migration preserves new identities, receipts, audit events and payment ledger",async()=>{
    const before=await history();
    const students=(await db().query("select * from public.students order by id")).rows;
    await db().query(await migration());
    assert.deepEqual(await history(),before);
    assert.deepEqual((await db().query("select * from public.students order by id")).rows,students);
    const id=await create("Replay student","1st","A");
    const schoolOrder=await save();
    await save(input({studentId:id}),staff,schoolOrder,(await row(schoolOrder)).version);
    assert.equal((await row(schoolOrder)).student_division,"A");
  });
}
