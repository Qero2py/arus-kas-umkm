-- Preserve the old cash and obligation tables as a read-only archive once
-- posted accounting journals become the business's source of truth.
create function private.guard_legacy_ledger_after_cutover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  v_business_id := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
  -- A parent business deletion still cascades through the old archive.
  if tg_op = 'DELETE' and not exists (
    select 1 from public.businesses b where b.id = v_business_id
  ) then
    return old;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_business_id::text, 17));
  if exists (
    select 1 from public.accounting_journals j where j.business_id = v_business_id
  ) then
    raise exception 'Legacy cash records are read-only after accounting starts'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger lock_legacy_transactions_after_cutover
before insert or update or delete on public.transactions
for each row execute function private.guard_legacy_ledger_after_cutover();

create trigger lock_legacy_obligations_after_cutover
before insert or update or delete on public.obligations
for each row execute function private.guard_legacy_ledger_after_cutover();

revoke all on function private.guard_legacy_ledger_after_cutover() from public, anon, authenticated;
