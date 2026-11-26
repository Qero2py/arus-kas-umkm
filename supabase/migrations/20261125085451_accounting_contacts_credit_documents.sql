-- Credit documents are separate from the old cash-flow obligations. A document,
-- its payment, and each corresponding journal are posted atomically by RPC.
create table public.accounting_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('customer', 'supplier', 'both')),
  name text not null check (length(btrim(name)) between 1 and 100),
  phone text check (phone is null or length(btrim(phone)) between 1 and 30),
  address text check (address is null or length(btrim(address)) between 1 and 250),
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index accounting_contacts_business_name_idx
  on public.accounting_contacts (business_id, name);

create table public.accounting_credit_documents (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('sale', 'purchase')),
  contact_id uuid not null,
  contact_name text not null check (length(btrim(contact_name)) between 1 and 100),
  document_no text not null check (document_no ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  issue_date date not null,
  due_date date not null check (due_date >= issue_date),
  description text not null check (length(btrim(description)) between 1 and 250),
  amount bigint not null check (amount between 1 and 9007199254740991),
  recognition_account_id uuid not null,
  control_account_id uuid not null,
  journal_id uuid not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, kind, document_no),
  foreign key (contact_id, business_id) references public.accounting_contacts (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (recognition_account_id, business_id) references public.accounting_accounts (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (control_account_id, business_id) references public.accounting_accounts (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (journal_id, business_id) references public.accounting_journals (id, business_id)
    on delete no action deferrable initially deferred
);

create index accounting_credit_documents_business_due_idx
  on public.accounting_credit_documents (business_id, due_date, id);
create index accounting_credit_documents_contact_idx
  on public.accounting_credit_documents (business_id, contact_id);

create table public.accounting_credit_payments (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  document_id uuid not null,
  paid_date date not null,
  amount bigint not null check (amount between 1 and 9007199254740991),
  cash_account_id uuid not null,
  journal_id uuid not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (document_id, business_id) references public.accounting_credit_documents (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (cash_account_id, business_id) references public.accounting_accounts (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (journal_id, business_id) references public.accounting_journals (id, business_id)
    on delete no action deferrable initially deferred
);

create index accounting_credit_payments_document_idx
  on public.accounting_credit_payments (business_id, document_id, paid_date);

alter table public.accounting_contacts enable row level security;
alter table public.accounting_credit_documents enable row level security;
alter table public.accounting_credit_payments enable row level security;

revoke all on public.accounting_contacts, public.accounting_credit_documents,
  public.accounting_credit_payments from anon, authenticated;
grant select, insert on public.accounting_contacts to authenticated;
grant update (name, phone, address) on public.accounting_contacts to authenticated;
grant select on public.accounting_credit_documents, public.accounting_credit_payments to authenticated;

create policy "Owner reads accounting contacts" on public.accounting_contacts
for select to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner creates accounting contact" on public.accounting_contacts
for insert to authenticated
with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner updates accounting contact" on public.accounting_contacts
for update to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

create policy "Owner reads credit documents" on public.accounting_credit_documents
for select to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner reads credit payments" on public.accounting_credit_payments
for select to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

-- Once a credit journal commits, a matching immutable document or payment must exist.
-- This also stops owners from forging document sources through the generic journal RPC.
create function private.require_accounting_credit_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type not in ('credit_sale', 'credit_purchase', 'customer_receipt', 'supplier_payment') then
    return null;
  end if;
  if new.source_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Credit journal source must be a document UUID' using errcode = '23514';
  end if;
  if new.source_type in ('credit_sale', 'credit_purchase') and not exists (
    select 1 from public.accounting_credit_documents d
    where d.id = new.source_id::uuid and d.business_id = new.business_id and d.journal_id = new.id
      and d.kind = case when new.source_type = 'credit_sale' then 'sale' else 'purchase' end
  ) then
    raise exception 'Credit journal requires its matching document' using errcode = '23514';
  end if;
  if new.source_type in ('customer_receipt', 'supplier_payment') and not exists (
    select 1 from public.accounting_credit_payments p
    join public.accounting_credit_documents d on d.id = p.document_id and d.business_id = p.business_id
    where p.id = new.source_id::uuid and p.business_id = new.business_id and p.journal_id = new.id
      and d.kind = case when new.source_type = 'customer_receipt' then 'sale' else 'purchase' end
  ) then
    raise exception 'Credit journal requires its matching payment' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger require_accounting_credit_source_after_insert
after insert on public.accounting_journals
deferrable initially deferred
for each row execute function private.require_accounting_credit_source();

revoke all on function private.require_accounting_credit_source() from public, anon, authenticated;

create function public.create_accounting_credit_document(
  p_business_id uuid, p_document_id uuid, p_kind text, p_contact_id uuid,
  p_document_no text, p_issue_date date, p_due_date date, p_description text,
  p_amount bigint, p_recognition_account_code text, p_control_account_code text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_kind text;
  v_contact_name text;
  v_recognition_id uuid;
  v_recognition_role text;
  v_control_id uuid;
  v_control_role text;
  v_journal_id uuid;
  v_document_no text := upper(btrim(p_document_no));
  v_source_type text;
  v_lines jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the business owner may create credit documents' using errcode = '42501';
  end if;
  if p_document_id is null or p_contact_id is null or p_kind is null or p_kind not in ('sale', 'purchase')
    or v_document_no is null or v_document_no !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'
    or p_issue_date is null or p_issue_date > (now() at time zone 'Asia/Jakarta')::date
    or p_due_date is null or p_due_date < p_issue_date
    or length(btrim(coalesce(p_description, ''))) not between 1 and 250
    or p_amount not between 1 and 9007199254740991 then
    raise exception 'Invalid credit document' using errcode = '22023';
  end if;

  select c.kind, c.name into v_contact_kind, v_contact_name from public.accounting_contacts c
    where c.id = p_contact_id and c.business_id = p_business_id;
  if v_contact_kind is null or (p_kind = 'sale' and v_contact_kind not in ('customer', 'both'))
    or (p_kind = 'purchase' and v_contact_kind not in ('supplier', 'both')) then
    raise exception 'Contact type does not match document' using errcode = '23514';
  end if;

  select a.id, a.role into v_recognition_id, v_recognition_role
  from public.accounting_accounts a
  where a.business_id = p_business_id and a.code = p_recognition_account_code and a.active;
  select a.id, a.role into v_control_id, v_control_role
  from public.accounting_accounts a
  where a.business_id = p_business_id and a.code = p_control_account_code and a.active;
  if v_recognition_id is null or v_control_id is null
    or (p_kind = 'sale' and (v_recognition_role <> 'revenue' or v_control_role <> 'receivable'))
    or (p_kind = 'purchase' and (v_recognition_role not in ('expense', 'inventory', 'fixed_asset')
      or v_control_role <> 'payable')) then
    raise exception 'Account types do not match credit document' using errcode = '23514';
  end if;

  v_source_type := case when p_kind = 'sale' then 'credit_sale' else 'credit_purchase' end;
  v_lines := case when p_kind = 'sale' then
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('accountCode', p_control_account_code, 'debit', p_amount, 'credit', 0),
      pg_catalog.jsonb_build_object('accountCode', p_recognition_account_code, 'debit', 0, 'credit', p_amount)
    ) else
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('accountCode', p_recognition_account_code, 'debit', p_amount, 'credit', 0),
      pg_catalog.jsonb_build_object('accountCode', p_control_account_code, 'debit', 0, 'credit', p_amount)
    ) end;
  v_journal_id := public.post_accounting_journal(
    p_business_id, p_issue_date, v_source_type, p_document_id::text, btrim(p_description), v_lines
  );

  insert into public.accounting_credit_documents (
    id, business_id, kind, contact_id, contact_name, document_no, issue_date, due_date,
    description, amount, recognition_account_id, control_account_id, journal_id, created_by
  ) values (
    p_document_id, p_business_id, p_kind, p_contact_id, v_contact_name, v_document_no, p_issue_date, p_due_date,
    btrim(p_description), p_amount, v_recognition_id, v_control_id, v_journal_id, (select auth.uid())
  );
  return p_document_id;
end;
$$;

revoke all on function public.create_accounting_credit_document(
  uuid, uuid, text, uuid, text, date, date, text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.create_accounting_credit_document(
  uuid, uuid, text, uuid, text, date, date, text, bigint, text, text
) to authenticated;

create function public.record_accounting_credit_payment(
  p_business_id uuid, p_payment_id uuid, p_document_id uuid,
  p_paid_date date, p_amount bigint, p_cash_account_code text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.accounting_credit_documents%rowtype;
  v_cash_account_id uuid;
  v_control_code text;
  v_paid numeric;
  v_journal_id uuid;
  v_source_type text;
  v_description text;
  v_lines jsonb;
  v_existing public.accounting_credit_payments%rowtype;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the business owner may record credit payments' using errcode = '42501';
  end if;
  if p_payment_id is null or p_document_id is null or p_paid_date is null
    or p_paid_date > (now() at time zone 'Asia/Jakarta')::date
    or p_amount not between 1 and 9007199254740991 then
    raise exception 'Invalid credit payment' using errcode = '22023';
  end if;

  select * into v_document from public.accounting_credit_documents d
    where d.id = p_document_id and d.business_id = p_business_id for update;
  if not found or p_paid_date < v_document.issue_date then
    raise exception 'Document is missing or payment precedes issue date' using errcode = '23514';
  end if;
  select a.id into v_cash_account_id from public.accounting_accounts a
    where a.business_id = p_business_id and a.code = p_cash_account_code
      and a.role = 'cash' and a.active;
  if v_cash_account_id is null then
    raise exception 'Cash account is missing or inactive' using errcode = '23514';
  end if;

  select * into v_existing from public.accounting_credit_payments p where p.id = p_payment_id;
  if found then
    if v_existing.business_id = p_business_id and v_existing.document_id = p_document_id
      and v_existing.paid_date = p_paid_date and v_existing.amount = p_amount
      and v_existing.cash_account_id = v_cash_account_id then
      return p_payment_id;
    end if;
    raise exception 'Payment request ID was reused with different data' using errcode = '23505';
  end if;

  select coalesce(sum(p.amount), 0) into v_paid from public.accounting_credit_payments p
    where p.document_id = p_document_id and p.business_id = p_business_id;
  if v_paid + p_amount > v_document.amount then
    raise exception 'Payment exceeds document outstanding amount' using errcode = '23514';
  end if;
  select a.code into v_control_code from public.accounting_accounts a
    where a.id = v_document.control_account_id and a.business_id = p_business_id and a.active;
  if v_control_code is null then
    raise exception 'Control account is inactive' using errcode = '23514';
  end if;

  v_source_type := case when v_document.kind = 'sale' then 'customer_receipt' else 'supplier_payment' end;
  v_description := case when v_document.kind = 'sale' then 'Penerimaan piutang ' else 'Pembayaran utang ' end
    || v_document.document_no;
  v_lines := case when v_document.kind = 'sale' then
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('accountCode', p_cash_account_code, 'debit', p_amount, 'credit', 0),
      pg_catalog.jsonb_build_object('accountCode', v_control_code, 'debit', 0, 'credit', p_amount)
    ) else
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('accountCode', v_control_code, 'debit', p_amount, 'credit', 0),
      pg_catalog.jsonb_build_object('accountCode', p_cash_account_code, 'debit', 0, 'credit', p_amount)
    ) end;
  v_journal_id := public.post_accounting_journal(
    p_business_id, p_paid_date, v_source_type, p_payment_id::text, v_description, v_lines
  );
  insert into public.accounting_credit_payments (
    id, business_id, document_id, paid_date, amount, cash_account_id, journal_id, created_by
  ) values (
    p_payment_id, p_business_id, p_document_id, p_paid_date, p_amount,
    v_cash_account_id, v_journal_id, (select auth.uid())
  );
  return p_payment_id;
end;
$$;

revoke all on function public.record_accounting_credit_payment(
  uuid, uuid, uuid, date, bigint, text
) from public, anon, authenticated;
grant execute on function public.record_accounting_credit_payment(
  uuid, uuid, uuid, date, bigint, text
) to authenticated;

create function public.get_accounting_credit_documents(
  p_business_id uuid, p_limit integer default 51, p_offset integer default 0
)
returns table (
  id uuid, kind text, contact_id uuid, contact_name text, document_no text,
  issue_date date, due_date date, description text, amount text, paid text, outstanding text,
  recognition_account_code text, control_account_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the business owner may read credit documents' using errcode = '42501';
  end if;
  if p_limit not between 1 and 101 or p_offset not between 0 and 1000000 then
    raise exception 'Invalid document page' using errcode = '22023';
  end if;

  return query
  select d.id, d.kind, d.contact_id, d.contact_name, d.document_no, d.issue_date, d.due_date,
    d.description, d.amount::text, coalesce(sum(p.amount), 0)::text,
    (d.amount - coalesce(sum(p.amount), 0))::text, r.code, ctrl.code
  from public.accounting_credit_documents d
  join public.accounting_accounts r on r.id = d.recognition_account_id and r.business_id = d.business_id
  join public.accounting_accounts ctrl on ctrl.id = d.control_account_id and ctrl.business_id = d.business_id
  left join public.accounting_credit_payments p on p.document_id = d.id and p.business_id = d.business_id
  where d.business_id = p_business_id
  group by d.id, r.id, ctrl.id
  order by d.due_date, d.issue_date, d.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_accounting_credit_documents(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_accounting_credit_documents(uuid, integer, integer)
  to authenticated;
