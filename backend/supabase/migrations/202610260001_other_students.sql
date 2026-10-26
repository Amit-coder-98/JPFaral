-- Saved 1st-4th students, kept separate from the reviewed 5th-10th divisions.
-- No existing students, orders, price snapshots or payments are backfilled.
alter table public.students add column if not exists other_division text not null default '';
alter table public.students alter column division_id drop not null;
alter table public.students drop constraint if exists students_class_assignment;
alter table public.students add constraint students_class_assignment check (
  (division_id is not null and standard in ('5th','6th','7th','8th','9th','10th') and other_division='')
  or (division_id is null and standard in ('1st','2nd','3rd','4th') and length(other_division)<=60)
);
comment on column public.students.other_division is 'Optional manually entered division for Others (1st-4th) only. Named 5th-10th divisions retain their existing FK.';

drop index if exists public.students_identity;
create unique index students_identity on public.students(lower(trim(name)),phone,division_id)
  nulls not distinct where division_id is not null;
create unique index if not exists students_other_identity on public.students
  (lower(regexp_replace(trim(name),'[[:space:]]+',' ','g')),standard,lower(trim(other_division)),phone)
  nulls not distinct where division_id is null;

-- Narrow staff operation: cannot import/edit the reviewed senior directory.
-- The identity lock and lookup make retries/concurrent saves reuse a student.
create or replace function public.save_other_student(p_name text,p_standard text,p_division text default '',p_phone text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; saved_id uuid; matches integer;
  student_name text:=regexp_replace(trim(coalesce(p_name,'')),'[[:space:]]+',' ','g');
  division_name text:=trim(coalesce(p_division,'')); phone_value text:=nullif(trim(p_phone),'');
begin
  actor:=private.require_actor();
  if p_standard is null or p_standard not in ('1st','2nd','3rd','4th') then raise exception 'Others supports 1st to 4th standard only'; end if;
  if length(student_name) not between 2 and 120 then raise exception 'Enter a student name of 2 to 120 characters'; end if;
  if length(division_name)>60 then raise exception 'Division must be at most 60 characters'; end if;
  if phone_value is not null and phone_value !~ '^[0-9]{10}$' then raise exception 'Student phone must have 10 digits when provided'; end if;
  perform pg_advisory_xact_lock(hashtextextended('jpfaral-others:'||lower(student_name)||':'||p_standard||':'||lower(division_name),0));
  select id into saved_id from public.students where division_id is null and standard=p_standard
    and lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))=lower(student_name)
    and lower(trim(other_division))=lower(division_name) and phone is not distinct from phone_value;
  if found then return saved_id; end if;
  if phone_value is null then
    select count(*),(array_agg(id order by id))[1] into matches,saved_id from public.students where division_id is null and standard=p_standard
      and lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))=lower(student_name) and lower(trim(other_division))=lower(division_name);
    if matches=1 then return saved_id; end if;
    if matches>1 then raise exception 'More than one student has this name. Select the correct saved student using their phone and class.'; end if;
  else
    -- Supplying a previously absent phone never overwrites a populated number.
    select id into saved_id from public.students where division_id is null and standard=p_standard and phone is null
      and lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))=lower(student_name) and lower(trim(other_division))=lower(division_name);
    if found then update public.students set phone=phone_value where id=saved_id; return saved_id; end if;
  end if;
  insert into public.students(name,phone,standard,division_id,other_division,imported_by)
    values(student_name,phone_value,p_standard,null,division_name,actor) returning id into saved_id;
  return saved_id;
end; $$;
revoke all on function public.save_other_student(text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_other_student(text,text,text,text) to authenticated;

-- Enrich only NEW/changed student associations. Existing historical snapshots
-- remain unchanged on normal edits, payments and collection operations.
create or replace function private.snapshot_other_student() returns trigger
language plpgsql security definer set search_path='' as $$
declare student public.students;
begin
  if new.student_id is not null and (tg_op='INSERT' or new.student_id is distinct from old.student_id) then
    select * into student from public.students where id=new.student_id and division_id is null and standard in ('1st','2nd','3rd','4th');
    if found then
      new.student_name:=student.name; new.student_standard:=student.standard; new.student_division:=student.other_division;
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.snapshot_other_student() from public,anon,authenticated;
drop trigger if exists snapshot_other_student on public.orders;
create trigger snapshot_other_student before insert or update of student_id on public.orders
  for each row execute function private.snapshot_other_student();

notify pgrst, 'reload schema';
