create schema if not exists private;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  opening_balance bigint not null default 0 check (opening_balance between 0 and 9007199254740991),
  cash_threshold bigint not null default 0 check (cash_threshold between 0 and 9007199254740991),
  projection_horizon integer not null default 30 check (projection_horizon in (7, 14, 30)),
  created_at timestamptz not null default now()
);

create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('utang', 'piutang')),
  party text not null check (length(btrim(party)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 100),
  due_date date not null,
  amount bigint not null check (amount between 1 and 9007199254740991),
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  obligation_id uuid references public.obligations (id) on delete restrict,
  entry_date date not null,
  title text not null check (length(btrim(title)) between 1 and 80),
  category text not null check (length(btrim(category)) between 1 and 80),
  type text not null check (type in ('in', 'out')),
  amount bigint not null check (amount between 1 and 9007199254740991),
  method text not null check (length(btrim(method)) between 1 and 40),
  created_at timestamptz not null default now()
);

create index transactions_business_date_idx on public.transactions (business_id, entry_date desc);
create index transactions_obligation_idx on public.transactions (obligation_id) where obligation_id is not null;
create index obligations_business_due_idx on public.obligations (business_id, due_date);

-- A linked payment is one realized transaction. Its amount is included in the cash
-- ledger and summed to derive the obligation's settled amount; it is never stored twice.
create function private.check_linked_payment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.obligations%rowtype;
  other_payments bigint;
begin
  if new.obligation_id is null then
    return new;
  end if;

  -- Serialize payments for one obligation without granting clients UPDATE on it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.obligation_id::text, 0));
  select * into target from public.obligations
    where id = new.obligation_id;
  if not found or target.business_id <> new.business_id then
    raise exception 'Linked obligation does not belong to this business' using errcode = '23514';
  end if;
  if (target.kind = 'utang' and new.type <> 'out')
    or (target.kind = 'piutang' and new.type <> 'in') then
    raise exception 'Payment direction does not match obligation' using errcode = '23514';
  end if;

  select coalesce(sum(amount), 0) into other_payments
    from public.transactions
    where obligation_id = new.obligation_id
      and id <> new.id;
  if other_payments + new.amount > target.amount then
    raise exception 'Payment exceeds outstanding amount' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_linked_payment_before_write
before insert or update on public.transactions
for each row execute function private.check_linked_payment();

alter table public.businesses enable row level security;
alter table public.obligations enable row level security;
alter table public.transactions enable row level security;

revoke all on public.businesses, public.obligations, public.transactions from anon, authenticated;
grant select, insert on public.businesses to authenticated;
grant update (name, opening_balance, cash_threshold, projection_horizon) on public.businesses to authenticated;
grant select, insert on public.obligations to authenticated;
grant select, insert on public.transactions to authenticated;
grant update (entry_date, title, category, type, amount, method) on public.transactions to authenticated;

create policy "Owner reads business" on public.businesses
  for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owner creates business" on public.businesses
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owner updates business" on public.businesses
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owner reads obligations" on public.obligations
  for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner creates obligations" on public.obligations
  for insert to authenticated
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

create policy "Owner reads transactions" on public.transactions
  for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner creates transactions" on public.transactions
  for insert to authenticated
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner corrects transactions" on public.transactions
  for update to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
