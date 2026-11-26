-- Cash-acquired assets can be revised before their first depreciation. The
-- acquisition remains linked to its original journal; effective journal and
-- revision history preserve each correction without rewriting GL history.
alter table public.accounting_fixed_assets add column effective_journal_id uuid;
alter table public.accounting_fixed_assets add constraint accounting_fixed_assets_effective_journal_fkey
  foreign key(effective_journal_id,business_id) references public.accounting_journals(id,business_id)
  on delete no action deferrable initially deferred;

create table public.accounting_fixed_asset_revisions(
  correction_id uuid primary key references public.accounting_corrections(id) on delete cascade,
  business_id uuid not null,
  asset_id uuid not null,
  old_name text not null,
  new_name text not null,
  old_cost bigint not null,
  new_cost bigint not null,
  old_ready_on date not null,
  new_ready_on date not null,
  old_life_months integer,
  new_life_months integer,
  old_cash_account_id uuid not null,
  new_cash_account_id uuid not null,
  foreign key(asset_id,business_id) references public.accounting_fixed_assets(id,business_id)
    on delete no action deferrable initially deferred
);
alter table public.accounting_fixed_asset_revisions enable row level security;
revoke all on public.accounting_fixed_asset_revisions from public,anon,authenticated;
grant select on public.accounting_fixed_asset_revisions to authenticated;
create policy "Owner reads fixed asset revisions" on public.accounting_fixed_asset_revisions
  for select to authenticated using(exists(select 1 from public.businesses b
    where b.id=business_id and b.owner_id=(select auth.uid())));

create function private.require_accounting_asset_correction_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.source_type<>'asset_correction' then return null; end if;
  if not exists(select 1 from public.accounting_corrections c
    join public.accounting_fixed_asset_revisions r on r.correction_id=c.id
    join public.accounting_fixed_assets a on a.id=r.asset_id and a.business_id=r.business_id
    where c.id::text=new.source_id and c.business_id=new.business_id
      and c.replacement_journal_id=new.id and a.effective_journal_id=new.id) then
    raise exception 'Asset correction journal needs matching revision' using errcode='23514';
  end if;
  return null;
end; $$;
create constraint trigger require_accounting_asset_correction_source_after_insert
after insert on public.accounting_journals deferrable initially deferred for each row
execute function private.require_accounting_asset_correction_source();
revoke all on function private.require_accounting_asset_correction_source() from public,anon,authenticated;

create function public.correct_cash_fixed_asset(
  p_business_id uuid,p_correction_id uuid,p_asset_id uuid,p_correction_date date,
  p_reason text,p_name text,p_cost bigint,p_ready_on date,p_life_months integer,p_cash_account_code text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_asset public.accounting_fixed_assets%rowtype;
  v_book public.accounting_fixed_asset_books%rowtype;
  v_asset_code text; v_cash_id uuid; v_old_cash_id uuid;
  v_original_journal uuid; v_reversal uuid; v_replacement uuid;
  v_start_month date; v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=(select auth.uid())) then
    raise exception 'Only owner may correct fixed assets' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,43));
  select * into v_asset from public.accounting_fixed_assets a
    where a.id=p_asset_id and a.business_id=p_business_id for update;
  if not found or v_asset.source_kind<>'cash' or v_asset.accumulated<>0
    or exists(select 1 from public.accounting_fixed_asset_depreciations d
      where d.business_id=p_business_id and d.asset_id=p_asset_id) then
    raise exception 'Only cash assets without depreciation can be corrected here' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,17));
  if p_correction_id is null or p_correction_date is null
    or p_correction_date<v_asset.acquired_on or p_correction_date>v_today
    or date_trunc('month',p_correction_date)<>date_trunc('month',v_asset.acquired_on)
    or length(btrim(coalesce(p_reason,''))) not between 10 and 500
    or length(btrim(coalesce(p_name,''))) not between 1 and 100
    or p_cost is null or p_cost not between 1 and 9007199254740991
    or p_ready_on is null or p_ready_on<v_asset.acquired_on
    or (v_asset.category='land' and p_life_months not in (0))
    or (v_asset.category<>'land' and (p_life_months is null or p_life_months not between 1 and 600)) then
    raise exception 'Invalid asset correction metadata' using errcode='22023';
  end if;
  if exists(select 1 from public.accounting_period_closures c where c.business_id=p_business_id
    and c.period_month>=date_trunc('month',p_correction_date)::date) then
    raise exception 'Accounting period is closed' using errcode='23514';
  end if;
  select * into v_book from public.accounting_fixed_asset_books b where b.business_id=p_business_id;
  v_start_month:=date_trunc('month',p_ready_on)::date;
  if v_book.last_depreciated_month is not null
    and v_start_month<=v_book.last_depreciated_month
    and v_start_month<>date_trunc('month',v_today)::date then
    raise exception 'Ready date precedes a completed depreciation month' using errcode='23514';
  end if;
  select a.code into v_asset_code from public.accounting_accounts a
    where a.id=v_asset.asset_account_id and a.business_id=p_business_id and a.active;
  select a.id into v_cash_id from public.accounting_accounts a
    where a.business_id=p_business_id and a.code=p_cash_account_code and a.role='cash' and a.active;
  v_original_journal:=coalesce(v_asset.effective_journal_id,v_asset.acquisition_journal_id);
  select l.account_id into v_old_cash_id from public.accounting_journal_lines l
    join public.accounting_accounts a on a.id=l.account_id and a.business_id=l.business_id
    where l.journal_id=v_original_journal and a.role='cash' and l.credit>0 limit 1;
  if v_asset_code is null or v_cash_id is null or v_old_cash_id is null then
    raise exception 'Asset or cash account is unavailable' using errcode='23514';
  end if;
  insert into public.accounting_corrections(id,business_id,original_journal_id,correction_date,reason,corrected_by)
    values(p_correction_id,p_business_id,v_original_journal,p_correction_date,btrim(p_reason),(select auth.uid()));
  v_reversal:=private.reverse_accounting_journal_for_correction(
    p_business_id,v_original_journal,p_correction_id,p_correction_date);
  v_replacement:=public.post_accounting_journal(p_business_id,p_correction_date,
    'asset_correction',p_correction_id::text,'Koreksi aset '||v_asset.asset_code,
    jsonb_build_array(
      jsonb_build_object('accountCode',v_asset_code,'debit',p_cost,'credit',0),
      jsonb_build_object('accountCode',p_cash_account_code,'debit',0,'credit',p_cost)));
  update public.accounting_fixed_assets set name=btrim(p_name),cost=p_cost,ready_on=p_ready_on,
    life_months=case when v_asset.category='land' then null else p_life_months end,
    remaining_months=case when v_asset.category='land' then null else p_life_months end,
    depreciation_start_month=case when v_asset.category='land' then null else v_start_month end,
    effective_journal_id=v_replacement where id=p_asset_id;
  insert into public.accounting_fixed_asset_revisions
    (correction_id,business_id,asset_id,old_name,new_name,old_cost,new_cost,
      old_ready_on,new_ready_on,old_life_months,new_life_months,old_cash_account_id,new_cash_account_id)
    values(p_correction_id,p_business_id,p_asset_id,v_asset.name,btrim(p_name),v_asset.cost,p_cost,
      v_asset.ready_on,p_ready_on,v_asset.life_months,
      case when v_asset.category='land' then null else p_life_months end,v_old_cash_id,v_cash_id);
  update public.accounting_corrections set reversal_journal_id=v_reversal,
    replacement_journal_id=v_replacement where id=p_correction_id;
  return v_replacement;
end; $$;
revoke all on function public.correct_cash_fixed_asset(uuid,uuid,uuid,date,text,text,bigint,date,integer,text)
  from public,anon,authenticated;
grant execute on function public.correct_cash_fixed_asset(uuid,uuid,uuid,date,text,text,bigint,date,integer,text)
  to authenticated;
