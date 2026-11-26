-- Serialize account-label changes with closing so closed reports keep their labels.
create or replace function private.guard_closed_account_label() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.business_id::text,17));
  if (new.name is distinct from old.name or new.active is distinct from old.active) and exists(
    select 1 from public.accounting_journal_lines l
    join public.accounting_journals j on j.id=l.journal_id
    join public.accounting_period_closures c on c.business_id=j.business_id
      and c.period_month>=date_trunc('month',j.entry_date)::date
    where l.account_id=old.id) then
    raise exception 'An account used in a closed period cannot be renamed or deactivated' using errcode='23514';
  end if;
  return new;
end; $$;
