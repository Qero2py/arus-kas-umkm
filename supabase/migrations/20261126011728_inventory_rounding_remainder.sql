-- Preserve at least Rp1 of value until the final unit leaves stock.
-- A zero-value count difference changes quantity without an artificial Rupiah journal.
alter table public.inventory_movements drop constraint inventory_movements_check;
alter table public.inventory_movements add constraint inventory_movements_journal_check check (
  (event_kind = 'opening' and journal_id is null and credit_document_id is null) or
  (event_kind = 'opname' and value_delta = 0 and journal_id is null and credit_document_id is null) or
  (event_kind <> 'opening' and journal_id is not null)
);

create or replace function public.post_inventory_event(p_business_id uuid, p_event_id uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_product public.inventory_products%rowtype;
  v_kind text := p_payload->>'kind';
  v_payment text := p_payload->>'payment';
  v_date date;
  v_qty bigint;
  v_amount bigint;
  v_delta_qty bigint;
  v_delta_value bigint;
  v_cost bigint;
  v_new_qty bigint;
  v_new_value bigint;
  v_cash_code text := p_payload->>'cashAccountCode';
  v_control_code text := p_payload->>'controlAccountCode';
  v_expense_code text := p_payload->>'expenseAccountCode';
  v_inventory_code text;
  v_cogs_code text;
  v_revenue_code text;
  v_journal_id uuid;
  v_document_id uuid;
  v_description text;
  v_lines jsonb;
  v_book_date date;
  v_gl numeric;
  v_stock numeric;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())) then
    raise exception 'Only owner may post stock events' using errcode = '42501';
  end if;
  if p_event_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or v_kind is null or v_kind not in ('purchase', 'sale', 'opname')
    or coalesce(p_payload->>'productId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$'
    or coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_payload->>'qtyMilli','') !~ '^(0|[1-9][0-9]*)$'
    or coalesce(p_payload->>'amount','') !~ '^(0|[1-9][0-9]*)$' then
    raise exception 'Invalid stock event' using errcode = '22023';
  end if;
  v_date := (p_payload->>'date')::date;
  v_qty := (p_payload->>'qtyMilli')::bigint;
  v_amount := (p_payload->>'amount')::bigint;
  if v_date > (now() at time zone 'Asia/Jakarta')::date
    or v_qty not between 0 and 1000000000000
    or v_amount not between 0 and 9007199254740991
    or (v_kind <> 'opname' and (v_qty = 0 or v_amount = 0)) then
    raise exception 'Invalid stock date, quantity, or amount' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text, 31));
  select started_on into v_book_date from public.inventory_books where business_id = p_business_id;
  if v_book_date is null or v_date < v_book_date then
    raise exception 'Activate inventory first; event cannot predate activation' using errcode = '23514';
  end if;
  select * into v_product from public.inventory_products p where p.id = (p_payload->>'productId')::uuid
    and p.business_id = p_business_id and p.kind = 'stock' for update;
  if not found then raise exception 'Stock product missing' using errcode = '23514'; end if;
  if exists (select 1 from public.inventory_movements m where m.business_id = p_business_id
    and m.product_id = v_product.id and m.event_date > v_date) then
    raise exception 'Stock events must follow product date order' using errcode = '23514';
  end if;
  select a.code into v_inventory_code from public.accounting_accounts a
    where a.id = v_product.inventory_account_id and a.business_id = p_business_id and a.active;
  select a.code into v_cogs_code from public.accounting_accounts a
    where a.id = v_product.cogs_account_id and a.business_id = p_business_id and a.active;
  select a.code into v_revenue_code from public.accounting_accounts a
    where a.id = v_product.revenue_account_id and a.business_id = p_business_id and a.active;
  if v_inventory_code is null or v_cogs_code is null or v_revenue_code is null then
    raise exception 'Product account is inactive' using errcode = '23514';
  end if;
  select coalesce(sum(l.debit::numeric-l.credit::numeric),0) into v_gl from public.accounting_journal_lines l
    where l.business_id = p_business_id and l.account_id = v_product.inventory_account_id;
  select coalesce(sum(p.stock_value::numeric),0) into v_stock from public.inventory_products p
    where p.business_id = p_business_id and p.inventory_account_id = v_product.inventory_account_id;
  if v_gl <> v_stock then raise exception 'Reconcile inventory GL before posting stock' using errcode = '23514'; end if;

  if v_kind in ('purchase','sale') then
    if v_payment is null or v_payment not in ('cash','credit') then
      raise exception 'Invalid payment type' using errcode = '22023'; end if;
    if v_payment = 'cash' and not exists (select 1 from public.accounting_accounts a
      where a.business_id = p_business_id and a.code = v_cash_code and a.role = 'cash' and a.active) then
      raise exception 'Cash account missing' using errcode = '23514';
    end if;
    if v_payment = 'credit' and (
      coalesce(p_payload->>'contactId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$'
      or coalesce(p_payload->>'documentNo','') = ''
      or coalesce(p_payload->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or not exists (select 1 from public.accounting_accounts a where a.business_id = p_business_id
        and a.code = v_control_code and a.role = case when v_kind = 'sale' then 'receivable' else 'payable' end
        and a.active)) then
      raise exception 'Invalid credit document fields' using errcode = '23514';
    end if;
  end if;

  if v_kind = 'purchase' then
    v_new_qty := v_product.qty_milli + v_qty;
    v_new_value := v_product.stock_value + v_amount;
    v_delta_qty := v_qty;
    v_delta_value := v_amount;
  elsif v_kind = 'sale' then
    if v_qty > v_product.qty_milli then raise exception 'Insufficient stock' using errcode = '23514'; end if;
    v_cost := case when v_qty = v_product.qty_milli then v_product.stock_value
      else least(round(v_product.stock_value::numeric * v_qty::numeric / v_product.qty_milli)::bigint, v_product.stock_value - 1) end;
    v_new_qty := v_product.qty_milli - v_qty;
    v_new_value := v_product.stock_value - v_cost;
    v_delta_qty := -v_qty;
    v_delta_value := -v_cost;
  else
    v_delta_qty := v_qty - v_product.qty_milli;
    if v_delta_qty = 0 then raise exception 'Stock count has no difference' using errcode = '23514'; end if;
    if v_delta_qty < 0 then
      v_cost := case when v_qty = 0 then v_product.stock_value else
        least(round(v_product.stock_value::numeric * (-v_delta_qty)::numeric / v_product.qty_milli)::bigint, v_product.stock_value - 1) end;
      v_delta_value := -v_cost;
    else
      v_delta_value := case when v_product.qty_milli = 0 or v_product.stock_value = 0 then v_amount else
        round(v_product.stock_value::numeric * v_delta_qty::numeric / v_product.qty_milli)::bigint end;
      if v_delta_value = 0 then raise exception 'Stock gain needs a positive valuation' using errcode = '23514'; end if;
    end if;
    v_new_qty := v_qty;
    v_new_value := v_product.stock_value + v_delta_value;
    if not exists (select 1 from public.accounting_accounts a where a.business_id = p_business_id
      and a.code = v_expense_code and a.role = 'expense' and a.active) then
      raise exception 'Stock variance expense account missing' using errcode = '23514';
    end if;
  end if;
  if v_new_qty not between 0 and 1000000000000 or v_new_value not between 0 and 9007199254740991
    or (v_new_qty = 0 and v_new_value <> 0) then
    raise exception 'Stock amount exceeds supported range' using errcode = '22023';
  end if;
  v_description := case v_kind when 'purchase' then 'Pembelian stok ' when 'sale' then 'Penjualan stok '
    else 'Penyesuaian stok ' end || v_product.sku;

  if v_kind in ('purchase','sale') and v_payment = 'credit' then
    v_document_id := public.create_accounting_credit_document(p_business_id, p_event_id,
      case when v_kind = 'sale' then 'sale' else 'purchase' end,
      (p_payload->>'contactId')::uuid, p_payload->>'documentNo', v_date,
      (p_payload->>'dueDate')::date, v_description, v_amount,
      case when v_kind = 'sale' then v_revenue_code else v_inventory_code end,
      v_control_code);
    select d.journal_id into v_journal_id from public.accounting_credit_documents d
      where d.id = v_document_id and d.business_id = p_business_id;
  elsif v_kind = 'purchase' then
    v_lines := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('accountCode',v_inventory_code,'debit',v_amount,'credit',0),
      pg_catalog.jsonb_build_object('accountCode',v_cash_code,'debit',0,'credit',v_amount));
    v_journal_id := public.post_accounting_journal(p_business_id,v_date,'stock_purchase',p_event_id::text,v_description,v_lines);
  elsif v_kind = 'sale' then
    v_lines := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('accountCode',v_cash_code,'debit',v_amount,'credit',0),
      pg_catalog.jsonb_build_object('accountCode',v_revenue_code,'debit',0,'credit',v_amount));
    if v_cost > 0 then
      v_lines := v_lines || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('accountCode',v_cogs_code,'debit',v_cost,'credit',0),
        pg_catalog.jsonb_build_object('accountCode',v_inventory_code,'debit',0,'credit',v_cost));
    end if;
    v_journal_id := public.post_accounting_journal(p_business_id,v_date,'stock_sale',p_event_id::text,v_description,v_lines);
  else
    if v_delta_value > 0 then
      v_lines := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('accountCode',v_inventory_code,'debit',v_delta_value,'credit',0),
        pg_catalog.jsonb_build_object('accountCode',v_expense_code,'debit',0,'credit',v_delta_value));
    elsif v_delta_value < 0 then
      v_lines := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('accountCode',v_expense_code,'debit',-v_delta_value,'credit',0),
        pg_catalog.jsonb_build_object('accountCode',v_inventory_code,'debit',0,'credit',-v_delta_value));
    else
      v_journal_id := null;
    end if;
    if v_delta_value <> 0 then
      v_journal_id := public.post_accounting_journal(p_business_id,v_date,'stock_opname',p_event_id::text,v_description,v_lines);
    end if;
  end if;
  if v_kind = 'sale' and v_payment = 'credit' and v_cost > 0 then
    v_lines := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('accountCode',v_cogs_code,'debit',v_cost,'credit',0),
      pg_catalog.jsonb_build_object('accountCode',v_inventory_code,'debit',0,'credit',v_cost));
    v_journal_id := public.post_accounting_journal(p_business_id,v_date,'stock_cogs',p_event_id::text,
      'HPP ' || v_product.sku,v_lines);
  end if;
  update public.inventory_products set qty_milli = v_new_qty, stock_value = v_new_value where id = v_product.id;
  insert into public.inventory_movements (id,business_id,product_id,event_kind,event_date,
    qty_delta_milli,value_delta,qty_after_milli,value_after,journal_id,credit_document_id,created_by)
  values (p_event_id,p_business_id,v_product.id,v_kind,v_date,v_delta_qty,v_delta_value,
    v_new_qty,v_new_value,v_journal_id,v_document_id,(select auth.uid()));
  return p_event_id;
end; $$;
revoke all on function public.post_inventory_event(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.post_inventory_event(uuid, uuid, jsonb) to authenticated;
