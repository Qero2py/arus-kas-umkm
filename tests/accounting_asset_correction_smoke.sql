-- Rollback-only cash-asset correction test on accounting development.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('a0000000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','asset-correction-smoke@example.invalid','',now(),now(),now());
insert into public.businesses(id,owner_id,name)
values('b0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-0000000000c1','Asset correction smoke');
set local role authenticated;
set local request.jwt.claim.sub='a0000000-0000-4000-8000-0000000000c1';
set local request.jwt.claim.role='authenticated';
do $$
declare
  v_business uuid:='b0000000-0000-4000-8000-0000000000c1';
  v_asset uuid:='d0000000-0000-4000-8000-0000000000c1';
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_month date:=date_trunc('month',now() at time zone 'Asia/Jakarta')::date;
  v_cost bigint; v_life integer; v_fixed text; v_cash text; v_bank text; v_depreciation text;
begin
  perform public.post_accounting_journal(v_business,v_today,'opening_balance','initial','Saldo pembuka',
    '[{"accountCode":"1010","debit":300000,"credit":0},{"accountCode":"1020","debit":300000,"credit":0},{"accountCode":"3100","debit":0,"credit":600000}]'::jsonb);
  perform public.activate_fixed_assets(v_business);
  perform public.register_fixed_asset(v_business,v_asset,jsonb_build_object(
    'sourceKind','cash','category','equipment','assetCode','EQ-CORR','name','Mesin awal',
    'acquiredOn',v_today,'readyOn',v_today,'cost','120000','initialAccumulated','0',
    'lifeMonths','12','assetAccountCode','1500','accumulatedAccountCode','1590',
    'expenseAccountCode','6200','cashAccountCode','1010'));
  perform public.correct_cash_fixed_asset(v_business,
    'c0000000-0000-4000-8000-0000000000c1',v_asset,v_today,
    'Harga perolehan dan umur salah input','Mesin terkoreksi',240000,v_today,24,'1020');
  select a.cost,a.life_months into v_cost,v_life from public.accounting_fixed_assets a where a.id=v_asset;
  if v_cost<>240000 or v_life<>24 then raise exception 'Asset register revision is wrong'; end if;
  select t.ending_debit into v_fixed from public.get_accounting_trial_balance(v_business,v_today) t where t.code='1500';
  select t.ending_debit into v_cash from public.get_accounting_trial_balance(v_business,v_today) t where t.code='1010';
  select t.ending_debit into v_bank from public.get_accounting_trial_balance(v_business,v_today) t where t.code='1020';
  if v_fixed<>'240000' or v_cash<>'300000' or v_bank<>'60000' then
    raise exception 'Asset correction GL differs from register';
  end if;
  if (select count(*) from public.accounting_fixed_asset_revisions where business_id=v_business)<>1 then
    raise exception 'Asset revision audit missing';
  end if;
  if public.run_fixed_asset_depreciation(v_business,v_month)<>1 then
    raise exception 'Corrected asset did not depreciate';
  end if;
  select t.ending_debit into v_depreciation from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='6200';
  if v_depreciation<>'10000' then raise exception 'Corrected useful life depreciation is wrong'; end if;
  begin
    perform public.correct_cash_fixed_asset(v_business,
      'c0000000-0000-4000-8000-0000000000c2',v_asset,v_today,
      'Attempt after depreciation was posted','Too late',250000,v_today,25,'1020');
    raise exception 'Depreciated asset was corrected';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-0000000000cf',true);
  if exists(select 1 from public.accounting_fixed_asset_revisions where business_id=v_business) then
    raise exception 'Non-owner read asset revision audit';
  end if;
end; $$;
set constraints all immediate;
reset role;
rollback;
select 'passed' as accounting_asset_correction_smoke;
