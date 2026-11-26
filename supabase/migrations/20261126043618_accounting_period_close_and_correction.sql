-- Closed calendar months and audited corrections for basic cash journals.
create table public.accounting_period_closures (
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_month date not null check (period_month = date_trunc('month',period_month)::date),
  journal_count integer not null check (journal_count >= 0),
  total_debit numeric(20,0) not null check (total_debit >= 0),
  total_credit numeric(20,0) not null check (total_credit >= 0),
  closed_by uuid not null,
  closed_at timestamptz not null default now(),
  primary key(business_id,period_month),
  check(total_debit = total_credit)
);
create table public.accounting_corrections (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  original_journal_id uuid not null,
  reversal_journal_id uuid unique,
  replacement_journal_id uuid unique,
  correction_date date not null,
  reason text not null check(length(btrim(reason)) between 10 and 500),
  corrected_by uuid not null,
  corrected_at timestamptz not null default now(),
  unique(business_id,original_journal_id),
  foreign key(original_journal_id,business_id) references public.accounting_journals(id,business_id) on delete no action deferrable initially deferred,
  foreign key(reversal_journal_id,business_id) references public.accounting_journals(id,business_id) on delete no action deferrable initially deferred,
  foreign key(replacement_journal_id,business_id) references public.accounting_journals(id,business_id) on delete no action deferrable initially deferred
);
create index accounting_corrections_business_date_idx on public.accounting_corrections(business_id,correction_date desc,corrected_at desc);
alter table public.accounting_period_closures enable row level security;
alter table public.accounting_corrections enable row level security;
revoke all on public.accounting_period_closures,public.accounting_corrections from public,anon,authenticated;
grant select on public.accounting_period_closures,public.accounting_corrections to authenticated;
create policy "Owner reads accounting period closures" on public.accounting_period_closures
  for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy "Owner reads accounting corrections" on public.accounting_corrections
  for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid())));

create function private.guard_accounting_closed_period() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.business_id::text,17));
  if exists(select 1 from public.accounting_period_closures c where c.business_id=new.business_id
    and c.period_month>=date_trunc('month',new.entry_date)::date) then
    raise exception 'Accounting period is closed' using errcode='23514';
  end if;
  if new.source_type='correction_reversal' and not exists(
    select 1 from public.accounting_corrections c where c.business_id=new.business_id
      and c.id::text=new.source_id and c.correction_date=new.entry_date) then
    raise exception 'Correction reversal requires an audit record' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger guard_accounting_closed_period_before_insert before insert on public.accounting_journals
  for each row execute function private.guard_accounting_closed_period();
revoke all on function private.guard_accounting_closed_period() from public,anon,authenticated;

create function private.guard_closed_inventory_movement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.business_id::text,17));
  if exists(select 1 from public.accounting_period_closures c where c.business_id=new.business_id
    and c.period_month>=date_trunc('month',new.event_date)::date) then
    raise exception 'Accounting period is closed' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger guard_closed_inventory_movement_before_insert before insert on public.inventory_movements
  for each row execute function private.guard_closed_inventory_movement();
revoke all on function private.guard_closed_inventory_movement() from public,anon,authenticated;

create function private.guard_closed_account_label() returns trigger
language plpgsql security definer set search_path='' as $$
begin
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
create trigger guard_closed_account_label_before_update before update of name,active on public.accounting_accounts
  for each row execute function private.guard_closed_account_label();
revoke all on function private.guard_closed_account_label() from public,anon,authenticated;

create function public.close_accounting_period(p_business_id uuid,p_month date) returns void
language plpgsql security definer set search_path='' as $$
declare v_first_month date; v_last_closed date; v_count integer; v_debit numeric; v_credit numeric;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=(select auth.uid())) then
    raise exception 'Only the business owner may close a period' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,17));
  if p_month is null or p_month<>date_trunc('month',p_month)::date
    or p_month>=date_trunc('month',now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Close a completed calendar month only' using errcode='22023';
  end if;
  select date_trunc('month',min(j.entry_date))::date into v_first_month
    from public.accounting_journals j where j.business_id=p_business_id;
  select max(c.period_month) into v_last_closed from public.accounting_period_closures c
    where c.business_id=p_business_id;
  if v_first_month is null or p_month<>coalesce((v_last_closed+interval '1 month')::date,v_first_month) then
    raise exception 'Close periods in order, beginning with the first journal month' using errcode='23514';
  end if;
  select count(distinct j.id)::integer,coalesce(sum(l.debit),0),coalesce(sum(l.credit),0)
    into v_count,v_debit,v_credit from public.accounting_journals j
    join public.accounting_journal_lines l on l.journal_id=j.id
    where j.business_id=p_business_id and j.entry_date>=p_month
      and j.entry_date<(p_month+interval '1 month')::date;
  if v_debit<>v_credit then raise exception 'The period journal is not balanced' using errcode='23514'; end if;
  insert into public.accounting_period_closures(business_id,period_month,journal_count,total_debit,total_credit,closed_by)
    values(p_business_id,p_month,v_count,v_debit,v_credit,(select auth.uid()));
end; $$;
revoke all on function public.close_accounting_period(uuid,date) from public,anon,authenticated;
grant execute on function public.close_accounting_period(uuid,date) to authenticated;

create function public.correct_basic_accounting_journal(
  p_business_id uuid,p_correction_id uuid,p_original_journal_id uuid,p_correction_date date,
  p_reason text,p_description text,p_amount bigint,p_debit_account_code text,p_credit_account_code text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_original public.accounting_journals%rowtype;
  v_debit_id uuid; v_credit_id uuid; v_debit_role text; v_credit_role text;
  v_reversal_id uuid; v_replacement_id uuid;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=(select auth.uid())) then
    raise exception 'Only the business owner may correct journals' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,17));
  select * into v_original from public.accounting_journals
    where id=p_original_journal_id and business_id=p_business_id for update;
  if not found or v_original.source_type not in
    ('cash_sale','cash_expense','capital_contribution','owner_draw','cash_transfer') then
    raise exception 'Only basic cash journals can be corrected here' using errcode='23514';
  end if;
  if p_correction_id is null or p_correction_date is null or p_correction_date<v_original.entry_date
    or p_correction_date>(now() at time zone 'Asia/Jakarta')::date
    or date_trunc('month',p_correction_date)<>date_trunc('month',v_original.entry_date)
    or length(btrim(coalesce(p_reason,''))) not between 10 and 500
    or length(btrim(coalesce(p_description,''))) not between 1 and 250
    or p_amount is null or p_amount not between 1 and 9007199254740991 then
    raise exception 'Invalid correction metadata or amount' using errcode='22023';
  end if;
  if exists(select 1 from public.accounting_period_closures c where c.business_id=p_business_id
    and c.period_month>=date_trunc('month',p_correction_date)::date) then
    raise exception 'Accounting period is closed' using errcode='23514';
  end if;
  if exists(select 1 from public.accounting_corrections c where c.business_id=p_business_id
    and c.original_journal_id=p_original_journal_id) then
    raise exception 'Journal has already been corrected' using errcode='23505';
  end if;
  select a.id,a.role into v_debit_id,v_debit_role from public.accounting_accounts a
    where a.business_id=p_business_id and a.code=p_debit_account_code and a.active;
  select a.id,a.role into v_credit_id,v_credit_role from public.accounting_accounts a
    where a.business_id=p_business_id and a.code=p_credit_account_code and a.active;
  if v_debit_id is null or v_credit_id is null or v_debit_id=v_credit_id or not (
    (v_original.source_type='cash_sale' and v_debit_role='cash' and v_credit_role='revenue') or
    (v_original.source_type='cash_expense' and v_debit_role='expense' and v_credit_role='cash') or
    (v_original.source_type='capital_contribution' and v_debit_role='cash' and v_credit_role='capital') or
    (v_original.source_type='owner_draw' and v_debit_role='drawings' and v_credit_role='cash') or
    (v_original.source_type='cash_transfer' and v_debit_role='cash' and v_credit_role='cash')
  ) then raise exception 'Replacement accounts do not match the transaction type' using errcode='23514'; end if;
  insert into public.accounting_corrections(id,business_id,original_journal_id,correction_date,reason,corrected_by)
    values(p_correction_id,p_business_id,p_original_journal_id,p_correction_date,btrim(p_reason),(select auth.uid()));
  insert into public.accounting_journals(business_id,entry_date,source_type,source_id,description,created_by)
    values(p_business_id,p_correction_date,'correction_reversal',p_correction_id::text,
      'Pembalik: '||left(v_original.description,240),(select auth.uid())) returning id into v_reversal_id;
  insert into public.accounting_journal_lines(business_id,journal_id,account_id,line_no,debit,credit)
    select p_business_id,v_reversal_id,l.account_id,l.line_no,l.credit,l.debit
    from public.accounting_journal_lines l where l.journal_id=p_original_journal_id;
  v_replacement_id:=public.post_accounting_journal(p_business_id,p_correction_date,v_original.source_type,
    p_correction_id::text,btrim(p_description),jsonb_build_array(
      jsonb_build_object('accountCode',p_debit_account_code,'debit',p_amount,'credit',0),
      jsonb_build_object('accountCode',p_credit_account_code,'debit',0,'credit',p_amount)));
  update public.accounting_corrections set reversal_journal_id=v_reversal_id,
    replacement_journal_id=v_replacement_id where id=p_correction_id;
  return v_replacement_id;
end; $$;
revoke all on function public.correct_basic_accounting_journal(uuid,uuid,uuid,date,text,text,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.correct_basic_accounting_journal(uuid,uuid,uuid,date,text,text,bigint,text,text)
  to authenticated;
