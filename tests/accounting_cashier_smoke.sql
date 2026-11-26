-- Rollback-only cashier test on the separate accounting development project.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('a0000000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','cashier-owner-smoke@example.invalid','',now(),now(),now()),
 ('a0000000-0000-4000-8000-0000000000c2','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','cashier-manager-smoke@example.invalid','',now(),now(),now());
insert into public.businesses(id,owner_id,name)
values('b0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-0000000000c1','Cashier smoke');
insert into public.business_members(business_id,user_id,member_email)
values('b0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-0000000000c2',
  'cashier-manager-smoke@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub='a0000000-0000-4000-8000-0000000000c1';
set local request.jwt.claim.role='authenticated';
do $$
declare
  v_business uuid:='b0000000-0000-4000-8000-0000000000c1';
  v_owner uuid:='a0000000-0000-4000-8000-0000000000c1';
  v_manager uuid:='a0000000-0000-4000-8000-0000000000c2';
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_product uuid;
  v_sale uuid:='e0000000-0000-4000-8000-0000000000c1';
  v_catalog jsonb;
  v_result jsonb;
  v_receipt jsonb;
  v_journal uuid;
  v_qty bigint;
  v_value bigint;
begin
  perform public.post_accounting_journal(v_business,v_today,'opening_balance','initial','Saldo pembuka',
    '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"3100","debit":0,"credit":100000}]'::jsonb);
  v_product:=public.create_inventory_product(v_business,'stock','POS-1','Barang Kasir','pcs',
    5000,10000,0,'1200','5100','4100');
  perform public.activate_inventory(v_business,jsonb_build_array(
    jsonb_build_object('productId',v_product,'qtyMilli','0','value','0')));
  perform public.post_inventory_event(v_business,'d0000000-0000-4000-8000-0000000000c1',
    jsonb_build_object('kind','purchase','productId',v_product,'date',v_today,
      'qtyMilli','10000','amount','50000','payment','cash','cashAccountCode','1010'));

  perform set_config('request.jwt.claim.sub',v_manager::text,true);
  v_catalog:=public.get_cashier_catalog(v_business,'Kasir');
  if jsonb_array_length(v_catalog->'products')<>1
    or (v_catalog->'products'->0->>'qty_milli')::bigint<>10000
    or (v_catalog->'products'->0->>'sale_price')::bigint<>10000
    or (v_catalog->'products'->0) ? 'stock_value'
    or (v_catalog->'products'->0) ? 'purchase_price' then
    raise exception 'Cashier catalog leaked cost or returned wrong stock';
  end if;
  if exists(select 1 from public.inventory_products where id=v_product) then
    raise exception 'Manager read raw stock valuation table';
  end if;
  begin
    perform public.post_inventory_event(v_business,'d0000000-0000-4000-8000-0000000000c2',
      jsonb_build_object('kind','purchase','productId',v_product,'date',v_today,
        'qtyMilli','1000','amount','5000','payment','cash','cashAccountCode','1010'));
    raise exception 'Manager purchased stock';
  exception when insufficient_privilege then null; end;
  begin
    perform public.post_inventory_event(v_business,'e0000000-0000-4000-8000-0000000000c2',
      jsonb_build_object('kind','sale','productId',v_product,'date',v_today,
        'qtyMilli','1000','amount','10000','payment','credit'));
    raise exception 'Manager sold stock on credit';
  exception when insufficient_privilege then null; end;
  begin
    perform public.post_accounting_journal(v_business,v_today,'stock_sale',
      'e0000000-0000-4000-8000-0000000000cf','Forged cashier journal',
      '[{"accountCode":"1010","debit":10000,"credit":0},{"accountCode":"4100","debit":0,"credit":10000}]'::jsonb);
    set constraints require_inventory_movement_after_journal immediate;
    raise exception 'Manager forged a sale without a matching stock movement';
  exception when check_violation then null; end;

  perform public.post_inventory_event(v_business,v_sale,jsonb_build_object('kind','sale',
    'productId',v_product,'date',v_today,'qtyMilli','2000','amount','20000',
    'payment','cash','cashAccountCode','1010'));
  v_result:=public.get_cashier_sale_result(v_business,v_sale);
  v_journal:=(v_result->>'journalId')::uuid;
  if v_journal is null then raise exception 'Sale journal link is missing'; end if;
  v_receipt:=public.get_cash_sale_receipt(v_business,v_journal);
  if (v_receipt->>'amount')::bigint<>20000
    or position('Barang Kasir' in v_receipt->>'description')=0 then
    raise exception 'Manager receipt is missing product or total';
  end if;
  perform set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-0000000000cf',true);
  begin
    perform public.get_cashier_catalog(v_business,'');
    raise exception 'Unrelated user read cashier catalog';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_cash_sale_receipt(v_business,v_journal);
    raise exception 'Unrelated user read cashier receipt';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  select qty_milli,stock_value into v_qty,v_value from public.inventory_products where id=v_product;
  if v_qty<>8000 or v_value<>40000 then raise exception 'Cashier stock or HPP is wrong'; end if;
  if not exists(select 1 from public.get_accounting_trial_balance(v_business,v_today) t
    where t.code='1010' and t.ending_debit='70000')
    or not exists(select 1 from public.get_accounting_trial_balance(v_business,v_today) t
      where t.code='1200' and t.ending_debit='40000')
    or not exists(select 1 from public.get_accounting_trial_balance(v_business,v_today) t
      where t.code='5100' and t.ending_debit='10000') then
    raise exception 'Cashier journal does not reconcile';
  end if;
end; $$;
set constraints all immediate;
reset role;
rollback;
select 'passed' as accounting_cashier_smoke;
