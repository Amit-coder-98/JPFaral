-- Explicit Super Admin cleanup of test orders, including recorded test payments.
-- Preserve all original ledger rows and snapshots; do not create fictitious refunds.
-- Only a reviewed test-data confirmation can bypass the real-payment safeguard.
alter table public.orders add column if not exists deletion_test_data boolean not null default false;
alter table private.order_deletion_batches add column if not exists test_cleanup boolean not null default false;
alter table public.orders drop constraint if exists orders_test_deletion_metadata;
alter table public.orders add constraint orders_test_deletion_metadata check (not deletion_test_data or deleted_at is not null);
-- Keep one RPC overload. Older callers retain default false protection.
drop function if exists public.delete_orders(jsonb,text,uuid,boolean);

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
    if header.deleted_at is not null then raise exception 'Order % is already deleted. Refresh the list.',header.order_number; end if;
    if header.version<>(entry->>'version')::integer then
      raise exception 'Order % changed. Refresh before deleting.',header.order_number using errcode='40001';
    end if;
    if header.status='Collected' and not allow_collected and not test_cleanup then
      raise exception 'Confirm the collected-order override before deleting %',header.order_number;
    end if;
    select coalesce(sum(case kind when 'receipt' then amount else -amount end),0) into received
      from public.payments where order_id=header.id;
    if received<0 then raise exception 'Invalid payment balance on %',header.order_number; end if;
    if received<>0 and not test_cleanup then raise exception 'Refund received payments on % before deleting a real order, or explicitly confirm test-only cleanup',header.order_number; end if;
  end loop;
  insert into private.order_deletion_batches(request_id,actor_id,reason,orders,allow_collected,test_cleanup)
    values(p_request_id,actor,reason,canonical,allow_collected,test_cleanup);
  update public.orders set deletion_test_data=test_cleanup,deletion_collected_override=((allow_collected or test_cleanup) and status='Collected'),deleted_at=now(),deleted_by=actor,deletion_reason=reason,updated_by=actor,version=version+1 where id=any(ids);
  return jsonb_build_object('deleted',cardinality(ids));
end; $$;
revoke all on function public.delete_orders(jsonb,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.delete_orders(jsonb,text,uuid,boolean,boolean) to authenticated;

notify pgrst, 'reload schema';
