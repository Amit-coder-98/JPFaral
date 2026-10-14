create function public.record_payment(p_order_id uuid,p_amount numeric,p_method text,p_reference text,p_request_id uuid,p_kind text default 'receipt')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; header public.orders; existing public.payments; received numeric; payment_id uuid;
begin
 actor := private.require_actor(p_kind='refund');
 if p_request_id is null then raise exception 'A payment request ID is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into existing from public.payments where request_id=p_request_id;
 if found then
  if existing.order_id <> p_order_id or existing.received_by <> actor or existing.amount <> p_amount or existing.method <> p_method
    or existing.kind <> p_kind or existing.reference <> (case when p_method='Cash' then '' else trim(coalesce(p_reference,'')) end) then
   raise exception 'Payment request ID has already been used';
  end if;
  return existing.id;
 end if;
 select * into header from public.orders where id=p_order_id for update;
 if not found or header.status='Draft' then raise exception 'A confirmed order is required'; end if;
 if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) or p_amount > 9999999999.99
   or p_method not in ('Cash','Online') or p_method is null or p_kind not in ('receipt','refund') or p_kind is null then
  raise exception 'Invalid payment amount, method or transaction type';
 end if;
 if p_method='Online' and length(trim(coalesce(p_reference,'')))=0 then raise exception 'UTR is required for online payments'; end if;
 select coalesce(sum(case kind when 'receipt' then amount else -amount end),0) into received from public.payments where order_id=p_order_id;
 if (p_kind='receipt' and p_amount > header.total_amount-received) or (p_kind='refund' and p_amount > received) then
  raise exception 'Payment exceeds the outstanding balance or refundable amount';
 end if;
 insert into public.payments(order_id,amount,method,reference,kind,request_id,received_by)
 values(p_order_id,p_amount,p_method,case when p_method='Cash' then '' else trim(p_reference) end,p_kind,p_request_id,actor) returning id into payment_id;
 update public.orders set version=version+1,updated_by=actor where id=p_order_id;
 return payment_id;
end;
$$;

create function public.save_order(p_input jsonb,p_request_id uuid,p_id uuid default null,p_version integer default null,p_status text default 'Confirmed')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; header public.orders; student public.students; product public.products; historical public.order_items;
  item jsonb; saved_id uuid; student_uuid uuid; pos integer:=0; qty numeric; unit_price numeric; item_name text; total numeric;
  amount numeric; received numeric; is_confirming boolean; prior_items jsonb; division_name text;
begin
 actor := private.require_actor();
 if p_request_id is null or p_input is null then raise exception 'Order data and a request ID are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 if p_id is null then
  select * into header from public.orders where request_id=p_request_id;
  if found then
   if header.created_by <> actor then raise exception 'Request ID belongs to another account' using errcode='42501'; end if;
   return header.id;
  end if;
  if p_status not in ('Draft','Confirmed') or p_status is null then raise exception 'Invalid initial order status'; end if;
 else
  select * into header from public.orders where id=p_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_version is null or p_version <> header.version then raise exception 'This order changed. Refresh before editing.' using errcode='40001'; end if;
  if header.status='Collected' then raise exception 'Collected orders cannot be edited'; end if;
  if header.status='Draft' and header.created_by<>actor and not private.is_admin() then raise exception 'Only the draft owner or administrator can edit this draft' using errcode='42501'; end if;
  if p_status is null or not (p_status=header.status or (header.status='Draft' and p_status='Confirmed')) then raise exception 'Use the collection operation to change status'; end if;
 end if;
 if jsonb_typeof(p_input->'items') <> 'array' or p_input->'items' is null or jsonb_array_length(p_input->'items')>30
   or (p_status<>'Draft' and jsonb_array_length(p_input->'items')=0) then raise exception 'An order requires 1 to 30 items'; end if;
 student_uuid := nullif(p_input->>'studentId','')::uuid;
 if student_uuid is not null then
  select * into student from public.students where id=student_uuid;
  if not found then raise exception 'Student not found'; end if;
  select name into division_name from public.school_divisions where id=student.division_id;
 end if;
 if p_status<>'Draft' and p_input->>'collectorType'='Student' and student_uuid is null then raise exception 'Select a student collector'; end if;
 amount := coalesce((p_input->>'advance')::numeric,0);
 if amount<0 or amount<>round(amount,2) or amount>9999999999.99 then raise exception 'Invalid advance amount'; end if;
 is_confirming := p_status<>'Draft' and (p_id is null or header.status='Draft');
 select coalesce(sum(case p.kind when 'receipt' then p.amount else -p.amount end),0) into received from public.payments p where p.order_id=p_id;
 if p_id is not null and header.status<>'Draft' and amount<>received then raise exception 'Existing receipts are immutable. Record another payment instead.'; end if;
 if p_status='Draft' and amount<>0 then raise exception 'Drafts cannot receive payments'; end if;
 if p_input->>'paymentMethod' not in ('Cash','Online') or p_input->>'paymentMethod' is null then raise exception 'Choose a valid payment method'; end if;
 if is_confirming and p_input->>'paymentMethod'='Online' and length(trim(coalesce(p_input->>'utr','')))=0 then raise exception 'UTR is required for online payments'; end if;
 if p_id is null then
  insert into public.orders(student_id,student_name,student_standard,student_division,customer_name,customer_phone,status,
    collection_date,collector_type,collector_name,created_by,updated_by,request_id)
  values(student_uuid,coalesce(student.name,''),coalesce(student.standard,''),coalesce(division_name,''),trim(coalesce(p_input->>'customerName','')),
    coalesce(p_input->>'customerPhone',''),p_status,nullif(p_input->>'collectionDate','')::date,p_input->>'collectorType',
    trim(coalesce(p_input->>'collectorName','')),actor,actor,p_request_id) returning id into saved_id;
 else
  saved_id := p_id;
  select coalesce(jsonb_agg(to_jsonb(i)),'[]') into prior_items from public.order_items i where order_id=p_id;
  update public.orders set student_id=student_uuid,
   student_name=case when student_id is not distinct from student_uuid then student_name else coalesce(student.name,'') end,
   student_standard=case when student_id is not distinct from student_uuid then student_standard else coalesce(student.standard,'') end,
   student_division=case when student_id is not distinct from student_uuid then student_division else coalesce(division_name,'') end,
   customer_name=trim(coalesce(p_input->>'customerName','')),customer_phone=coalesce(p_input->>'customerPhone',''),status=p_status,
   collection_date=nullif(p_input->>'collectionDate','')::date,collector_type=p_input->>'collectorType',collector_name=trim(coalesce(p_input->>'collectorName','')),
   updated_by=actor,version=version+1 where id=p_id;
  delete from public.order_items where order_id=p_id;
 end if;
 for item in select value from jsonb_array_elements(p_input->'items') loop
  pos := pos+1;
  select * into product from public.products where id=(item->>'productId')::uuid for share;
  if not found then raise exception 'Product not found'; end if;
  historical := null;
  if p_id is not null and header.status<>'Draft' then
   select * into historical from jsonb_populate_recordset(null::public.order_items,prior_items) where product_id=product.id;
  end if;
  if historical.id is not null then
   unit_price:=historical.price_per_kg; item_name:=historical.product_name;
  else
   if not product.active then raise exception 'Product is unavailable'; end if;
   if (item->>'price')::numeric is distinct from product.price_per_kg then raise exception 'Product price changed. Refresh and reselect the product.' using errcode='40001'; end if;
   unit_price:=product.price_per_kg; item_name:=product.name;
  end if;
  qty:=(item->>'quantity')::numeric;
  if qty is null or qty<>round(qty,2) then raise exception 'Invalid quantity'; end if;
  insert into public.order_items(order_id,product_id,position,product_name,price_per_kg,quantity_kg)
  values(saved_id,product.id,pos,item_name,unit_price,qty);
 end loop;
 select coalesce(sum(line_total),0) into total from public.order_items where order_id=saved_id;
 if amount>total or received>total then raise exception 'Received payments cannot exceed the order total'; end if;
 update public.orders set total_amount=total where id=saved_id;
 if is_confirming and amount>0 then
  perform public.record_payment(saved_id,amount,p_input->>'paymentMethod',p_input->>'utr',p_request_id,'receipt');
 end if;
 return saved_id;
end;
$$;

create function public.set_order_status(p_id uuid,p_status text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid; header public.orders;
begin
 actor:=private.require_actor();
 select * into header from public.orders where id=p_id for update;
 if not found then raise exception 'Order not found'; end if;
 if p_version is null or p_version<>header.version then raise exception 'This order changed. Refresh before updating.' using errcode='40001'; end if;
 if not ((header.status='Confirmed' and p_status='Ready') or (header.status='Ready' and p_status='Collected')) then raise exception 'Invalid collection status transition'; end if;
 update public.orders set status=p_status,updated_by=actor,version=version+1 where id=p_id;
end;
$$;

create function public.import_students(p_rows jsonb,p_batch_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; row_data jsonb; division smallint; inserted integer:=0; skipped integer:=0;
begin
 actor:=private.require_actor(true);
 if p_batch_id is null or jsonb_typeof(p_rows)<>'array' or p_rows is null or jsonb_array_length(p_rows) not between 1 and 2000 then raise exception 'Import requires 1 to 2000 reviewed rows and a batch ID'; end if;
 -- Serialize identity checks to make concurrent imports and retries safe.
 perform pg_advisory_xact_lock(hashtextextended('jpfaral-student-import',0));
 for row_data in select value from jsonb_array_elements(p_rows) loop
  select id into division from public.school_divisions where standard=row_data->>'standard' and name=row_data->>'division';
  if division is null then raise exception 'Invalid standard and division for student %',row_data->>'name'; end if;
  if exists(select 1 from public.students where lower(trim(name))=lower(trim(row_data->>'name')) and phone=row_data->>'phone' and division_id=division) then
   if exists(select 1 from public.students where lower(trim(name))=lower(trim(row_data->>'name')) and phone=row_data->>'phone' and division_id=division and import_batch_id=p_batch_id and imported_by=actor) then
    skipped:=skipped+1; continue;
   end if;
   raise exception 'Duplicate student requires administrative review: %',row_data->>'name';
  end if;
  insert into public.students(name,phone,standard,division_id,imported_by,import_batch_id)
  values(trim(row_data->>'name'),row_data->>'phone',row_data->>'standard',division,actor,p_batch_id);
  inserted:=inserted+1;
 end loop;
 return jsonb_build_object('inserted',inserted,'skipped',skipped);
end;
$$;

create function public.update_my_profile(p_name text,p_preferences jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=private.require_actor();
 if p_preferences is not null and (jsonb_typeof(p_preferences) is distinct from 'object' or not (p_preferences ?& array['accent','compact','reduceMotion']) or coalesce(p_preferences->>'accent' not in ('#b56735','#985161','#527a64'),true) or jsonb_typeof(p_preferences->'compact') is distinct from 'boolean' or jsonb_typeof(p_preferences->'reduceMotion') is distinct from 'boolean' or (p_preferences - array['accent','compact','reduceMotion']) <> '{}'::jsonb) then raise exception 'Invalid display preferences'; end if;
 update public.profiles set full_name=trim(p_name),preferences=coalesce(p_preferences,preferences) where id=actor;
end;
$$;
create function public.update_organization(p_organization text,p_contact text,p_address text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor(true);
 update public.organization_settings set organization=trim(p_organization),contact=trim(p_contact),address=trim(p_address) where id;
end;
$$;
create function public.admin_update_profile(p_id uuid,p_name text,p_role text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=private.require_actor(true);
 perform pg_advisory_xact_lock(hashtextextended('jpfaral-administrators',0));
 if p_id=actor and (p_role<>'super_admin' or not p_active) then raise exception 'Your administrator account must remain active'; end if;
 if not exists(select 1 from public.profiles where id=p_id) then raise exception 'Staff account not found'; end if;
 update public.profiles set full_name=trim(p_name),role=p_role,active=p_active where id=p_id;
end;
$$;
create function public.my_activity(p_offset integer default 0,p_limit integer default 500)
returns table(id uuid,actor_id uuid,action text,entity_type text,record_id uuid,record_label text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor();
 return query select l.id,l.actor_id,l.action,l.entity_type,l.record_id,l.record_label,l.created_at
 from public.audit_logs l where l.actor_id=auth.uid() order by l.created_at desc,l.id limit least(greatest(p_limit,1),500) offset greatest(p_offset,0);
end;
$$;

-- Every exposed RPC has explicit grants; postgres-owned definer functions check the
-- caller themselves. Private helpers and trigger functions cannot be invoked by clients.
revoke all on function public.record_payment(uuid,numeric,text,text,uuid,text),
 public.save_order(jsonb,uuid,uuid,integer,text),public.set_order_status(uuid,text,integer),
 public.import_students(jsonb,uuid),public.update_my_profile(text,jsonb),
 public.update_organization(text,text,text),public.admin_update_profile(uuid,text,text,boolean),
 public.my_activity(integer,integer) from public,anon,authenticated;
grant execute on function public.record_payment(uuid,numeric,text,text,uuid,text),
 public.save_order(jsonb,uuid,uuid,integer,text),public.set_order_status(uuid,text,integer),
 public.import_students(jsonb,uuid),public.update_my_profile(text,jsonb),
 public.update_organization(text,text,text),public.admin_update_profile(uuid,text,text,boolean),
 public.my_activity(integer,integer) to authenticated;

