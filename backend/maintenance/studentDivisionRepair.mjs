// Builds a reviewed data repair, never a schema migration. Run as the project
// owner. Normal clients retain their existing read-only student permissions.
// Existing audit triggers record owner maintenance with a NULL actor; no user
// identity is impersonated and no historical order snapshot is rewritten.
export function buildStudentDivisionRepairSql(changes, expectedStudentCount, { dryRun = false } = {}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(changes) || !changes.length || changes.length > 2000 ||
      !Number.isSafeInteger(expectedStudentCount) || expectedStudentCount < changes.length)
    throw new Error('Provide reviewed corrections and the expected directory count');
  const seen = new Set();
  const payload = changes.map(({ id, name, standard, from, to, batch }) => {
    if (!uuid.test(id) || !uuid.test(batch) || seen.has(id) ||
        typeof name !== 'string' || name.trim().length < 2 || name.length > 120 ||
        !/^(5th|6th|7th|8th|9th|10th)$/.test(standard) ||
        typeof from !== 'string' || typeof to !== 'string' || !from || !to || from === to)
      throw new Error('Invalid or duplicate reviewed correction');
    seen.add(id);
    return { id, name, standard, from, to, batch };
  });
  const literal = JSON.stringify(payload).replaceAll("'", "''");
  let delimiter = '$jpfaral_repair$';
  while (literal.includes(delimiter)) delimiter = delimiter.replace(/\$$/, '_x$');
  return `begin;
do ${delimiter}
declare reviewed jsonb := '${literal}'::jsonb; changed integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('jpfaral-student-import',0));
  lock table public.students in share row exclusive mode;
  if (select count(*) from public.students) <> ${expectedStudentCount} then
    raise exception 'Directory count changed; repeat the source audit';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(reviewed) r(id uuid,name text,standard text,"from" text,"to" text,batch uuid)
    left join public.students s on s.id=r.id
    left join public.school_divisions current_division on current_division.id=s.division_id
    left join public.school_divisions target on target.standard=r.standard and target.name=r."to"
    where s.id is null or s.name is distinct from r.name or s.standard is distinct from r.standard
      or s.import_batch_id is distinct from r.batch or target.id is null
      or current_division.name not in (r."from",r."to")
  ) then
    raise exception 'Reviewed identity, source division or target changed; repair aborted';
  end if;
  update public.students s set division_id=target.id
  from jsonb_to_recordset(reviewed) r(id uuid,name text,standard text,"from" text,"to" text,batch uuid),
       public.school_divisions target, public.school_divisions current_division
  where s.id=r.id and target.standard=r.standard and target.name=r."to"
    and current_division.id=s.division_id and current_division.name=r."from";
  get diagnostics changed = row_count;
  raise notice 'Reviewed student divisions corrected: %', changed;
end;
${delimiter};
select count(*) as student_count from public.students;
${dryRun ? 'rollback' : 'commit'};
`;
}
