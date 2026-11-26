-- Opening balances are posted once, before the first operational journal.
create function private.guard_accounting_opening_sequence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.business_id::text, 17));
  if new.source_type = 'opening_balance' and (
    new.source_id <> 'initial' or exists (
      select 1 from public.accounting_journals j where j.business_id = new.business_id
    )
  ) then
    raise exception 'Opening balances must be posted once before other journals' using errcode = '23514';
  end if;
  if new.source_type <> 'opening_balance' and exists (
    select 1 from public.accounting_journals j
    where j.business_id = new.business_id and j.source_type = 'opening_balance'
      and j.entry_date > new.entry_date
  ) then
    raise exception 'Journal date precedes opening balances' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_accounting_opening_sequence_before_insert
before insert on public.accounting_journals
for each row execute function private.guard_accounting_opening_sequence();

revoke all on function private.guard_accounting_opening_sequence() from public, anon, authenticated;

create function private.guard_accounting_opening_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_type text;
  v_class text;
  v_role text;
begin
  select j.source_type, a.class, a.role into v_source_type, v_class, v_role
  from public.accounting_journals j
  join public.accounting_accounts a on a.id = new.account_id and a.business_id = new.business_id
  where j.id = new.journal_id and j.business_id = new.business_id;

  if v_source_type = 'opening_balance' and (
    v_class not in ('asset', 'liability', 'equity') or v_role = 'drawings'
  ) then
    raise exception 'Opening balances may use only balance-sheet accounts' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_accounting_opening_line_before_insert
before insert on public.accounting_journal_lines
for each row execute function private.guard_accounting_opening_line();

revoke all on function private.guard_accounting_opening_line() from public, anon, authenticated;

-- Monetary aggregates are returned as decimal strings to avoid JavaScript precision loss.
create function public.get_accounting_trial_balance(p_business_id uuid, p_as_of_date date)
returns table (
  code text, name text, class text, role text, normal text, active boolean,
  total_debit text, total_credit text, ending_debit text, ending_credit text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the business owner may read accounting reports' using errcode = '42501';
  end if;
  if p_as_of_date is null then
    raise exception 'Report date is required' using errcode = '22023';
  end if;

  return query
  with movements as (
    select a.code, a.name, a.class, a.role, a.normal, a.active,
      coalesce(sum(case when j.id is not null then l.debit else 0 end), 0) as debit_value,
      coalesce(sum(case when j.id is not null then l.credit else 0 end), 0) as credit_value
    from public.accounting_accounts a
    left join public.accounting_journal_lines l
      on l.account_id = a.id and l.business_id = p_business_id
    left join public.accounting_journals j
      on j.id = l.journal_id and j.business_id = p_business_id and j.entry_date <= p_as_of_date
    where a.business_id = p_business_id
    group by a.id, a.code, a.name, a.class, a.role, a.normal, a.active
  )
  select m.code, m.name, m.class, m.role, m.normal, m.active,
    m.debit_value::text, m.credit_value::text,
    greatest(m.debit_value - m.credit_value, 0)::text,
    greatest(m.credit_value - m.debit_value, 0)::text
  from movements m order by m.code;
end;
$$;

revoke all on function public.get_accounting_trial_balance(uuid, date) from public, anon, authenticated;
grant execute on function public.get_accounting_trial_balance(uuid, date) to authenticated;

create function public.get_accounting_ledger(
  p_business_id uuid, p_account_code text, p_as_of_date date,
  p_limit integer default 101, p_offset integer default 0
)
returns table (
  entry_date date, description text, source_type text, source_id text,
  line_no integer, debit text, credit text, running_balance text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the business owner may read accounting reports' using errcode = '42501';
  end if;
  if p_as_of_date is null or p_account_code is null or p_limit not between 1 and 201
    or p_offset not between 0 and 1000000 then
    raise exception 'Invalid ledger filter' using errcode = '22023';
  end if;

  return query
  with movements as (
    select j.id, j.entry_date, j.created_at, j.description, j.source_type, j.source_id,
      l.line_no, l.debit, l.credit,
      sum(case when a.normal = 'debit' then l.debit - l.credit else l.credit - l.debit end)
        over (order by j.entry_date, j.created_at, j.id, l.line_no) as balance_value
    from public.accounting_accounts a
    join public.accounting_journal_lines l
      on l.account_id = a.id and l.business_id = p_business_id
    join public.accounting_journals j
      on j.id = l.journal_id and j.business_id = p_business_id
    where a.business_id = p_business_id and a.code = p_account_code
      and j.entry_date <= p_as_of_date
  )
  select m.entry_date, m.description, m.source_type, m.source_id,
    m.line_no, m.debit::text, m.credit::text, m.balance_value::text
  from movements m
  order by m.entry_date, m.created_at, m.id, m.line_no
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_accounting_ledger(uuid, text, date, integer, integer) from public, anon, authenticated;
grant execute on function public.get_accounting_ledger(uuid, text, date, integer, integer) to authenticated;
