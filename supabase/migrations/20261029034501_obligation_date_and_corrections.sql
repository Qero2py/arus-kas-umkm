alter table public.obligations add column obligation_date date;
update public.obligations
set obligation_date = (created_at at time zone 'Asia/Jakarta')::date;
alter table public.obligations
  alter column obligation_date set not null,
  alter column obligation_date set default (now() at time zone 'Asia/Jakarta')::date;

grant update (obligation_date, party, description, due_date, amount)
  on public.obligations to authenticated;

create policy "Owner corrects obligations" on public.obligations
  for update to authenticated
  using (exists (select 1 from public.businesses b
    where b.id = obligations.business_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b
    where b.id = obligations.business_id and b.owner_id = (select auth.uid())));

create policy "Manager corrects obligations" on public.obligations
  for update to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = obligations.business_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.business_members m
    where m.business_id = obligations.business_id and m.user_id = (select auth.uid())));

-- Keep the existing manager policies tied to the row's business. An unqualified
-- business_id inside the membership subquery resolves to that subquery's column.
drop policy "Manager reads obligations" on public.obligations;
create policy "Manager reads obligations" on public.obligations
  for select to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = obligations.business_id and m.user_id = (select auth.uid())));
drop policy "Manager creates obligations" on public.obligations;
create policy "Manager creates obligations" on public.obligations
  for insert to authenticated
  with check (exists (select 1 from public.business_members m
    where m.business_id = obligations.business_id and m.user_id = (select auth.uid())));
drop policy "Manager reads transactions" on public.transactions;
create policy "Manager reads transactions" on public.transactions
  for select to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = transactions.business_id and m.user_id = (select auth.uid())));
drop policy "Manager creates transactions" on public.transactions;
create policy "Manager creates transactions" on public.transactions
  for insert to authenticated
  with check (exists (select 1 from public.business_members m
    where m.business_id = transactions.business_id and m.user_id = (select auth.uid())));
drop policy "Manager corrects transactions" on public.transactions;
create policy "Manager corrects transactions" on public.transactions
  for update to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = transactions.business_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.business_members m
    where m.business_id = transactions.business_id and m.user_id = (select auth.uid())));

create function private.check_obligation_amount()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  paid bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text, 0));
  select coalesce(sum(t.amount), 0) into paid
    from public.transactions t where t.obligation_id = new.id;
  if paid > new.amount then
    raise exception 'Obligation amount cannot be less than recorded payments' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_obligation_amount_before_update
before update of amount on public.obligations
for each row execute function private.check_obligation_amount();
