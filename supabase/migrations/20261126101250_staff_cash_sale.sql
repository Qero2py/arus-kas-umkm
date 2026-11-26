-- A manager may record a cash sale without gaining access to arbitrary journals
-- or financial reports. The two accounting lines are fixed by this function.
create function public.post_staff_cash_sale(
  p_business_id uuid,
  p_entry_date date,
  p_source_id uuid,
  p_description text,
  p_amount bigint,
  p_cash_account_code text,
  p_revenue_account_code text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cash_account uuid;
  v_revenue_account uuid;
  v_journal uuid;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id
      and (
        b.owner_id = (select auth.uid()) or exists (
          select 1 from public.business_members m
          where m.business_id = b.id and m.user_id = (select auth.uid())
            and m.role = 'manager'
        )
      )
  ) then
    raise exception 'Business member required' using errcode = '42501';
  end if;
  if p_entry_date is null or p_entry_date > (now() at time zone 'Asia/Jakarta')::date
    or p_source_id is null or length(btrim(coalesce(p_description, ''))) not between 1 and 250
    or p_amount is null or p_amount not between 1 and 9007199254740991 then
    raise exception 'Invalid cash sale' using errcode = '22023';
  end if;
  select a.id into v_cash_account from public.accounting_accounts a
    where a.business_id = p_business_id and a.code = p_cash_account_code
      and a.role = 'cash' and a.active;
  select a.id into v_revenue_account from public.accounting_accounts a
    where a.business_id = p_business_id and a.code = p_revenue_account_code
      and a.role = 'revenue' and a.active;
  if v_cash_account is null or v_revenue_account is null then
    raise exception 'Invalid cash or revenue account' using errcode = '22023';
  end if;

  insert into public.accounting_journals
    (business_id, entry_date, source_type, source_id, description, created_by)
  values (p_business_id, p_entry_date, 'cash_sale', p_source_id::text,
    btrim(p_description), (select auth.uid()))
  returning id into v_journal;
  insert into public.accounting_journal_lines
    (business_id,journal_id,account_id,line_no,debit,credit)
  values
    (p_business_id,v_journal,v_cash_account,1,p_amount,0),
    (p_business_id,v_journal,v_revenue_account,2,0,p_amount);
  return v_journal;
end;
$$;

revoke all on function public.post_staff_cash_sale(uuid,date,uuid,text,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.post_staff_cash_sale(uuid,date,uuid,text,bigint,text,text)
  to authenticated;
