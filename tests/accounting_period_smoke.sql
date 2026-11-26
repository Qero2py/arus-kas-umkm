-- Rollback-only test against the separate accounting development database.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('a0000000-0000-4000-8000-000000000091','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','accounting-period-smoke@example.invalid','',now(),now(),now());
insert into public.businesses(id,owner_id,name)
values('b0000000-0000-4000-8000-000000000091','a0000000-0000-4000-8000-000000000091','Period smoke');
set local role authenticated;
set local request.jwt.claim.sub='a0000000-0000-4000-8000-000000000091';
set local request.jwt.claim.role='authenticated';

do $$
declare
  v_business uuid:='b0000000-0000-4000-8000-000000000091';
  v_previous date:=date_trunc('month',(now() at time zone 'Asia/Jakarta')::date-interval '1 month')::date;
  v_current date:=date_trunc('month',now() at time zone 'Asia/Jakarta')::date;
  v_sale uuid;
  v_replacement uuid;
  v_cash text;
  v_revenue text;
  v_count integer;
begin
  perform public.post_accounting_journal(v_business,v_previous,'opening_balance','initial','Saldo pembuka',
    '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"3100","debit":0,"credit":100000}]'::jsonb);
  select public.post_accounting_journal(v_business,v_previous+1,'cash_sale','sale-original','Penjualan salah',
    '[{"accountCode":"1010","debit":50000,"credit":0},{"accountCode":"4100","debit":0,"credit":50000}]'::jsonb)
    into v_sale;
  begin
    perform public.correct_basic_accounting_journal(v_business,
      'c0000000-0000-4000-8000-000000000092',v_sale,v_previous+2,
      'Nilai penjualan salah input','Penjualan yang benar',75000,'6100','4100');
    raise exception 'Wrong account roles were accepted';
  exception when check_violation then null;
  end;
  if exists(select 1 from public.accounting_corrections where business_id=v_business) then
    raise exception 'Rejected correction left an audit row';
  end if;
  begin
    perform public.post_accounting_journal(v_business,v_previous+2,'correction_reversal',
      'c0000000-0000-4000-8000-000000000099','Forged reversal',
      '[{"accountCode":"4100","debit":50000,"credit":0},{"accountCode":"1010","debit":0,"credit":50000}]'::jsonb);
    raise exception 'Reversal without audit was accepted';
  exception when check_violation then null;
  end;
  select public.correct_basic_accounting_journal(v_business,
    'c0000000-0000-4000-8000-000000000091',v_sale,v_previous+2,
    'Nilai penjualan salah input','Penjualan yang benar',75000,'1010','4100')
    into v_replacement;
  if (select count(*) from public.accounting_corrections where business_id=v_business
    and reversal_journal_id is not null and replacement_journal_id=v_replacement)<>1 then
    raise exception 'Correction audit is incomplete';
  end if;
  select t.ending_debit into v_cash from public.get_accounting_trial_balance(v_business,v_previous+2) t
    where t.code='1010';
  select t.ending_credit into v_revenue from public.get_accounting_trial_balance(v_business,v_previous+2) t
    where t.code='4100';
  if v_cash<>'175000' or v_revenue<>'75000' then
    raise exception 'Correction did not replace the original financial effect';
  end if;
  begin
    perform public.correct_basic_accounting_journal(v_business,
      'c0000000-0000-4000-8000-000000000093',v_sale,v_previous+2,
      'Repeat correction attempt','Penjualan ulang',80000,'1010','4100');
    raise exception 'Repeated correction was accepted';
  exception when unique_violation then null;
  end;
  perform public.close_accounting_period(v_business,v_previous);
  select c.journal_count into v_count from public.accounting_period_closures c
    where c.business_id=v_business and c.period_month=v_previous;
  if v_count<>4 then raise exception 'Period snapshot journal count is wrong'; end if;
  begin
    perform public.post_accounting_journal(v_business,v_previous+3,'cash_sale','late-sale','Late sale',
      '[{"accountCode":"1010","debit":1000,"credit":0},{"accountCode":"4100","debit":0,"credit":1000}]'::jsonb);
    raise exception 'Closed period accepted a journal';
  exception when check_violation then null;
  end;
  begin
    perform public.correct_basic_accounting_journal(v_business,
      'c0000000-0000-4000-8000-000000000094',v_replacement,v_previous+3,
      'Closed period correction attempt','Another replacement',80000,'1010','4100');
    raise exception 'Closed period accepted a correction';
  exception when check_violation then null;
  end;
  begin
    update public.accounting_accounts set name='Renamed cash' where business_id=v_business and code='1010';
    raise exception 'Closed account label was changed';
  exception when check_violation then null;
  end;
  perform public.post_accounting_journal(v_business,v_current,'cash_expense','new-month-expense','Beban bulan baru',
    '[{"accountCode":"6100","debit":20000,"credit":0},{"accountCode":"1010","debit":0,"credit":20000}]'::jsonb);
  begin
    perform public.close_accounting_period(v_business,v_current);
    raise exception 'Current month was closed prematurely';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000099',true);
  if exists(select 1 from public.accounting_period_closures where business_id=v_business)
    or exists(select 1 from public.accounting_corrections where business_id=v_business) then
    raise exception 'Non-owner read period or correction audit rows';
  end if;
  begin
    perform public.close_accounting_period(v_business,v_previous);
    raise exception 'Non-owner closed a period';
  exception when insufficient_privilege then null;
  end;
  raise notice 'Accounting period and correction smoke test passed';
end; $$;

reset role;
delete from auth.users where id='a0000000-0000-4000-8000-000000000091';
set constraints all immediate;
rollback;
select 'passed' as accounting_period_smoke;
