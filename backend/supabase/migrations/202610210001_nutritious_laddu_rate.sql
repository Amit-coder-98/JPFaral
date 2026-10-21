-- Client's revised 250 g rate: INR 175 = INR 700/kg.
-- Forward only; do not alter item snapshots, totals, payments, RLS or receipts.
do $$
declare matches integer;
begin
  lock table public.products in share row exclusive mode;
  select count(*) into matches from public.products
    where name='पौष्टिक लाडू (तुपातील)';
  if matches<>1 then
    raise exception 'Expected one पौष्टिक लाडू (तुपातील) product; found %. Review the catalogue before applying.',matches;
  end if;
  update public.products set price_per_kg=700.00
    where name='पौष्टिक लाडू (तुपातील)' and price_per_kg is distinct from 700.00;
end;
$$;
