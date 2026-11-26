-- Opening receivables and payables are outstanding documents, not new sales or
-- purchases. Their total must match the opening journal's control accounts.
alter table public.accounting_credit_documents
  add column origin text not null default 'operational'
    check (origin in ('operational', 'opening')),
  add column opening_journal_id uuid;
alter table public.accounting_credit_documents
  alter column recognition_account_id drop not null,
  alter column journal_id drop not null;
alter table public.accounting_credit_documents
  add constraint accounting_credit_documents_source_consistency_check check (
    (origin = 'operational' and recognition_account_id is not null
      and journal_id is not null and opening_journal_id is null)
    or (origin = 'opening' and recognition_account_id is null
      and journal_id is null and opening_journal_id is not null)
  ),
  add constraint accounting_credit_documents_opening_journal_fkey
    foreign key (opening_journal_id, business_id)
    references public.accounting_journals (id, business_id)
    on delete no action deferrable initially deferred;

create index accounting_credit_documents_opening_journal_idx
  on public.accounting_credit_documents (opening_journal_id) where origin = 'opening';

create function private.require_opening_credit_details()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source_type <> 'opening_balance' then return null; end if;
  if exists (
    with journal_balances as (
      select l.account_id,
        sum(case when a.role = 'receivable' then l.debit - l.credit
          else l.credit - l.debit end) as amount
      from public.accounting_journal_lines l
      join public.accounting_accounts a on a.id = l.account_id
        and a.business_id = l.business_id
      where l.journal_id = new.id and l.business_id = new.business_id
        and a.role in ('receivable', 'payable')
      group by l.account_id
    ), document_balances as (
      select d.control_account_id as account_id, sum(d.amount) as amount
      from public.accounting_credit_documents d
      where d.opening_journal_id = new.id and d.business_id = new.business_id
        and d.origin = 'opening'
      group by d.control_account_id
    )
    select 1 from journal_balances j full join document_balances d using (account_id)
    where coalesce(j.amount, 0) <> coalesce(d.amount, 0)
  ) then
    raise exception 'Opening receivable/payable details must match journal balances'
      using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger require_opening_credit_details_after_journal
after insert on public.accounting_journals deferrable initially deferred
for each row execute function private.require_opening_credit_details();
revoke all on function private.require_opening_credit_details() from public, anon, authenticated;

create function public.post_accounting_opening_with_details(
  p_business_id uuid, p_entry_date date, p_lines jsonb, p_documents jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_journal_id uuid;
  v_document jsonb;
  v_kind text;
  v_contact_id uuid;
  v_contact_kind text;
  v_contact_name text;
  v_control_id uuid;
  v_control_role text;
  v_document_no text;
  v_issue_date date;
  v_due_date date;
  v_description text;
  v_amount bigint;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id
      and b.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the business owner may post opening balances' using errcode = '42501';
  end if;
  if p_entry_date is null or p_documents is null or jsonb_typeof(p_documents) <> 'array'
    or jsonb_array_length(p_documents) > 200 then
    raise exception 'Invalid opening details' using errcode = '22023';
  end if;
  v_journal_id := public.post_accounting_journal(
    p_business_id, p_entry_date, 'opening_balance', 'initial',
    'Saldo pembuka akuntansi', p_lines
  );
  for v_document in select value from jsonb_array_elements(p_documents) loop
    v_kind := v_document->>'kind';
    v_document_no := upper(btrim(v_document->>'documentNo'));
    v_description := btrim(v_document->>'description');
    if jsonb_typeof(v_document) <> 'object'
      or coalesce(v_kind, '') not in ('sale', 'purchase')
      or coalesce(v_document->>'contactId', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(v_document_no, '') !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'
      or coalesce(v_document->>'issueDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(v_document->>'dueDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or length(coalesce(v_description, '')) not between 1 and 250
      or coalesce(v_document->>'amount', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Invalid opening credit document' using errcode = '22023';
    end if;
    v_contact_id := (v_document->>'contactId')::uuid;
    v_issue_date := (v_document->>'issueDate')::date;
    v_due_date := (v_document->>'dueDate')::date;
    v_amount := (v_document->>'amount')::bigint;
    if v_issue_date > p_entry_date or v_issue_date > (now() at time zone 'Asia/Jakarta')::date
      or v_due_date < v_issue_date or v_amount > 9007199254740991 then
      raise exception 'Opening credit date or amount is invalid' using errcode = '22023';
    end if;
    select c.kind, c.name into v_contact_kind, v_contact_name
      from public.accounting_contacts c
      where c.id = v_contact_id and c.business_id = p_business_id;
    if v_contact_kind is null
      or (v_kind = 'sale' and v_contact_kind not in ('customer', 'both'))
      or (v_kind = 'purchase' and v_contact_kind not in ('supplier', 'both')) then
      raise exception 'Opening credit contact is invalid' using errcode = '23514';
    end if;
    select a.id, a.role into v_control_id, v_control_role
      from public.accounting_accounts a
      where a.business_id = p_business_id
        and a.code = v_document->>'controlAccountCode' and a.active;
    if v_control_id is null
      or (v_kind = 'sale' and v_control_role <> 'receivable')
      or (v_kind = 'purchase' and v_control_role <> 'payable') then
      raise exception 'Opening credit account is invalid' using errcode = '23514';
    end if;
    insert into public.accounting_credit_documents (
      id, business_id, kind, contact_id, contact_name, document_no,
      issue_date, due_date, description, amount, control_account_id,
      origin, opening_journal_id, created_by
    ) values (
      gen_random_uuid(), p_business_id, v_kind, v_contact_id, v_contact_name,
      v_document_no, v_issue_date, v_due_date, v_description, v_amount,
      v_control_id, 'opening', v_journal_id, (select auth.uid())
    );
  end loop;
  return v_journal_id;
end;
$$;
revoke all on function public.post_accounting_opening_with_details(uuid, date, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.post_accounting_opening_with_details(uuid, date, jsonb, jsonb)
  to authenticated;

create or replace function public.get_accounting_credit_documents(
  p_business_id uuid, p_limit integer default 51, p_offset integer default 0
) returns table (
  id uuid, kind text, contact_id uuid, contact_name text, document_no text,
  issue_date date, due_date date, description text, amount text, paid text,
  outstanding text, recognition_account_code text, control_account_code text
) language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id
      and b.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the business owner may read credit documents' using errcode = '42501';
  end if;
  if p_limit not between 1 and 101 or p_offset not between 0 and 1000000 then
    raise exception 'Invalid document page' using errcode = '22023';
  end if;
  return query
  select d.id, d.kind, d.contact_id, d.contact_name, d.document_no,
    d.issue_date, d.due_date, d.description, d.amount::text,
    coalesce(sum(p.amount), 0)::text,
    (d.amount - coalesce(sum(p.amount), 0))::text,
    coalesce(r.code, ''), ctrl.code
  from public.accounting_credit_documents d
  left join public.accounting_accounts r on r.id = d.recognition_account_id
    and r.business_id = d.business_id
  join public.accounting_accounts ctrl on ctrl.id = d.control_account_id
    and ctrl.business_id = d.business_id
  left join public.accounting_credit_payments p on p.document_id = d.id
    and p.business_id = d.business_id
  where d.business_id = p_business_id
  group by d.id, r.id, ctrl.id
  order by d.due_date, d.issue_date, d.id
  limit p_limit offset p_offset;
end;
$$;
