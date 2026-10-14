-- Forward-only upgrade. Existing per-kg prices, item snapshots and ledger stay canonical.
-- numeric(6,2) supports quarter-kilogram quantities through 9999.75 kg.
alter table public.order_items drop constraint if exists order_items_quantity_kg_check;
alter table public.order_items drop constraint if exists order_items_quantity_quarter_kg_check;
alter table public.order_items add constraint order_items_quantity_quarter_kg_check
  check(quantity_kg > 0 and quantity_kg <= 9999.75 and mod(quantity_kg,0.25)=0);
comment on column public.products.price_per_kg is 'Canonical INR per kg. Entered 250g rate is multiplied by four; display divides by four.';
comment on column public.order_items.price_per_kg is 'Immutable historical canonical INR per kg snapshot. Display per 250g without altering this value.';
comment on column public.order_items.quantity_kg is 'Positive quarter-kilogram increments, limited by numeric(6,2) storage to 9999.75 kg.';

create or replace function public.save_order(p_input jsonb,p_request_id uuid,p_id uuid default null,p_version integer default null,p_status text default 'Confirmed')
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
  if qty is null or qty<=0 or qty>9999.75 or mod(qty,0.25)<>0 then raise exception 'प्रमाण शून्यापेक्षा जास्त व 0.25 किलोच्या पटीत असावे (कमाल 9999.75 kg)'; end if;
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

-- CREATE OR REPLACE retains privileges; explicit grants also keep replays fail closed.
revoke all on function public.save_order(jsonb,uuid,uuid,integer,text) from public,anon;
grant execute on function public.save_order(jsonb,uuid,uuid,integer,text) to authenticated;

-- Serialize catalogue writes so same-name checks and seed insertion are atomic.
-- Reuse an existing exact-name product ID; never rename/delete any referenced product.
do $$
declare entry record; matches integer;
begin
 lock table public.products in share row exclusive mode;
 for entry in select * from (values
  ('मोतीचूर लाडू',110,'Sweet'),
  ('बेसन लाडू (तुपातील)',165,'Sweet'),
  ('रवा लाडू (तुपातील)',140,'Sweet'),
  ('पौष्टिक लाडू (तुपातील)',150,'Sweet'),
  ('करंजी (तुपातील)',140,'Sweet'),
  ('शंकरपाळी',110,'Sweet'),
  ('चिरोटे',125,'Sweet'),
  ('बालुशाही',110,'Sweet'),
  ('काजू कतली',350,'Sweet'),
  ('साधा चिवडा (मुरमुरे)',100,'Savoury'),
  ('मका चिवडा',110,'Savoury'),
  ('पोहे चिवडा',110,'Savoury'),
  ('गहू चिवडा',100,'Savoury'),
  ('मसाला शेव',120,'Savoury'),
  ('भावनागरी शेव',120,'Savoury'),
  ('बारीक शेव',120,'Savoury'),
  ('चकली',110,'Savoury'),
  ('खारी बुंदी',115,'Savoury'),
  ('खारी शंकरपाळी',120,'Savoury'),
  ('लाल एडमी',100,'Savoury'),
  ('हिरवे एडमी',100,'Savoury'),
  ('पेरी स्टिक',100,'Savoury'),
  ('मिंट स्टिक',100,'Savoury'),
  ('मूग बाईट',100,'Savoury'),
  ('पालक चुरचुरे',100,'Savoury'),
  ('चटपटीत चुरचुरे',100,'Savoury')
 ) as rates(name,rate_per_250g,category) loop
  select count(*) into matches from public.products where name=entry.name;
  if matches>1 then raise exception 'Catalogue has duplicate product %, review before applying this migration',entry.name; end if;
  if matches=1 then
   update public.products set price_per_kg=entry.rate_per_250g*4,category=entry.category
   where name=entry.name and (price_per_kg is distinct from entry.rate_per_250g*4 or category is distinct from entry.category);
  else
   insert into public.products(id,name,price_per_kg,category,active)
   values(md5('jpfaral-marathi-rate-card-v1:' || entry.name)::uuid,entry.name,entry.rate_per_250g*4,entry.category,true);
  end if;
 end loop;
end;
$$;
