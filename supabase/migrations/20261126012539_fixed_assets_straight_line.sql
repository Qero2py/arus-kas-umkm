-- Asset register is distinct from the old cash book. Opening allocations are
-- reconciled to already-posted fixed-asset and accumulated-depreciation accounts.
create table public.accounting_fixed_assets (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  asset_code text not null check (asset_code ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  category text not null check (category in ('land','building','equipment','vehicle','other')),
  acquired_on date not null,
  ready_on date not null check (ready_on >= acquired_on),
  cost bigint not null check (cost between 1 and 9007199254740991),
  initial_accumulated bigint not null default 0 check (initial_accumulated >= 0),
  accumulated bigint not null default 0 check (accumulated >= 0 and accumulated <= cost),
  life_months integer,
  depreciation_start_month date,
  remaining_months integer,
  asset_account_id uuid not null,
  accumulated_account_id uuid,
  expense_account_id uuid,
  source_kind text not null check (source_kind in ('opening','cash','credit')),
  acquisition_journal_id uuid,
  credit_document_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, asset_code),
  unique (id,business_id),
  foreign key (asset_account_id,business_id) references public.accounting_accounts (id,business_id)
    on delete no action deferrable initially deferred,
  foreign key (accumulated_account_id,business_id) references public.accounting_accounts (id,business_id)
    on delete no action deferrable initially deferred,
  foreign key (expense_account_id,business_id) references public.accounting_accounts (id,business_id)
    on delete no action deferrable initially deferred,
  foreign key (acquisition_journal_id,business_id) references public.accounting_journals (id,business_id)
    on delete no action deferrable initially deferred,
  foreign key (credit_document_id,business_id) references public.accounting_credit_documents (id,business_id)
    on delete no action deferrable initially deferred,
  check ((category = 'land' and life_months is null and accumulated_account_id is null
    and expense_account_id is null and initial_accumulated = 0 and accumulated = 0
    and remaining_months is null and depreciation_start_month is null)
    or (category <> 'land' and life_months between 1 and 600
      and accumulated_account_id is not null and expense_account_id is not null
      and initial_accumulated <= cost
      and ((remaining_months is null and depreciation_start_month is null)
        or (remaining_months between 0 and 600 and depreciation_start_month is not null)))),
  check ((source_kind = 'opening' and acquisition_journal_id is null and credit_document_id is null)
    or (source_kind = 'cash' and acquisition_journal_id is not null and credit_document_id is null)
    or (source_kind = 'credit' and acquisition_journal_id is not null and credit_document_id = id))
);
create index accounting_fixed_assets_business_ready_idx
  on public.accounting_fixed_assets (business_id,ready_on,id);

create table public.accounting_fixed_asset_books (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  started_month date not null check (extract(day from started_month) = 1),
  last_depreciated_month date,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.accounting_fixed_asset_depreciations (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  asset_id uuid not null,
  period_month date not null check (extract(day from period_month) = 1),
  posted_on date not null,
  amount bigint not null check (amount between 1 and 9007199254740991),
  journal_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id,asset_id,period_month),
  foreign key (asset_id,business_id) references public.accounting_fixed_assets (id,business_id)
    on delete no action deferrable initially deferred,
  foreign key (journal_id,business_id) references public.accounting_journals (id,business_id)
    on delete no action deferrable initially deferred
);
create index accounting_asset_depreciations_business_period_idx
  on public.accounting_fixed_asset_depreciations (business_id,period_month,asset_id);

alter table public.accounting_fixed_assets enable row level security;
alter table public.accounting_fixed_asset_books enable row level security;
alter table public.accounting_fixed_asset_depreciations enable row level security;
revoke all on public.accounting_fixed_assets,public.accounting_fixed_asset_books,
  public.accounting_fixed_asset_depreciations from anon,authenticated;
grant select on public.accounting_fixed_assets,public.accounting_fixed_asset_books,
  public.accounting_fixed_asset_depreciations to authenticated;
create policy "Owner reads fixed assets" on public.accounting_fixed_assets
for select to authenticated using (exists (select 1 from public.businesses b
  where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner reads fixed asset book" on public.accounting_fixed_asset_books
for select to authenticated using (exists (select 1 from public.businesses b
  where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner reads depreciation" on public.accounting_fixed_asset_depreciations
for select to authenticated using (exists (select 1 from public.businesses b
  where b.id = business_id and b.owner_id = (select auth.uid())));

create function public.register_fixed_asset(p_business_id uuid,p_asset_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p_payload->>'sourceKind';
  v_category text := p_payload->>'category';
  v_code text := upper(btrim(p_payload->>'assetCode'));
  v_name text := btrim(p_payload->>'name');
  v_acquired date;
  v_ready date;
  v_cost bigint;
  v_initial bigint;
  v_life integer;
  v_asset_account uuid;
  v_accum_account uuid;
  v_expense_account uuid;
  v_asset_code text := p_payload->>'assetAccountCode';
  v_cash_code text := p_payload->>'cashAccountCode';
  v_book_month date;
  v_start_month date;
  v_journal uuid;
  v_document uuid;
  v_elapsed integer;
  v_remaining integer;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())) then
    raise exception 'Only owner may register fixed assets' using errcode = '42501';
  end if;
  if p_asset_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or v_kind is null or v_kind not in ('opening','cash','credit')
    or v_category is null or v_category not in ('land','building','equipment','vehicle','other')
    or v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'
    or length(coalesce(v_name,'')) not between 1 and 100
    or coalesce(p_payload->>'acquiredOn','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_payload->>'readyOn','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_payload->>'cost','') !~ '^[1-9][0-9]*$'
    or coalesce(p_payload->>'initialAccumulated','') !~ '^(0|[1-9][0-9]*)$' then
    raise exception 'Invalid fixed-asset fields' using errcode = '22023';
  end if;
  v_acquired := (p_payload->>'acquiredOn')::date;
  v_ready := (p_payload->>'readyOn')::date;
  v_cost := (p_payload->>'cost')::bigint;
  v_initial := (p_payload->>'initialAccumulated')::bigint;
  if v_acquired > (now() at time zone 'Asia/Jakarta')::date or v_ready < v_acquired
    or v_cost not between 1 and 9007199254740991 or v_initial not between 0 and v_cost
    or (v_kind <> 'opening' and v_initial <> 0) then
    raise exception 'Invalid asset dates or amounts' using errcode = '22023';
  end if;
  if v_category = 'land' then
    if v_initial <> 0 or p_payload->>'lifeMonths' not in ('','0')
      and p_payload->>'lifeMonths' is not null then
      raise exception 'Land must not be depreciated' using errcode = '23514';
    end if;
    v_life := null;
  else
    if coalesce(p_payload->>'lifeMonths','') !~ '^[1-9][0-9]{0,2}$' then
      raise exception 'Useful life is required' using errcode = '22023';
    end if;
    v_life := (p_payload->>'lifeMonths')::integer;
    if v_life > 600 then raise exception 'Useful life exceeds 600 months' using errcode = '22023'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text, 43));
  select started_month into v_book_month from public.accounting_fixed_asset_books
    where business_id = p_business_id;
  if (v_kind = 'opening' and v_book_month is not null)
    or (v_kind <> 'opening' and v_book_month is null) then
    raise exception 'Opening assets require an inactive book; purchases require an active book'
      using errcode = '23514';
  end if;
  if v_kind <> 'opening' and v_acquired < v_book_month then
    raise exception 'Asset acquisition predates active book' using errcode = '23514';
  end if;
  select a.id into v_asset_account from public.accounting_accounts a
    where a.business_id = p_business_id and a.code = v_asset_code
      and a.role = 'fixed_asset' and a.active;
  if v_category <> 'land' then
    select a.id into v_accum_account from public.accounting_accounts a
      where a.business_id = p_business_id and a.code = p_payload->>'accumulatedAccountCode'
        and a.role = 'accumulated_depreciation' and a.active;
    select a.id into v_expense_account from public.accounting_accounts a
      where a.business_id = p_business_id and a.code = p_payload->>'expenseAccountCode'
        and a.role = 'depreciation_expense' and a.active;
  end if;
  if v_asset_account is null or (v_category <> 'land' and
    (v_accum_account is null or v_expense_account is null)) then
    raise exception 'Fixed asset account roles do not match' using errcode = '23514';
  end if;
  if v_category <> 'land' and v_kind <> 'opening' then
    v_start_month := date_trunc('month',v_ready)::date;
    v_remaining := v_life;
  end if;
  if v_kind = 'cash' then
    if not exists (select 1 from public.accounting_accounts a where a.business_id = p_business_id
      and a.code = v_cash_code and a.role = 'cash' and a.active) then
      raise exception 'Cash account missing' using errcode = '23514';
    end if;
    v_journal := public.post_accounting_journal(p_business_id,v_acquired,'asset_purchase',
      p_asset_id::text,'Pembelian aset '||v_code,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('accountCode',v_asset_code,'debit',v_cost,'credit',0),
        pg_catalog.jsonb_build_object('accountCode',v_cash_code,'debit',0,'credit',v_cost)));
  elsif v_kind = 'credit' then
    if coalesce(p_payload->>'contactId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$'
      or coalesce(p_payload->>'documentNo','') = ''
      or coalesce(p_payload->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or not exists (select 1 from public.accounting_accounts a where a.business_id = p_business_id
        and a.code = p_payload->>'payableAccountCode' and a.role = 'payable' and a.active) then
      raise exception 'Invalid asset credit fields' using errcode = '23514';
    end if;
    v_document := public.create_accounting_credit_document(p_business_id,p_asset_id,'purchase',
      (p_payload->>'contactId')::uuid,p_payload->>'documentNo',v_acquired,
      (p_payload->>'dueDate')::date,'Pembelian aset '||v_code,v_cost,
      v_asset_code,p_payload->>'payableAccountCode');
    select d.journal_id into v_journal from public.accounting_credit_documents d
      where d.id = v_document and d.business_id = p_business_id;
  end if;
  insert into public.accounting_fixed_assets (id,business_id,asset_code,name,category,
    acquired_on,ready_on,cost,initial_accumulated,accumulated,life_months,
    depreciation_start_month,remaining_months,asset_account_id,accumulated_account_id,
    expense_account_id,source_kind,acquisition_journal_id,credit_document_id,created_by)
  values (p_asset_id,p_business_id,v_code,v_name,v_category,v_acquired,v_ready,v_cost,
    v_initial,v_initial,v_life,v_start_month,v_remaining,v_asset_account,v_accum_account,
    v_expense_account,v_kind,v_journal,v_document,(select auth.uid()));
  return p_asset_id;
end; $$;
revoke all on function public.register_fixed_asset(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.register_fixed_asset(uuid,uuid,jsonb) to authenticated;

create function public.activate_fixed_assets(p_business_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month',now() at time zone 'Asia/Jakarta')::date;
  v_asset public.accounting_fixed_assets%rowtype;
  v_ready_month date;
  v_elapsed integer;
  v_account record;
  v_gl numeric;
  v_register numeric;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())) then
    raise exception 'Only owner may activate fixed assets' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text, 43));
  if exists (select 1 from public.accounting_fixed_asset_books b where b.business_id = p_business_id) then
    raise exception 'Fixed assets already active' using errcode = '23514';
  end if;
  for v_account in select a.id,a.role from public.accounting_accounts a
    where a.business_id = p_business_id and a.role in ('fixed_asset','accumulated_depreciation') loop
    select coalesce(sum(case when v_account.role = 'fixed_asset' then l.debit::numeric-l.credit::numeric
      else l.credit::numeric-l.debit::numeric end),0) into v_gl
      from public.accounting_journal_lines l where l.business_id = p_business_id and l.account_id = v_account.id;
    select coalesce(sum(case when v_account.role = 'fixed_asset' then a.cost::numeric
      else a.accumulated::numeric end),0) into v_register
      from public.accounting_fixed_assets a where a.business_id = p_business_id
        and (case when v_account.role = 'fixed_asset' then a.asset_account_id else a.accumulated_account_id end) = v_account.id;
    if v_gl <> v_register then
      raise exception 'Asset register must equal fixed-asset and depreciation GL balances'
        using errcode = '23514';
    end if;
  end loop;
  for v_asset in select * from public.accounting_fixed_assets a
    where a.business_id = p_business_id and a.category <> 'land' for update loop
    v_ready_month := date_trunc('month',v_asset.ready_on)::date;
    v_elapsed := greatest(0,(extract(year from age(v_month,v_ready_month))::integer*12
      + extract(month from age(v_month,v_ready_month))::integer));
    if v_ready_month >= v_month then
      if v_asset.initial_accumulated <> 0 then
        raise exception 'Future-ready asset cannot have prior depreciation' using errcode = '23514';
      end if;
      update public.accounting_fixed_assets set depreciation_start_month = v_ready_month,
        remaining_months = v_asset.life_months where id = v_asset.id;
    elsif v_elapsed >= v_asset.life_months then
      if v_asset.initial_accumulated <> v_asset.cost then
        raise exception 'Expired useful life needs fully depreciated opening balance' using errcode = '23514';
      end if;
      update public.accounting_fixed_assets set depreciation_start_month = v_month,
        remaining_months = 0 where id = v_asset.id;
    else
      update public.accounting_fixed_assets set depreciation_start_month = v_month,
        remaining_months = v_asset.life_months - v_elapsed where id = v_asset.id;
    end if;
  end loop;
  insert into public.accounting_fixed_asset_books (business_id,started_month,created_by)
    values (p_business_id,v_month,(select auth.uid()));
end; $$;
revoke all on function public.activate_fixed_assets(uuid) from public,anon,authenticated;
grant execute on function public.activate_fixed_assets(uuid) to authenticated;

create function private.check_fixed_asset_gl()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text; v_gl numeric; v_register numeric;
begin
  if not exists (select 1 from public.accounting_fixed_asset_books b where b.business_id = new.business_id) then return null; end if;
  select a.role into v_role from public.accounting_accounts a where a.id = new.account_id;
  if v_role not in ('fixed_asset','accumulated_depreciation') then return null; end if;
  select coalesce(sum(case when v_role = 'fixed_asset' then l.debit::numeric-l.credit::numeric
    else l.credit::numeric-l.debit::numeric end),0) into v_gl
    from public.accounting_journal_lines l where l.business_id = new.business_id and l.account_id = new.account_id;
  select coalesce(sum(case when v_role = 'fixed_asset' then a.cost::numeric
    else a.accumulated::numeric end),0) into v_register
    from public.accounting_fixed_assets a where a.business_id = new.business_id
      and (case when v_role = 'fixed_asset' then a.asset_account_id else a.accumulated_account_id end) = new.account_id;
  if v_gl <> v_register then
    raise exception 'Fixed-asset register and GL balance differ' using errcode = '23514';
  end if;
  return null;
end; $$;
create constraint trigger check_fixed_asset_gl_after_line
after insert on public.accounting_journal_lines deferrable initially deferred
for each row execute function private.check_fixed_asset_gl();
revoke all on function private.check_fixed_asset_gl() from public,anon,authenticated;

create function private.require_fixed_asset_source()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source_type not in ('asset_purchase','asset_depreciation') then return null; end if;
  if new.source_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$' then
    raise exception 'Asset journal source must be UUID' using errcode = '23514';
  end if;
  if new.source_type = 'asset_purchase' and not exists (
    select 1 from public.accounting_fixed_assets a where a.id = new.source_id::uuid
      and a.business_id = new.business_id and a.acquisition_journal_id = new.id and a.source_kind = 'cash'
  ) then raise exception 'Asset purchase needs matching asset' using errcode = '23514'; end if;
  if new.source_type = 'asset_depreciation' and not exists (
    select 1 from public.accounting_fixed_asset_depreciations d where d.id = new.source_id::uuid
      and d.business_id = new.business_id and d.journal_id = new.id
  ) then raise exception 'Depreciation needs matching entry' using errcode = '23514'; end if;
  return null;
end; $$;
create constraint trigger require_fixed_asset_source_after_journal
after insert on public.accounting_journals deferrable initially deferred
for each row execute function private.require_fixed_asset_source();
revoke all on function private.require_fixed_asset_source() from public,anon,authenticated;

create function public.run_fixed_asset_depreciation(p_business_id uuid,p_month date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_book public.accounting_fixed_asset_books%rowtype;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_asset public.accounting_fixed_assets%rowtype;
  v_elapsed integer;
  v_target bigint;
  v_amount bigint;
  v_journal uuid;
  v_row_id uuid;
  v_expense_code text;
  v_accum_code text;
  v_posted integer := 0;
  v_post_date date;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())) then
    raise exception 'Only owner may run depreciation' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1
    or p_month > date_trunc('month',v_today)::date then
    raise exception 'Invalid depreciation month' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,43));
  select * into v_book from public.accounting_fixed_asset_books where business_id = p_business_id for update;
  if not found or p_month < v_book.started_month
    or (v_book.last_depreciated_month is null and p_month <> v_book.started_month)
    or (v_book.last_depreciated_month is not null and p_month <> v_book.last_depreciated_month
      and p_month <> (v_book.last_depreciated_month + interval '1 month')::date) then
    raise exception 'Run depreciation months in order from book start' using errcode = '23514';
  end if;
  v_post_date := least((p_month + interval '1 month - 1 day')::date,v_today);
  for v_asset in select * from public.accounting_fixed_assets a
    where a.business_id = p_business_id and a.category <> 'land'
      and a.depreciation_start_month <= p_month and a.remaining_months > 0
      and a.ready_on <= v_today
      and a.accumulated < a.cost
      and not exists (select 1 from public.accounting_fixed_asset_depreciations d
        where d.business_id = p_business_id and d.asset_id = a.id and d.period_month = p_month)
    order by a.asset_code for update loop
    v_elapsed := extract(year from age(p_month,v_asset.depreciation_start_month))::integer*12
      + extract(month from age(p_month,v_asset.depreciation_start_month))::integer + 1;
    v_target := v_asset.initial_accumulated + round((v_asset.cost-v_asset.initial_accumulated)::numeric
      * least(v_elapsed,v_asset.remaining_months)::numeric / v_asset.remaining_months)::bigint;
    v_amount := v_target - v_asset.accumulated;
    if v_amount < 0 then raise exception 'Depreciation exceeds asset schedule' using errcode = '23514'; end if;
    if v_amount = 0 then continue; end if;
    select a.code into v_expense_code from public.accounting_accounts a
      where a.id = v_asset.expense_account_id and a.business_id = p_business_id and a.active;
    select a.code into v_accum_code from public.accounting_accounts a
      where a.id = v_asset.accumulated_account_id and a.business_id = p_business_id and a.active;
    if v_expense_code is null or v_accum_code is null then
      raise exception 'Depreciation account inactive' using errcode = '23514';
    end if;
    v_row_id := gen_random_uuid();
    v_journal := public.post_accounting_journal(p_business_id,v_post_date,'asset_depreciation',
      v_row_id::text,'Penyusutan '||v_asset.asset_code||' '||to_char(p_month,'YYYY-MM'),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('accountCode',v_expense_code,'debit',v_amount,'credit',0),
        pg_catalog.jsonb_build_object('accountCode',v_accum_code,'debit',0,'credit',v_amount)));
    update public.accounting_fixed_assets set accumulated = v_target where id = v_asset.id;
    insert into public.accounting_fixed_asset_depreciations
      (id,business_id,asset_id,period_month,posted_on,amount,journal_id,created_by)
    values (v_row_id,p_business_id,v_asset.id,p_month,v_post_date,v_amount,v_journal,(select auth.uid()));
    v_posted := v_posted + 1;
  end loop;
  update public.accounting_fixed_asset_books set last_depreciated_month = p_month
    where business_id = p_business_id;
  return v_posted;
end; $$;
revoke all on function public.run_fixed_asset_depreciation(uuid,date) from public,anon,authenticated;
grant execute on function public.run_fixed_asset_depreciation(uuid,date) to authenticated;
