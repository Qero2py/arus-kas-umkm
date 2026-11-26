-- Rollback-only inventory correction test on accounting development.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('a0000000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','stock-correction-smoke@example.invalid','',now(),now(),now());
insert into public.businesses(id,owner_id,name)
values('b0000000-0000-4000-8000-0000000000b1','a0000000-0000-4000-8000-0000000000b1','Stock correction smoke');
set local role authenticated;
set local request.jwt.claim.sub='a0000000-0000-4000-8000-0000000000b1';
set local request.jwt.claim.role='authenticated';
do $$
declare
  v_business uuid:='b0000000-0000-4000-8000-0000000000b1';
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_product uuid;
  v_purchase uuid:='d0000000-0000-4000-8000-0000000000b1';
  v_sale uuid:='e0000000-0000-4000-8000-0000000000b1';
  v_qty bigint; v_value bigint; v_gl text; v_cash text; v_revenue text; v_cogs text;
begin
  perform public.post_accounting_journal(v_business,v_today,'opening_balance','initial','Saldo pembuka',
    '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"3100","debit":0,"credit":100000}]'::jsonb);
  v_product:=public.create_inventory_product(v_business,'stock','STK-CORR','Barang koreksi','pcs',
    5000,10000,0,'1200','5100','4100');
  perform public.activate_inventory(v_business,jsonb_build_array(
    jsonb_build_object('productId',v_product,'qtyMilli','0','value','0')));
  perform public.post_inventory_event(v_business,v_purchase,jsonb_build_object('kind','purchase',
    'productId',v_product,'date',v_today,'qtyMilli','10000','amount','50000',
    'payment','cash','cashAccountCode','1010'));
  perform public.correct_cash_inventory_event(v_business,
    'c0000000-0000-4000-8000-0000000000b1',v_purchase,
    'd0000000-0000-4000-8000-0000000000b2',v_today,'Jumlah pembelian salah input',
    jsonb_build_object('kind','purchase','productId',v_product,'qtyMilli','12000',
      'amount','60000','payment','cash','cashAccountCode','1010'));
  select p.qty_milli,p.stock_value into v_qty,v_value from public.inventory_products p where p.id=v_product;
  if v_qty<>12000 or v_value<>60000 then raise exception 'Corrected purchase stock is wrong'; end if;
  perform public.post_inventory_event(v_business,v_sale,jsonb_build_object('kind','sale',
    'productId',v_product,'date',v_today,'qtyMilli','2000','amount','20000',
    'payment','cash','cashAccountCode','1010'));
  begin
    perform public.correct_cash_inventory_event(v_business,
      'c0000000-0000-4000-8000-0000000000b9',v_purchase,
      'd0000000-0000-4000-8000-0000000000b9',v_today,'Earlier event correction attempt',
      jsonb_build_object('kind','purchase','productId',v_product,'qtyMilli','13000',
        'amount','65000','payment','cash','cashAccountCode','1010'));
    raise exception 'Non-latest movement was corrected';
  exception when check_violation then null;
  end;
  perform public.correct_cash_inventory_event(v_business,
    'c0000000-0000-4000-8000-0000000000b2',v_sale,
    'e0000000-0000-4000-8000-0000000000b2',v_today,'Penjualan salah jumlah barang',
    jsonb_build_object('kind','sale','productId',v_product,'qtyMilli','3000',
      'amount','30000','payment','cash','cashAccountCode','1010'));
  if (select event_kind from public.inventory_movements where product_id=v_product
      order by posting_order desc limit 1)<>'sale' then
    raise exception 'Replacement movement is not the latest';
  end if;
  perform public.correct_cash_inventory_event(v_business,
    'c0000000-0000-4000-8000-0000000000b3',
    'e0000000-0000-4000-8000-0000000000b2',
    'e0000000-0000-4000-8000-0000000000b3',v_today,
    'Koreksi kedua atas penjualan terakhir',
    jsonb_build_object('kind','sale','productId',v_product,'qtyMilli','2000',
      'amount','22000','payment','cash','cashAccountCode','1010'));
  select p.qty_milli,p.stock_value into v_qty,v_value from public.inventory_products p where p.id=v_product;
  if v_qty<>10000 or v_value<>50000 then raise exception 'Corrected sale stock and HPP are wrong'; end if;
  select t.ending_debit into v_gl from public.get_accounting_trial_balance(v_business,v_today) t where t.code='1200';
  select t.ending_debit into v_cash from public.get_accounting_trial_balance(v_business,v_today) t where t.code='1010';
  select t.ending_credit into v_revenue from public.get_accounting_trial_balance(v_business,v_today) t where t.code='4100';
  select t.ending_debit into v_cogs from public.get_accounting_trial_balance(v_business,v_today) t where t.code='5100';
  if v_gl<>'50000' or v_cash<>'62000' or v_revenue<>'22000' or v_cogs<>'10000' then
    raise exception 'Corrected inventory GL does not match product';
  end if;
  if (select count(*) from public.accounting_inventory_corrections where business_id=v_business)<>3
    or (select count(*) from public.inventory_movements where product_id=v_product
      and event_kind='correction_reversal')<>3 then
    raise exception 'Inventory correction audit is incomplete';
  end if;
  perform set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-0000000000bf',true);
  if exists(select 1 from public.accounting_inventory_corrections where business_id=v_business) then
    raise exception 'Non-owner read inventory correction audit';
  end if;
end; $$;
set constraints all immediate;
reset role;
rollback;
select 'passed' as accounting_inventory_correction_smoke;
