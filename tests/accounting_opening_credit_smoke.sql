-- Rollback-only opening receivable/payable reconciliation and payment test.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('a0000000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','opening-credit-smoke@example.invalid','',now(),now(),now());
insert into public.businesses(id,owner_id,name)
values('b0000000-0000-4000-8000-0000000000b1','a0000000-0000-4000-8000-0000000000b1','Opening credit smoke');
set local role authenticated;
set local request.jwt.claim.sub='a0000000-0000-4000-8000-0000000000b1';
set local request.jwt.claim.role='authenticated';
do $$
declare
  v_business uuid:='b0000000-0000-4000-8000-0000000000b1';
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_customer uuid;
  v_supplier uuid;
  v_sale uuid;
  v_purchase uuid;
  v_lines jsonb:='[{"accountCode":"1010","debit":6692000,"credit":0},
    {"accountCode":"1100","debit":60000,"credit":0},
    {"accountCode":"2100","debit":0,"credit":200000},
    {"accountCode":"3100","debit":0,"credit":6552000}]'::jsonb;
  v_documents jsonb;
  v_cash text;
  v_receivable text;
  v_payable text;
  v_revenue text;
begin
  insert into public.accounting_contacts(business_id,kind,name)
    values(v_business,'customer','Pelanggan pembuka') returning id into v_customer;
  insert into public.accounting_contacts(business_id,kind,name)
    values(v_business,'supplier','Pemasok pembuka') returning id into v_supplier;
  v_documents:=jsonb_build_array(
    jsonb_build_object('kind','sale','contactId',v_customer,'documentNo','INV-OPEN-1',
      'issueDate',v_today-3,'dueDate',v_today+7,'description','Piutang lama',
      'amount',60000,'controlAccountCode','1100'),
    jsonb_build_object('kind','purchase','contactId',v_supplier,'documentNo','BILL-OPEN-1',
      'issueDate',v_today-3,'dueDate',v_today+7,'description','Utang lama A',
      'amount',100000,'controlAccountCode','2100'),
    jsonb_build_object('kind','purchase','contactId',v_supplier,'documentNo','BILL-OPEN-2',
      'issueDate',v_today-2,'dueDate',v_today+8,'description','Utang lama B',
      'amount',100000,'controlAccountCode','2100')
  );
  begin
    perform public.post_accounting_opening_with_details(v_business,v_today,v_lines,
      jsonb_set(v_documents,'{0,amount}','50000'::jsonb));
    set constraints all immediate;
    raise exception 'Mismatched opening details were accepted';
  exception when check_violation then null;
  end;
  if exists(select 1 from public.accounting_journals where business_id=v_business) then
    raise exception 'Rejected opening left a journal';
  end if;
  perform public.post_accounting_opening_with_details(v_business,v_today,v_lines,v_documents);
  set constraints all immediate;
  set constraints all deferred;
  if (select count(*) from public.accounting_credit_documents
      where business_id=v_business and origin='opening')<>3 then
    raise exception 'Opening documents were not created';
  end if;
  select d.id into v_sale from public.accounting_credit_documents d
    where d.business_id=v_business and d.document_no='INV-OPEN-1';
  select d.id into v_purchase from public.accounting_credit_documents d
    where d.business_id=v_business and d.document_no='BILL-OPEN-1';
  perform public.record_accounting_credit_payment(v_business,
    'e0000000-0000-4000-8000-0000000000b1',v_sale,v_today,10000,'1010');
  perform public.record_accounting_credit_payment(v_business,
    'e0000000-0000-4000-8000-0000000000b2',v_purchase,v_today,20000,'1010');
  if (select d.outstanding from public.get_accounting_credit_documents(v_business,51,0) d
      where d.id=v_sale)<>'50000'
    or (select d.outstanding from public.get_accounting_credit_documents(v_business,51,0) d
      where d.id=v_purchase)<>'80000' then
    raise exception 'Opening credit payments did not reduce balances';
  end if;
  select t.ending_debit into v_cash from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='1010';
  select t.ending_debit into v_receivable from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='1100';
  select t.ending_credit into v_payable from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='2100';
  select t.ending_credit into v_revenue from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='4100';
  if v_cash<>'6682000' or v_receivable<>'50000' or v_payable<>'180000'
    or v_revenue<>'0' then
    raise exception 'Opening credit ledger or revenue is wrong';
  end if;
  perform set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-0000000000bf',true);
  begin
    perform public.post_accounting_opening_with_details(v_business,v_today,v_lines,v_documents);
    raise exception 'Non-owner posted opening details';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
rollback;
select 'passed' as accounting_opening_credit_smoke;
