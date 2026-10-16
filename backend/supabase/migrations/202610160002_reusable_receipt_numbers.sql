-- Customer-facing receipt numbers may be reused after deletion, as requested.
-- UUIDs and the original globally unique order_number remain permanent internal
-- references for payments, retries and audits. No historical row is rewritten.
alter table public.orders add column if not exists receipt_number text;
alter table public.orders drop constraint if exists orders_receipt_number_format;
alter table public.orders add constraint orders_receipt_number_format
  check (receipt_number is null or receipt_number ~ '^JP-[0-9]{4,}$');
comment on column public.orders.receipt_number is
  'Customer-facing receipt number, unique among active orders. NULL retains a legacy order_number. Freed numbers can be reused without changing historical records.';
comment on column public.orders.order_number is
  'Permanent globally unique internal reference. Retained for audit labels and legacy receipts; never reset or reused.';

create unique index if not exists orders_active_receipt_number
  on public.orders ((coalesce(receipt_number,order_number))) where deleted_at is null;

create or replace function private.next_receipt_number() returns text
language plpgsql set search_path='' as $$
declare slot numeric; digits text;
begin
  -- Serialize new receipts through commit. Deletions can only free a slot, so
  -- concurrent deletion needs no extra lock or change to its protected RPC.
  perform pg_advisory_xact_lock(20261016,2);
  with used as materialized (
    select substring(coalesce(receipt_number,order_number) from 4)::numeric as n
    from public.orders where deleted_at is null
  ), candidates as (
    select 1::numeric as n union select n+1 from used
  )
  select min(c.n) into slot from candidates c where not exists (select 1 from used u where u.n=c.n);
  digits:=slot::text;
  return 'JP-'||lpad(digits,greatest(4,length(digits)),'0');
end; $$;

create or replace function private.assign_receipt_number() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Assignment is authoritative; a supplied client/owner value cannot choose a slot.
  new.receipt_number:=private.next_receipt_number();
  return new;
end; $$;
drop trigger if exists assign_receipt_number on public.orders;
create trigger assign_receipt_number before insert on public.orders
for each row execute function private.assign_receipt_number();

create or replace function private.guard_receipt_number() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.receipt_number is distinct from old.receipt_number
    or new.order_number is distinct from old.order_number then
    raise exception 'Existing receipt numbers and internal references cannot be changed';
  end if;
  return new;
end; $$;
drop trigger if exists guard_receipt_number on public.orders;
create trigger guard_receipt_number before update of receipt_number,order_number on public.orders
for each row execute function private.guard_receipt_number();

revoke all on function private.next_receipt_number(),private.assign_receipt_number(),private.guard_receipt_number()
  from public,anon,authenticated;
-- Preserve the existing deletion checks and grants; display the customer receipt
-- in validation errors rather than the permanent internal audit reference.
create or replace function public.delete_orders(p_orders jsonb,p_reason text,p_request_id uuid,p_allow_collected boolean default false,p_test_cleanup boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; entry jsonb; ids uuid[]; canonical jsonb; header public.orders;
  received numeric; prior private.order_deletion_batches; reason text:=trim(p_reason); allow_collected boolean:=coalesce(p_allow_collected,false); test_cleanup boolean:=coalesce(p_test_cleanup,false);
begin
  actor:=private.require_actor(true);
  if p_request_id is null or p_orders is null or jsonb_typeof(p_orders)<>'array' then
    raise exception 'Choose 1 to 100 orders and provide a deletion request ID';
  end if;
  if jsonb_array_length(p_orders) not between 1 and 100 or reason is null or length(reason) not between 3 and 500 then
    raise exception 'Choose 1 to 100 orders and enter a reason of 3 to 500 characters';
  end if;
  for entry in select value from jsonb_array_elements(p_orders) loop
    if jsonb_typeof(entry) is distinct from 'object' or not (entry ?& array['id','version'])
      or (entry-array['id','version'])<>'{}'::jsonb
      or jsonb_typeof(entry->'id') is distinct from 'string'
      or jsonb_typeof(entry->'version') is distinct from 'number'
      or (entry->>'version') !~ '^[1-9][0-9]*$' then
      raise exception 'Every selected order requires its ID and current version';
    end if;
    -- UUID/integer casts also reject malformed IDs and out-of-range versions.
    perform (entry->>'id')::uuid,(entry->>'version')::integer;
  end loop;
  select array_agg((value->>'id')::uuid order by (value->>'id')::uuid),
    jsonb_agg(jsonb_build_object('id',(value->>'id')::uuid,'version',(value->>'version')::integer) order by (value->>'id')::uuid)
    into ids,canonical from jsonb_array_elements(p_orders);
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Select each order only once'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into prior from private.order_deletion_batches where request_id=p_request_id;
  if found then
    if prior.actor_id<>actor or prior.reason<>reason or prior.orders<>canonical or prior.allow_collected<>allow_collected or prior.test_cleanup<>test_cleanup then
      raise exception 'Deletion request ID has already been used';
    end if;
    return jsonb_build_object('deleted',cardinality(ids));
  end if;
  -- Stable lock order prevents overlapping bulk deletions from deadlocking.
  perform 1 from public.orders where id=any(ids) order by id for update;
  for entry in select value from jsonb_array_elements(canonical) loop
    select * into header from public.orders where id=(entry->>'id')::uuid;
    if not found then raise exception 'Order not found'; end if;
    if header.deleted_at is not null then raise exception 'Order % is already deleted. Refresh the list.',coalesce(header.receipt_number,header.order_number); end if;
    if header.version<>(entry->>'version')::integer then
      raise exception 'Order % changed. Refresh before deleting.',coalesce(header.receipt_number,header.order_number) using errcode='40001';
    end if;
    if header.status='Collected' and not allow_collected and not test_cleanup then
      raise exception 'Confirm the collected-order override before deleting %',coalesce(header.receipt_number,header.order_number);
    end if;
    select coalesce(sum(case kind when 'receipt' then amount else -amount end),0) into received
      from public.payments where order_id=header.id;
    if received<0 then raise exception 'Invalid payment balance on %',coalesce(header.receipt_number,header.order_number); end if;
    if received<>0 and not test_cleanup then raise exception 'Refund received payments on % before deleting a real order, or explicitly confirm test-only cleanup',coalesce(header.receipt_number,header.order_number); end if;
  end loop;
  insert into private.order_deletion_batches(request_id,actor_id,reason,orders,allow_collected,test_cleanup)
    values(p_request_id,actor,reason,canonical,allow_collected,test_cleanup);
  update public.orders set deletion_test_data=test_cleanup,deletion_collected_override=((allow_collected or test_cleanup) and status='Collected'),deleted_at=now(),deleted_by=actor,deletion_reason=reason,updated_by=actor,version=version+1 where id=any(ids);
  return jsonb_build_object('deleted',cardinality(ids));
end; $$;
revoke all on function public.delete_orders(jsonb,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.delete_orders(jsonb,text,uuid,boolean,boolean) to authenticated;


notify pgrst, 'reload schema';
