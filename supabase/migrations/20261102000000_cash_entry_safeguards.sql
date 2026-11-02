-- Existing unlinked payment categories may need manual correction. NOT VALID
-- protects new writes without blocking deployment on historical rows.
alter table public.transactions
  add constraint transactions_payment_category_linked
  check (obligation_id is not null or category not in ('Pembayaran utang', 'Penerimaan piutang')) not valid;

-- A time-dependent CHECK would be unsafe for later dump/restore. Validate at
-- write time instead, using the same calendar day as the application.
create function private.reject_future_transaction_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.entry_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Transaction date cannot be in the future' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger reject_future_transaction_date_before_write
before insert or update of entry_date on public.transactions
for each row execute function private.reject_future_transaction_date();

create function private.reject_future_obligation_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.obligation_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Obligation date cannot be in the future' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger reject_future_obligation_date_before_write
before insert or update of obligation_date on public.obligations
for each row execute function private.reject_future_obligation_date();

grant delete on public.transactions, public.obligations to authenticated;

create policy "Owner deletes transactions" on public.transactions
  for delete to authenticated
  using (exists (select 1 from public.businesses b
    where b.id = transactions.business_id and b.owner_id = (select auth.uid())));
create policy "Manager deletes transactions" on public.transactions
  for delete to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = transactions.business_id and m.user_id = (select auth.uid())));

-- The existing foreign key blocks deletion when payments still reference an obligation.
create policy "Owner deletes unlinked obligations" on public.obligations
  for delete to authenticated
  using (exists (select 1 from public.businesses b
    where b.id = obligations.business_id and b.owner_id = (select auth.uid())));
create policy "Manager deletes unlinked obligations" on public.obligations
  for delete to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = obligations.business_id and m.user_id = (select auth.uid())));
