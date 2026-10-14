-- No fictional business records are seeded. Only the required division reference data.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null,
  role text not null default 'staff' check (role in ('super_admin','staff')),
  active boolean not null default false,
  preferences jsonb not null default '{"accent":"#b56735","compact":false,"reduceMotion":false}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.school_divisions (
  id smallint generated always as identity primary key,
  standard text not null check (standard in ('5th','6th','7th','8th','9th','10th')),
  name text not null,
  unique(standard,name), unique(id,standard)
);
insert into public.school_divisions(standard,name) values
 ('5th','Devi Padmini'),('5th','Rana Pratap'),
 ('6th','Gautam Buddha'),('6th','Mahaveer'),
 ('7th','Chaitanya Prabhu'),('7th','Kabir'),
 ('8th','Rani Channamma'),('8th','Rani Laxmibai'),
 ('9th','Aryabhatta'),('9th','Kanad'),('10th','Dayanand'),('10th','Arvind');

create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  standard text not null,
  division_id smallint not null,
  imported_by uuid references public.profiles(id),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(division_id,standard) references public.school_divisions(id,standard)
);
-- Phones may be shared by siblings. Identity duplicates require administrative review.
create unique index students_identity on public.students(lower(trim(name)),phone,division_id);
create index students_class on public.students(standard,division_id,name);
create index students_phone on public.students(phone);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 2 and 120),
  price_per_kg numeric(10,2) not null check(price_per_kg > 0 and price_per_kg <= 1000000),
  active boolean not null default true,
  category text not null check(category in ('Sweet','Savoury')),
  description text not null default '' check(length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create sequence private.order_number_seq;
create function private.next_order_number() returns text language plpgsql set search_path='' as $$
declare value text;
begin
 value := nextval('private.order_number_seq')::text;
 return 'JP-' || lpad(value,greatest(4,length(value)),'0');
end;
$$;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default private.next_order_number(),
  student_id uuid references public.students(id) on delete restrict,
  student_name text not null default '',
  student_standard text not null default '',
  student_division text not null default '',
  customer_name text not null default '' check(length(customer_name) <= 120),
  customer_phone text not null default '',
  status text not null check(status in ('Draft','Confirmed','Ready','Collected')),
  collection_date date,
  collector_type text not null check(collector_type in ('Student','Customer')),
  collector_name text not null default '' check(length(collector_name) <= 120),
  total_amount numeric(12,2) not null default 0 check(total_amount >= 0),
  version integer not null default 1,
  request_id uuid not null unique,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status = 'Draft' or (length(trim(customer_name)) >= 2 and customer_phone ~ '^[0-9]{10}$'
    and collection_date is not null and length(trim(collector_name)) >= 2))
);
create index orders_date on public.orders(created_at desc,id);
create index orders_student on public.orders(student_id,created_at desc);
create index orders_creator on public.orders(created_by,created_at desc);
create index orders_status on public.orders(status,collection_date);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  position smallint not null check(position between 1 and 30),
  product_name text not null,
  price_per_kg numeric(10,2) not null check(price_per_kg > 0),
  quantity_kg numeric(6,2) not null check(quantity_kg > 0 and quantity_kg <= 100 and mod(quantity_kg,0.5) = 0),
  line_total numeric(12,2) generated always as (round(price_per_kg * quantity_kg,2)) stored,
  unique(order_id,product_id), unique(order_id,position)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(12,2) not null check(amount > 0),
  method text not null check(method in ('Cash','Online')),
  reference text not null default '' check(length(reference) <= 120),
  kind text not null default 'receipt' check(kind in ('receipt','refund')),
  request_id uuid not null unique,
  received_by uuid not null references public.profiles(id),
  paid_at timestamptz not null default now(),
  check(method <> 'Online' or length(trim(reference)) > 0)
);
create index payments_order on public.payments(order_id,paid_at);
create unique index payments_online_receipt_reference on public.payments(lower(trim(reference))) where method='Online' and kind='receipt';
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  record_id uuid not null,
  record_label text not null default '',
  previous_values jsonb,
  updated_values jsonb,
  created_at timestamptz not null default now()
);
create index audit_date on public.audit_logs(created_at desc,id);
create index audit_actor on public.audit_logs(actor_id,created_at desc);
create table public.organization_settings (
  id boolean primary key default true check(id),
  organization text not null default 'JPfaral' check(length(trim(organization)) between 2 and 120),
  contact text not null default '' check(length(contact) <= 200),
  address text not null default '' check(length(address) <= 2000),
  updated_at timestamptz not null default now()
);
insert into public.organization_settings(id) values(true);

create function private.is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active);
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active and role='super_admin');
$$;
create function private.require_actor(p_admin boolean default false) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_active() or (p_admin and not private.is_admin()) then
    raise exception 'An active authorized account is required' using errcode='42501';
  end if;
  return auth.uid();
end;
$$;

create function private.touch() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at = now(); return new; end;
$$;
create function private.capture_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare old_data jsonb; new_data jsonb; label text; actor uuid;
begin
  old_data := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_data := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  actor := auth.uid();
  if not exists(select 1 from public.profiles where id=actor) then actor := null; end if;
  label := coalesce(new_data->>'order_number',old_data->>'order_number',new_data->>'name',new_data->>'full_name','');
  if tg_table_name in ('order_items','payments') then
    select order_number into label from public.orders where id=coalesce(new_data->>'order_id',old_data->>'order_id')::uuid;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,record_id,record_label,previous_values,updated_values)
  values(actor,case tg_op when 'INSERT' then 'Created' when 'UPDATE' then 'Edited' else 'Deleted' end,
    tg_table_name,coalesce(new_data->>'id',old_data->>'id')::uuid,label,
    old_data - 'preferences',new_data - 'preferences');
  return coalesce(new,old);
end;
$$;
create function private.auth_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    -- Untrusted user metadata never controls role or active status.
    insert into public.profiles(id,full_name,email,role,active)
    values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'full_name'),120),''),'Staff member'),coalesce(new.email,''),'staff',false);
  else
    update public.profiles set email=coalesce(new.email,'') where id=new.id;
  end if;
  return new;
end;
$$;
create trigger auth_profile_created after insert on auth.users for each row execute function private.auth_profile();
create trigger auth_profile_email after update of email on auth.users for each row execute function private.auth_profile();
do $$ declare tbl text; begin
  foreach tbl in array array['profiles','students','products','orders','organization_settings'] loop
    execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch()',tbl);
  end loop;
  foreach tbl in array array['profiles','students','products','orders','order_items','payments'] loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.capture_audit()',tbl);
  end loop;
end $$;
-- Settings has a boolean key; its trigger records a fixed UUID instead of casting it.
create function private.audit_settings() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,action,entity_type,record_id,record_label,previous_values,updated_values)
 values(auth.uid(),'Edited','organization_settings','00000000-0000-0000-0000-000000000001','Organization',to_jsonb(old),to_jsonb(new));
 return new;
end;
$$;
create trigger audit_settings after update on public.organization_settings for each row execute function private.audit_settings();

-- Deny direct financial/profile/import writes. All mutations use checked RPCs.
do $$ declare tbl text; begin
 foreach tbl in array array['profiles','school_divisions','students','products','orders','order_items','payments','audit_logs','organization_settings'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from anon, authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
 end loop;
end $$;
create policy profiles_read on public.profiles for select to authenticated using (id=(select auth.uid()) or (select private.is_active()));
create policy divisions_read on public.school_divisions for select to authenticated using ((select private.is_active()));
create policy students_read on public.students for select to authenticated using ((select private.is_active()));
create policy products_read on public.products for select to authenticated using ((select private.is_active()));
create policy orders_read on public.orders for select to authenticated using ((select private.is_active()));
create policy items_read on public.order_items for select to authenticated using ((select private.is_active()));
create policy payments_read on public.payments for select to authenticated using ((select private.is_active()));
create policy audit_read on public.audit_logs for select to authenticated using ((select private.is_admin()));
create policy settings_read on public.organization_settings for select to authenticated using ((select private.is_active()));
grant insert,update on public.products to authenticated;
create policy products_insert on public.products for insert to authenticated with check ((select private.is_admin()));
create policy products_update on public.products for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
-- No client delete policies. Referenced history cannot be removed.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active(),private.is_admin() to authenticated;
