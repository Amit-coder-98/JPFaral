-- Reviewed deletion of test/mistaken orders. Rows, bills, receipts and audits
-- are retained; only active business views exclude deleted orders.
alter table public.orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id),
  add column if not exists deletion_reason text;
alter table public.orders drop constraint if exists orders_deletion_metadata;
alter table public.orders add constraint orders_deletion_metadata check (
  (deleted_at is null and deleted_by is null and deletion_reason is null)
  or (deleted_at is not null and deleted_by is not null and deletion_reason is not null
      and length(trim(deletion_reason)) between 3 and 500)
);
create index if not exists orders_active_date on public.orders(created_at desc,id) where deleted_at is null;

create table if not exists private.order_deletion_batches (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  reason text not null check(length(trim(reason)) between 3 and 500),
  orders jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.order_deletion_batches from public,anon,authenticated;
create or replace function private.immutable_deletion_batch() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Deletion requests are immutable'; end; $$;
drop trigger if exists immutable_deletion_batch on private.order_deletion_batches;
create trigger immutable_deletion_batch before update or delete on private.order_deletion_batches
for each row execute function private.immutable_deletion_batch();

-- Archived bills are readable only by administrators; active shared reads remain.
alter policy orders_read on public.orders using (
  (select private.is_active()) and (deleted_at is null or (select private.is_admin()))
);
alter policy items_read on public.order_items using (
  (select private.is_active()) and exists (
    select 1 from public.orders o where o.id=order_id
      and (o.deleted_at is null or (select private.is_admin()))
  )
);

-- A database backstop protects historical rows, independently of the public RPCs.
create or replace function private.guard_deleted_order() returns trigger
language plpgsql security definer set search_path='' as $$
declare parent_id uuid; removed timestamptz;
begin
  if tg_table_name='orders' then
    if old.deleted_at is not null then raise exception 'Deleted orders cannot be changed'; end if;
  else
    parent_id:=case when tg_op='DELETE' then old.order_id else new.order_id end;
    select deleted_at into removed from public.orders where id=parent_id for update;
    if removed is not null then raise exception 'Deleted orders cannot be changed'; end if;
    if tg_op='UPDATE' and old.order_id is distinct from new.order_id then
      select deleted_at into removed from public.orders where id=old.order_id for update;
      if removed is not null then raise exception 'Deleted orders cannot be changed'; end if;
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
drop trigger if exists guard_deleted_order on public.orders;
create trigger guard_deleted_order before update or delete on public.orders
for each row execute function private.guard_deleted_order();
drop trigger if exists guard_deleted_items on public.order_items;
create trigger guard_deleted_items before insert or update or delete on public.order_items
for each row execute function private.guard_deleted_order();
drop trigger if exists guard_deleted_payments on public.payments;
create trigger guard_deleted_payments before insert on public.payments
for each row execute function private.guard_deleted_order();

-- Retain the existing audit data/actor protections and classify soft deletion.
create or replace function private.capture_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare old_data jsonb; new_data jsonb; label text; actor uuid; event_action text;
begin
  old_data:=case when tg_op<>'INSERT' then to_jsonb(old) end;
  new_data:=case when tg_op<>'DELETE' then to_jsonb(new) end;
  actor:=auth.uid();
  if not exists(select 1 from public.profiles where id=actor) then actor:=null; end if;
  label:=coalesce(new_data->>'order_number',old_data->>'order_number',new_data->>'name',new_data->>'full_name','');
  if tg_table_name in ('order_items','payments') then
    select order_number into label from public.orders where id=coalesce(new_data->>'order_id',old_data->>'order_id')::uuid;
  end if;
  event_action:=case tg_op when 'INSERT' then 'Created' when 'UPDATE' then 'Edited' else 'Deleted' end;
  if tg_table_name='orders' and tg_op='UPDATE' and old_data->>'deleted_at' is null and new_data->>'deleted_at' is not null then
    event_action:='Deleted';
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,record_id,record_label,previous_values,updated_values)
  values(actor,event_action,tg_table_name,coalesce(new_data->>'id',old_data->>'id')::uuid,label,
    old_data-'preferences',new_data-'preferences');
  return coalesce(new,old);
end; $$;

create or replace function public.delete_orders(p_orders jsonb,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; entry jsonb; ids uuid[]; canonical jsonb; header public.orders;
  received numeric; prior private.order_deletion_batches; reason text:=trim(p_reason);
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
    if prior.actor_id<>actor or prior.reason<>reason or prior.orders<>canonical then
      raise exception 'Deletion request ID has already been used';
    end if;
    return jsonb_build_object('deleted',cardinality(ids));
  end if;
  -- Stable lock order prevents overlapping bulk deletions from deadlocking.
  perform 1 from public.orders where id=any(ids) order by id for update;
  for entry in select value from jsonb_array_elements(canonical) loop
    select * into header from public.orders where id=(entry->>'id')::uuid;
    if not found then raise exception 'Order not found'; end if;
    if header.deleted_at is not null then raise exception 'Order % is already deleted. Refresh the list.',header.order_number; end if;
    if header.version<>(entry->>'version')::integer then
      raise exception 'Order % changed. Refresh before deleting.',header.order_number using errcode='40001';
    end if;
    if header.status='Collected' then raise exception 'Collected order % cannot be deleted',header.order_number; end if;
    select coalesce(sum(case kind when 'receipt' then amount else -amount end),0) into received
      from public.payments where order_id=header.id;
    if received<>0 then raise exception 'Refund received payments on % before deleting',header.order_number; end if;
  end loop;
  insert into private.order_deletion_batches(request_id,actor_id,reason,orders) values(p_request_id,actor,reason,canonical);
  update public.orders set deleted_at=now(),deleted_by=actor,deletion_reason=reason,updated_by=actor,version=version+1 where id=any(ids);
  return jsonb_build_object('deleted',cardinality(ids));
end; $$;
revoke all on function public.delete_orders(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.delete_orders(jsonb,text,uuid) to authenticated;

-- Preserve the exact existing financial implementations behind guarded wrappers.
-- No prices, totals, status rules or historical item/payment snapshots are rewritten.
do $$ begin
  if to_regprocedure('private.save_order_before_deletion(jsonb,uuid,uuid,integer,text)') is null then
    alter function public.save_order(jsonb,uuid,uuid,integer,text) set schema private;
    alter function private.save_order(jsonb,uuid,uuid,integer,text) rename to save_order_before_deletion;
  end if;
  if to_regprocedure('private.record_payment_before_deletion(uuid,numeric,text,text,uuid,text)') is null then
    alter function public.record_payment(uuid,numeric,text,text,uuid,text) set schema private;
    alter function private.record_payment(uuid,numeric,text,text,uuid,text) rename to record_payment_before_deletion;
  end if;
  if to_regprocedure('private.set_order_status_before_deletion(uuid,text,integer)') is null then
    alter function public.set_order_status(uuid,text,integer) set schema private;
    alter function private.set_order_status(uuid,text,integer) rename to set_order_status_before_deletion;
  end if;
end $$;
create or replace function public.save_order(p_input jsonb,p_request_id uuid,p_id uuid default null,p_version integer default null,p_status text default 'Confirmed')
returns uuid language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
  perform private.require_actor();
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  if p_id is not null then
    select deleted_at into removed from public.orders where id=p_id for update;
  else
    select deleted_at into removed from public.orders where request_id=p_request_id for update;
  end if;
  if removed is not null then raise exception 'Deleted orders cannot be saved or reopened'; end if;
  return private.save_order_before_deletion(p_input,p_request_id,p_id,p_version,p_status);
end; $$;
create or replace function public.record_payment(p_order_id uuid,p_amount numeric,p_method text,p_reference text,p_request_id uuid,p_kind text default 'receipt')
returns uuid language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
  perform private.require_actor(p_kind='refund');
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select deleted_at into removed from public.orders where id=p_order_id for update;
  if removed is not null then raise exception 'Deleted orders cannot receive payment transactions'; end if;
  return private.record_payment_before_deletion(p_order_id,p_amount,p_method,p_reference,p_request_id,p_kind);
end; $$;
create or replace function public.set_order_status(p_id uuid,p_status text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
  perform private.require_actor();
  select deleted_at into removed from public.orders where id=p_id for update;
  if removed is not null then raise exception 'Deleted orders cannot change collection status'; end if;
  perform private.set_order_status_before_deletion(p_id,p_status,p_version);
end; $$;
revoke all on function private.save_order_before_deletion(jsonb,uuid,uuid,integer,text),
  private.record_payment_before_deletion(uuid,numeric,text,text,uuid,text),private.set_order_status_before_deletion(uuid,text,integer),
  private.guard_deleted_order(),private.immutable_deletion_batch(),private.capture_audit() from public,anon,authenticated;
revoke all on function public.save_order(jsonb,uuid,uuid,integer,text),public.record_payment(uuid,numeric,text,text,uuid,text),
  public.set_order_status(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.save_order(jsonb,uuid,uuid,integer,text),public.record_payment(uuid,numeric,text,text,uuid,text),
  public.set_order_status(uuid,text,integer) to authenticated;

-- Make the new RPC available after the migration transaction commits.
notify pgrst, 'reload schema';
