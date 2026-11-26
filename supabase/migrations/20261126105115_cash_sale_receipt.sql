-- Cashiers can read receipts only for their own cash-sale journals. Owners can
-- read every cash-sale receipt in their business without exposing the ledger.
create function public.get_cash_sale_receipt(p_business_id uuid, p_journal_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_journal public.accounting_journals%rowtype;
  v_business_name text;
  v_cash_name text;
  v_cash numeric;
  v_revenue numeric;
  v_corrected boolean;
begin
  if (select auth.uid()) is null or p_business_id is null or p_journal_id is null then
    raise exception 'Business access required' using errcode = '42501';
  end if;
  select * into v_journal from public.accounting_journals j
    where j.id = p_journal_id and j.business_id = p_business_id and j.source_type = 'cash_sale';
  if not found then raise exception 'Cash sale not found' using errcode = 'P0002'; end if;
  select b.name into v_business_name from public.businesses b
    where b.id = p_business_id and (
      b.owner_id = (select auth.uid()) or (
        v_journal.created_by = (select auth.uid()) and exists (
          select 1 from public.business_members m
            where m.business_id = b.id and m.user_id = (select auth.uid()) and m.role = 'manager'
        )
      )
    );
  if v_business_name is null then
    raise exception 'Cash sale receipt access denied' using errcode = '42501';
  end if;
  select coalesce(sum(case when a.role='cash' then l.debit else 0 end),0),
    coalesce(sum(case when a.role='revenue' then l.credit else 0 end),0),
    max(a.name) filter(where a.role='cash')
    into v_cash,v_revenue,v_cash_name
  from public.accounting_journal_lines l
  join public.accounting_accounts a on a.id=l.account_id and a.business_id=l.business_id
  where l.journal_id=p_journal_id and l.business_id=p_business_id;
  if v_cash<=0 or v_cash<>v_revenue then
    raise exception 'Cash sale journal does not reconcile' using errcode = '23514';
  end if;
  select exists(select 1 from public.accounting_corrections c
    where c.business_id=p_business_id and c.original_journal_id=p_journal_id)
    into v_corrected;
  return jsonb_build_object(
    'journalId',v_journal.id,'businessName',v_business_name,
    'receiptNo','TRX-'||upper(left(replace(v_journal.id::text,'-',''),12)),
    'date',v_journal.entry_date,'description',v_journal.description,
    'cashName',v_cash_name,'amount',v_cash::bigint::text,'corrected',v_corrected
  );
end;
$$;
revoke all on function public.get_cash_sale_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_cash_sale_receipt(uuid,uuid) to authenticated;
