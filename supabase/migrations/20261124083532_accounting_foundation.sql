-- Separate accounting ledger. Existing cash transactions remain untouched until cutover.
create table public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  code text not null check (code ~ '^[0-9A-Za-z._-]{2,20}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  class text not null check (class in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  role text not null check (role in ('cash', 'receivable', 'inventory', 'fixed_asset', 'accumulated_depreciation',
    'payable', 'capital', 'drawings', 'revenue', 'cogs', 'expense', 'depreciation_expense')),
  normal text not null check (normal in ('debit', 'credit')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, code),
  unique (id, business_id),
  check (
    (role in ('cash', 'receivable', 'inventory', 'fixed_asset') and class = 'asset' and normal = 'debit') or
    (role = 'accumulated_depreciation' and class = 'asset' and normal = 'credit') or
    (role = 'payable' and class = 'liability' and normal = 'credit') or
    (role = 'capital' and class = 'equity' and normal = 'credit') or
    (role = 'drawings' and class = 'equity' and normal = 'debit') or
    (role = 'revenue' and class = 'revenue' and normal = 'credit') or
    (role in ('cogs', 'expense', 'depreciation_expense') and class = 'expense' and normal = 'debit')
  )
);

create table public.accounting_journals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  entry_date date not null,
  source_type text not null check (length(btrim(source_type)) between 1 and 40),
  source_id text not null check (length(btrim(source_id)) between 1 and 100),
  description text not null check (length(btrim(description)) between 1 and 250),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, source_type, source_id),
  unique (id, business_id)
);

create index accounting_journals_business_date_idx
  on public.accounting_journals (business_id, entry_date desc, created_at desc);

create table public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  journal_id uuid not null,
  account_id uuid not null,
  line_no integer not null check (line_no > 0),
  debit bigint not null default 0 check (debit between 0 and 9007199254740991),
  credit bigint not null default 0 check (credit between 0 and 9007199254740991),
  unique (journal_id, line_no),
  foreign key (journal_id, business_id) references public.accounting_journals (id, business_id) on delete restrict,
  foreign key (account_id, business_id) references public.accounting_accounts (id, business_id) on delete restrict,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index accounting_lines_business_account_idx
  on public.accounting_journal_lines (business_id, account_id);

-- A business receives a general-purpose account template. The codes are product defaults,
-- not account numbers mandated by SAK EMKM. No opening journal is inferred from old cash data.
create function private.seed_accounting_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounting_accounts (business_id, code, name, class, role, normal)
  select new.id, template.code, template.name, template.class, template.role, template.normal
  from (values
    ('1010', 'Kas', 'asset', 'cash', 'debit'),
    ('1020', 'Bank', 'asset', 'cash', 'debit'),
    ('1030', 'Dompet digital', 'asset', 'cash', 'debit'),
    ('1100', 'Piutang usaha', 'asset', 'receivable', 'debit'),
    ('1200', 'Persediaan', 'asset', 'inventory', 'debit'),
    ('1500', 'Aset tetap', 'asset', 'fixed_asset', 'debit'),
    ('1590', 'Akumulasi penyusutan', 'asset', 'accumulated_depreciation', 'credit'),
    ('2100', 'Utang usaha', 'liability', 'payable', 'credit'),
    ('3100', 'Modal pemilik', 'equity', 'capital', 'credit'),
    ('3200', 'Prive pemilik', 'equity', 'drawings', 'debit'),
    ('4100', 'Pendapatan penjualan', 'revenue', 'revenue', 'credit'),
    ('4200', 'Pendapatan jasa', 'revenue', 'revenue', 'credit'),
    ('5100', 'Harga pokok penjualan', 'expense', 'cogs', 'debit'),
    ('6100', 'Beban operasional', 'expense', 'expense', 'debit'),
    ('6200', 'Beban penyusutan', 'expense', 'depreciation_expense', 'debit')
  ) as template(code, name, class, role, normal)
  on conflict (business_id, code) do nothing;
  return new;
end;
$$;

create trigger seed_accounting_template_after_business
after insert on public.businesses
for each row execute function private.seed_accounting_template();

revoke all on function private.seed_accounting_template() from public, anon, authenticated;

-- Seed businesses that were created before this migration, without inventing balances.
insert into public.accounting_accounts (business_id, code, name, class, role, normal)
select b.id, template.code, template.name, template.class, template.role, template.normal
from public.businesses b
cross join (values
  ('1010', 'Kas', 'asset', 'cash', 'debit'),
  ('1020', 'Bank', 'asset', 'cash', 'debit'),
  ('1030', 'Dompet digital', 'asset', 'cash', 'debit'),
  ('1100', 'Piutang usaha', 'asset', 'receivable', 'debit'),
  ('1200', 'Persediaan', 'asset', 'inventory', 'debit'),
  ('1500', 'Aset tetap', 'asset', 'fixed_asset', 'debit'),
  ('1590', 'Akumulasi penyusutan', 'asset', 'accumulated_depreciation', 'credit'),
  ('2100', 'Utang usaha', 'liability', 'payable', 'credit'),
  ('3100', 'Modal pemilik', 'equity', 'capital', 'credit'),
  ('3200', 'Prive pemilik', 'equity', 'drawings', 'debit'),
  ('4100', 'Pendapatan penjualan', 'revenue', 'revenue', 'credit'),
  ('4200', 'Pendapatan jasa', 'revenue', 'revenue', 'credit'),
  ('5100', 'Harga pokok penjualan', 'expense', 'cogs', 'debit'),
  ('6100', 'Beban operasional', 'expense', 'expense', 'debit'),
  ('6200', 'Beban penyusutan', 'expense', 'depreciation_expense', 'debit')
) as template(code, name, class, role, normal);

alter table public.accounting_accounts enable row level security;
alter table public.accounting_journals enable row level security;
alter table public.accounting_journal_lines enable row level security;

revoke all on public.accounting_accounts, public.accounting_journals, public.accounting_journal_lines from anon, authenticated;
grant select, insert on public.accounting_accounts to authenticated;
grant update (name, active) on public.accounting_accounts to authenticated;
grant select on public.accounting_journals, public.accounting_journal_lines to authenticated;

create policy "Owner and member read accounting accounts" on public.accounting_accounts
for select to authenticated
using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid()))
  or exists (select 1 from public.business_members m where m.business_id = accounting_accounts.business_id and m.user_id = (select auth.uid()))
);
create policy "Owner creates accounting account" on public.accounting_accounts
for insert to authenticated
with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner updates accounting account" on public.accounting_accounts
for update to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

create policy "Owner reads accounting journals" on public.accounting_journals
for select to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner reads accounting journal lines" on public.accounting_journal_lines
for select to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

-- Only this function may write posted journals. It runs in one database transaction,
-- validates the authenticated owner and every account, and rolls back on imbalance.
create function public.post_accounting_journal(
  p_business_id uuid,
  p_entry_date date,
  p_source_type text,
  p_source_id text,
  p_description text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal_id uuid;
  v_line jsonb;
  v_account_id uuid;
  v_code text;
  v_debit bigint;
  v_credit bigint;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line_no integer := 0;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the business owner may post accounting journals' using errcode = '42501';
  end if;
  if p_entry_date is null or p_entry_date > (now() at time zone 'Asia/Jakarta')::date
    or length(btrim(coalesce(p_source_type, ''))) not between 1 and 40
    or length(btrim(coalesce(p_source_id, ''))) not between 1 and 100
    or length(btrim(coalesce(p_description, ''))) not between 1 and 250
    or p_lines is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 2 and 200 then
    raise exception 'Invalid journal metadata or lines' using errcode = '22023';
  end if;

  insert into public.accounting_journals (business_id, entry_date, source_type, source_id, description, created_by)
  values (p_business_id, p_entry_date, btrim(p_source_type), btrim(p_source_id), btrim(p_description), (select auth.uid()))
  returning id into v_journal_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_no := v_line_no + 1;
    v_code := v_line->>'accountCode';
    if jsonb_typeof(v_line) <> 'object' or v_code is null
      or jsonb_typeof(v_line->'debit') <> 'number' or jsonb_typeof(v_line->'credit') <> 'number'
      or (v_line->>'debit') !~ '^[0-9]+$' or (v_line->>'credit') !~ '^[0-9]+$' then
      raise exception 'Invalid journal line' using errcode = '22023';
    end if;
    v_debit := (v_line->>'debit')::bigint;
    v_credit := (v_line->>'credit')::bigint;
    if (v_debit <= 0 and v_credit <= 0) or (v_debit > 0 and v_credit > 0)
      or v_debit > 9007199254740991 or v_credit > 9007199254740991 then
      raise exception 'Each line requires exactly one positive side' using errcode = '22023';
    end if;
    select a.id into v_account_id from public.accounting_accounts a
      where a.business_id = p_business_id and a.code = v_code and a.active;
    if v_account_id is null then
      raise exception 'Account is missing or inactive' using errcode = '23503';
    end if;
    insert into public.accounting_journal_lines (business_id, journal_id, account_id, line_no, debit, credit)
    values (p_business_id, v_journal_id, v_account_id, v_line_no, v_debit, v_credit);
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
    v_account_id := null;
  end loop;

  if v_total_debit <> v_total_credit or v_total_debit > 9007199254740991 then
    raise exception 'Journal is not balanced or exceeds safe Rupiah range' using errcode = '23514';
  end if;
  return v_journal_id;
end;
$$;

revoke all on function public.post_accounting_journal(uuid, date, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.post_accounting_journal(uuid, date, text, text, text, jsonb) to authenticated;
