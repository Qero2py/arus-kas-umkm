-- Rollback-only credit-document/payment correction test on accounting development.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('a0000000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','credit-correction-smoke@example.invalid','',now(),now(),now());
insert into public.businesses(id,owner_id,name)
values('b0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-0000000000a1','Credit correction smoke');
set local role authenticated;
set local request.jwt.claim.sub='a0000000-0000-4000-8000-0000000000a1';
set local request.jwt.claim.role='authenticated';
do $$
declare
  v_business uuid:='b0000000-0000-4000-8000-0000000000a1';
  v_document uuid:='d0000000-0000-4000-8000-0000000000a1';
  v_payment uuid:='e0000000-0000-4000-8000-0000000000a1';
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_month date:=date_trunc('month',now() at time zone 'Asia/Jakarta')::date;
  v_contact uuid;
  v_amount text; v_paid text; v_outstanding text; v_cash text; v_receivable text; v_revenue text;
begin
  perform public.post_accounting_journal(v_business,v_month,'opening_balance','initial','Saldo pembuka',
    '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"3100","debit":0,"credit":100000}]'::jsonb);
  insert into public.accounting_contacts(business_id,kind,name)
    values(v_business,'customer','Pelanggan uji koreksi') returning id into v_contact;
  perform public.create_accounting_credit_document(v_business,v_document,'sale',v_contact,'INV-CORR-1',
    v_month,v_today+7,'Penjualan awal',100000,'4100','1100');
  perform public.record_accounting_credit_payment(v_business,v_payment,v_document,v_today,20000,'1010');
  perform public.correct_accounting_credit_document(v_business,
    'c0000000-0000-4000-8000-0000000000a1',v_document,v_today,
    'Nominal tagihan awal salah input',90000,v_today+10,'Penjualan terkoreksi');
  perform public.correct_accounting_credit_payment(v_business,
    'c0000000-0000-4000-8000-0000000000a2',v_payment,v_today,
    'Nominal penerimaan awal salah input',10000,'1010');
  select d.amount,d.paid,d.outstanding into v_amount,v_paid,v_outstanding
    from public.get_accounting_credit_documents(v_business,51,0) d where d.id=v_document;
  if v_amount<>'90000' or v_paid<>'10000' or v_outstanding<>'80000' then
    raise exception 'Corrected credit document balance is wrong';
  end if;
  select t.ending_debit into v_cash from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='1010';
  select t.ending_debit into v_receivable from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='1100';
  select t.ending_credit into v_revenue from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='4100';
  if v_cash<>'110000' or v_receivable<>'80000' or v_revenue<>'90000' then
    raise exception 'Corrected credit GL does not match subledger';
  end if;
  if not exists(select 1 from public.get_accounting_customer_sales(v_business,v_month,v_today) s
    where s.contact_id=v_contact and s.document_count=1 and s.revenue='90000') then
    raise exception 'Customer sales analytics did not use corrected document amount';
  end if;
  if (select count(*) from public.accounting_credit_document_revisions where business_id=v_business)<>1
    or (select count(*) from public.accounting_credit_payment_revisions where business_id=v_business)<>1
    or (select count(*) from public.accounting_corrections where business_id=v_business
      and reversal_journal_id is not null and replacement_journal_id is not null)<>2 then
    raise exception 'Credit correction audit is incomplete';
  end if;
  begin
    perform public.correct_accounting_credit_document(v_business,
      'c0000000-0000-4000-8000-0000000000a3',v_document,v_today,
      'Amount below existing payment',5000,v_today+10,'Tagihan terlalu kecil');
    raise exception 'Correction below paid amount accepted';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-0000000000af',true);
  begin
    perform public.get_accounting_customer_sales(v_business,v_month,v_today);
    raise exception 'Non-owner read customer sales analytics';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.accounting_credit_document_revisions where business_id=v_business)
    or exists(select 1 from public.accounting_credit_payment_revisions where business_id=v_business) then
    raise exception 'Non-owner read credit revision audit';
  end if;
  begin
    perform public.correct_accounting_credit_payment(v_business,
      'c0000000-0000-4000-8000-0000000000a4',v_payment,v_today,
      'Unauthorized correction attempt',10000,'1010');
    raise exception 'Non-owner corrected payment';
  exception when insufficient_privilege then null;
  end;
end; $$;
set constraints all immediate;
reset role;
rollback;
select 'passed' as accounting_credit_correction_smoke;
