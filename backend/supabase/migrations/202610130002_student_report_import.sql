-- Student reports may omit phones. Orders still require a real customer phone.
-- Existing populated phones, order snapshots, receipts and RLS stay unchanged.
alter table public.students alter column phone drop not null;
comment on column public.students.phone is 'Optional real 10-digit phone. NULL means not supplied; never invent a placeholder.';
-- The existing phone-format CHECK already rejects invalid populated values and
-- permits NULL. Treat absent phones as equal for exact identity uniqueness.
drop index if exists public.students_identity;
create unique index students_identity on public.students(lower(trim(name)),phone,division_id) nulls not distinct;

create or replace function public.import_students(p_rows jsonb,p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; row_data jsonb; division smallint; phone_value text; inserted integer:=0; skipped integer:=0;
begin
 actor:=private.require_actor(true);
 if p_batch_id is null or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
  raise exception 'Import requires 1 to 2000 reviewed rows and a batch ID';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('jpfaral-student-import',0));
 for row_data in select value from jsonb_array_elements(p_rows) loop
  select id into division from public.school_divisions where standard=row_data->>'standard' and name=row_data->>'division';
  if division is null then raise exception 'Invalid standard and division for student %',row_data->>'name'; end if;
  phone_value:=nullif(trim(row_data->>'phone'),'');
  if phone_value is not null and phone_value !~ '^[0-9]{10}$' then raise exception 'Phone must have 10 digits when provided'; end if;
  -- Retrying the exact reviewed batch is safe, including missing phone values.
  if exists(select 1 from public.students where lower(trim(name))=lower(trim(row_data->>'name'))
    and phone is not distinct from phone_value and division_id=division and import_batch_id=p_batch_id and imported_by=actor) then
   skipped:=skipped+1; continue;
  end if;
  -- An absent phone cannot distinguish two otherwise identical identities.
  -- Block for review rather than creating another record or overwriting contact data.
  if exists(select 1 from public.students where lower(trim(name))=lower(trim(row_data->>'name')) and division_id=division
    and (phone is not distinct from phone_value or phone is null or phone_value is null)) then
   raise exception 'Duplicate student requires administrative review: %',row_data->>'name';
  end if;
  insert into public.students(name,phone,standard,division_id,imported_by,import_batch_id)
  values(trim(row_data->>'name'),phone_value,row_data->>'standard',division,actor,p_batch_id);
  inserted:=inserted+1;
 end loop;
 return jsonb_build_object('inserted',inserted,'skipped',skipped);
end;
$$;
revoke all on function public.import_students(jsonb,uuid) from public,anon;
grant execute on function public.import_students(jsonb,uuid) to authenticated;
