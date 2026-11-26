-- Project routine cash only from operating transactions and their matching reversal journals.
-- Identify both cash sides of a journal, including reversals of internal transfers.
-- Read-only cash and open-credit projection for the existing dashboard.
-- It switches a business to posted journals as soon as its first journal exists.
create or replace function public.get_accounting_cash_workspace(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_opening bigint := 0;
  v_entries jsonb := '[]'::jsonb;
  v_obligations jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b
      where b.id = p_business_id and (
        b.owner_id = (select auth.uid()) or exists (
          select 1 from public.business_members m
          where m.business_id = b.id and m.user_id = (select auth.uid())
        )
      )
  ) then
    raise exception 'Business access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounting_journals j where j.business_id = p_business_id) then
    return null;
  end if;

  select coalesce(sum(l.debit - l.credit), 0)::bigint into v_opening
  from public.accounting_journals j
  join public.accounting_journal_lines l on l.journal_id = j.id and l.business_id = j.business_id
  join public.accounting_accounts a on a.id = l.account_id and a.business_id = j.business_id
  where j.business_id = p_business_id and j.source_type = 'opening_balance' and a.role = 'cash';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'journalId', q.journal_id, 'date', q.entry_date, 'title', q.description,
    'category', q.source_type, 'type', case when q.debit > 0 then 'in' else 'out' end,
    'amount', case when q.debit > 0 then q.debit else q.credit end::text,
    'method', q.account_name,
    'nonRoutine', not (
      q.source_type in ('cash_sale', 'cash_expense', 'stock_purchase', 'stock_sale')
      or (q.source_type = 'correction_reversal' and exists (
        select 1 from public.accounting_corrections c
        join public.accounting_journals original on original.id = c.original_journal_id
        where c.reversal_journal_id = q.journal_id and c.business_id = p_business_id
          and original.source_type in ('cash_sale', 'cash_expense', 'stock_purchase', 'stock_sale')
      ))
    )
  ) order by q.entry_date desc, q.created_at desc, q.line_no), '[]'::jsonb)
  into v_entries
  from (
    select l.id, l.journal_id, l.debit, l.credit, l.line_no, j.entry_date, j.description,
      j.source_type, j.created_at, a.name as account_name
    from public.accounting_journal_lines l
    join public.accounting_journals j on j.id = l.journal_id and j.business_id = l.business_id
    join public.accounting_accounts a on a.id = l.account_id and a.business_id = l.business_id
    where l.business_id = p_business_id and a.role = 'cash' and j.source_type <> 'opening_balance'
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'kind', case when q.kind = 'sale' then 'piutang' else 'utang' end,
    'party', q.contact_name, 'description', q.description,
    'date', q.issue_date, 'dueDate', q.due_date,
    'amount', q.amount::text, 'settled', q.settled::text
  ) order by q.due_date, q.id), '[]'::jsonb)
  into v_obligations
  from (
    select d.id, d.kind, d.contact_name, d.description, d.issue_date,
      d.due_date, d.amount, coalesce(sum(p.amount), 0)::bigint as settled
    from public.accounting_credit_documents d
    left join public.accounting_credit_payments p
      on p.document_id = d.id and p.business_id = d.business_id
    where d.business_id = p_business_id
    group by d.id
  ) q;

  return jsonb_build_object(
    'openingBalance', v_opening::text,
    'entries', v_entries,
    'obligations', v_obligations
  );
end;
$$;

revoke all on function public.get_accounting_cash_workspace(uuid) from public, anon, authenticated;
grant execute on function public.get_accounting_cash_workspace(uuid) to authenticated;
