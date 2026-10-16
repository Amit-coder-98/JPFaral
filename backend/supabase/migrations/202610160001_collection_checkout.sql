-- Forward-only: retain historical Ready records, price snapshots, receipt numbers,
-- immutable payments and audit history. New collections settle the balance atomically.
create table if not exists private.order_collection_requests (
  request_id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.order_collection_requests from public, anon, authenticated;

create or replace function private.immutable_collection_request() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Collection request history is immutable'; end; $$;
drop trigger if exists immutable_collection_request on private.order_collection_requests;
create trigger immutable_collection_request before update or delete on private.order_collection_requests
for each row execute function private.immutable_collection_request();

create or replace function public.set_order_status(p_id uuid,p_status text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid; header public.orders; received numeric;
begin
  actor:=private.require_actor();
  select * into header from public.orders where id=p_id for update;
  if not found then raise exception 'Order not found'; end if;
  if header.deleted_at is not null then raise exception 'Deleted orders cannot change collection status'; end if;
  if p_version is null or p_version<>header.version then raise exception 'This order changed. Refresh before updating.' using errcode='40001'; end if;
  if p_status is distinct from 'Collected' or header.status not in ('Confirmed','Ready') then raise exception 'Invalid collection status transition'; end if;
  select coalesce(sum(case kind when 'receipt' then amount else -amount end),0) into received from public.payments where order_id=p_id;
  if received<>header.total_amount then raise exception 'Receive the outstanding balance before collection'; end if;
  update public.orders set status='Collected',updated_by=actor,version=version+1 where id=p_id;
end; $$;

create or replace function public.collect_order(p_id uuid,p_version integer,p_request_id uuid,
  p_amount numeric default 0,p_method text default 'Cash',p_reference text default '')
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid; header public.orders; received numeric; due numeric; canonical jsonb;
  prior private.order_collection_requests; reference text;
begin
  actor:=private.require_actor();
  if p_request_id is null then raise exception 'A collection request ID is required'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<0
    or p_amount<>round(p_amount,2) or p_amount>9999999999.99
    or p_method is null or p_method not in ('Cash','Online') then raise exception 'Invalid collection payment'; end if;
  reference:=case when p_method='Cash' then '' else trim(coalesce(p_reference,'')) end;
  if length(reference)>120 or (p_amount>0 and p_method='Online' and reference='') then raise exception 'UTR is required for online collection payments (maximum 120 characters)'; end if;
  canonical:=jsonb_build_object('orderId',p_id,'version',p_version,'amount',p_amount,'method',p_method,'reference',reference);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into header from public.orders where id=p_id for update;
  if not found then raise exception 'Order not found'; end if;
  if header.deleted_at is not null then raise exception 'Deleted orders cannot be collected'; end if;
  select * into prior from private.order_collection_requests where request_id=p_request_id;
  if found then
    if prior.actor_id<>actor or prior.payload is distinct from canonical then raise exception 'Collection request ID has already been used'; end if;
    return;
  end if;
  if p_version is null or p_version<>header.version then raise exception 'This order changed. Refresh before collection.' using errcode='40001'; end if;
  if header.status not in ('Confirmed','Ready') then raise exception 'Only confirmed orders can be collected'; end if;
  if exists(select 1 from public.payments where request_id=p_request_id)
    or exists(select 1 from public.orders where request_id=p_request_id) then raise exception 'Collection request ID has already been used'; end if;
  select coalesce(sum(case kind when 'receipt' then amount else -amount end),0) into received from public.payments where order_id=p_id;
  due:=header.total_amount-received;
  if due<0 or p_amount<>due then raise exception 'Receive the exact outstanding balance (%) before collection',due; end if;
  insert into private.order_collection_requests(request_id,order_id,actor_id,payload) values(p_request_id,p_id,actor,canonical);
  if p_amount>0 then perform public.record_payment(p_id,p_amount,p_method,reference,p_request_id,'receipt'); end if;
  -- Payment adds its own version/audit event. Handover is a distinct audited update
  -- in the same transaction, and uses the freshly updated row version.
  perform public.set_order_status(p_id,'Collected',(select version from public.orders where id=p_id));
end; $$;

create or replace function private.reject_new_ready_status() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='Ready' and (tg_op='INSERT' or old.status is distinct from 'Ready') then
    raise exception 'Ready status has been removed; collect a confirmed order directly';
  end if;
  return new;
end; $$;
drop trigger if exists reject_new_ready_status on public.orders;
create trigger reject_new_ready_status before insert or update of status on public.orders
for each row execute function private.reject_new_ready_status();

revoke all on function private.immutable_collection_request(),private.reject_new_ready_status(),
  public.collect_order(uuid,integer,uuid,numeric,text,text),public.set_order_status(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.collect_order(uuid,integer,uuid,numeric,text,text),public.set_order_status(uuid,text,integer) to authenticated;
notify pgrst, 'reload schema';
