-- A manager may post only cash-funded stock sales through the existing atomic stock function.
create or replace function public.post_accounting_journal(
  p_business_id uuid,
  p_entry_date date,
  p_source_type text,
  p_source_id text,
  p_description text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal_id uuid;
  v_line jsonb;
  v_account_id uuid;
  v_code text;
  v_debit bigint;
  v_credit bigint;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line_no integer := 0;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id
      and (b.owner_id = (select auth.uid()) or (
        p_source_type = 'stock_sale' and exists (
          select 1 from public.business_members m where m.business_id = b.id
            and m.user_id = (select auth.uid()) and m.role = 'manager'
        )
      ))
  ) then
    raise exception 'Owner or authorized stock-sale cashier required' using errcode = '42501';
  end if;
  if p_entry_date is null or p_entry_date > (now() at time zone 'Asia/Jakarta')::date
    or length(btrim(coalesce(p_source_type, ''))) not between 1 and 40
    or length(btrim(coalesce(p_source_id, ''))) not between 1 and 100
    or length(btrim(coalesce(p_description, ''))) not between 1 and 250
    or p_lines is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 2 and 200 then
    raise exception 'Invalid journal metadata or lines' using errcode = '22023';
  end if;

  insert into public.accounting_journals (business_id, entry_date, source_type, source_id, description, created_by)
  values (p_business_id, p_entry_date, btrim(p_source_type), btrim(p_source_id), btrim(p_description), (select auth.uid()))
  returning id into v_journal_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_no := v_line_no + 1;
    v_code := v_line->>'accountCode';
    if jsonb_typeof(v_line) <> 'object' or v_code is null
      or jsonb_typeof(v_line->'debit') <> 'number' or jsonb_typeof(v_line->'credit') <> 'number'
      or (v_line->>'debit') !~ '^[0-9]+$' or (v_line->>'credit') !~ '^[0-9]+$' then
      raise exception 'Invalid journal line' using errcode = '22023';
    end if;
    v_debit := (v_line->>'debit')::bigint;
    v_credit := (v_line->>'credit')::bigint;
    if (v_debit <= 0 and v_credit <= 0) or (v_debit > 0 and v_credit > 0)
      or v_debit > 9007199254740991 or v_credit > 9007199254740991 then
      raise exception 'Each line requires exactly one positive side' using errcode = '22023';
    end if;
    select a.id into v_account_id from public.accounting_accounts a
      where a.business_id = p_business_id and a.code = v_code and a.active;
    if v_account_id is null then
      raise exception 'Account is missing or inactive' using errcode = '23503';
    end if;
    insert into public.accounting_journal_lines (business_id, journal_id, account_id, line_no, debit, credit)
    values (p_business_id, v_journal_id, v_account_id, v_line_no, v_debit, v_credit);
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
    v_account_id := null;
  end loop;

  if v_total_debit <> v_total_credit or v_total_debit > 9007199254740991 then
    raise exception 'Journal is not balanced or exceeds safe Rupiah range' using errcode = '23514';
  end if;
  return v_journal_id;
end;
$$;

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
    where b.id = p_business_id and (b.owner_id = (select auth.uid()) or exists (
      select 1 from public.business_members m where m.business_id = b.id
        and m.user_id = (select auth.uid()) and m.role = 'manager'
    ))) then
    raise exception 'Business member required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id
    and b.owner_id = (select auth.uid())) and (v_kind <> 'sale' or v_payment <> 'cash') then
    raise exception 'Cashier may only sell stock for immediate payment' using errcode = '42501';
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

-- Cashier catalog exposes sale price and quantity, never cost or purchase price.
create function public.get_cashier_catalog(p_business_id uuid, p_query text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_book_date date;
  v_products jsonb;
  v_query text := btrim(coalesce(p_query,''));
begin
  if (select auth.uid()) is null or p_business_id is null
    or length(v_query) > 80 or not exists (
      select 1 from public.businesses b where b.id=p_business_id
        and (b.owner_id=(select auth.uid()) or exists (
          select 1 from public.business_members m where m.business_id=b.id
            and m.user_id=(select auth.uid()) and m.role='manager'
        ))
    ) then
    raise exception 'Cashier access required' using errcode='42501';
  end if;
  select started_on into v_book_date from public.inventory_books where business_id=p_business_id;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.name,q.sku),'[]'::jsonb) into v_products
  from (
    select p.id,p.kind,p.sku,p.name,p.unit,p.sale_price,p.qty_milli,p.revenue_account_id
    from public.inventory_products p where p.business_id=p_business_id
      and (v_query='' or position(lower(v_query) in lower(p.name))>0
        or position(lower(v_query) in lower(p.sku))>0)
    order by p.name,p.sku limit 30
  ) q;
  return jsonb_build_object('bookDate',v_book_date,'products',v_products);
end;
$$;
revoke all on function public.get_cashier_catalog(uuid,text) from public,anon,authenticated;
grant execute on function public.get_cashier_catalog(uuid,text) to authenticated;

-- Return the receipt link without granting cashiers access to stock valuation rows.
create function public.get_cashier_sale_result(p_business_id uuid, p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_movement public.inventory_movements%rowtype;
begin
  if (select auth.uid()) is null or p_business_id is null or p_event_id is null then
    raise exception 'Business access required' using errcode='42501';
  end if;
  select * into v_movement from public.inventory_movements m
    where m.business_id=p_business_id and m.id=p_event_id and (
      exists(select 1 from public.businesses b where b.id=p_business_id
        and b.owner_id=(select auth.uid()))
      or (m.event_kind='sale' and m.credit_document_id is null
        and m.created_by=(select auth.uid()) and exists(
          select 1 from public.business_members bm where bm.business_id=p_business_id
            and bm.user_id=(select auth.uid()) and bm.role='manager'
        ))
    );
  if not found then raise exception 'Sale result not found' using errcode='P0002'; end if;
  return jsonb_build_object('journalId',v_movement.journal_id,
    'documentId',v_movement.credit_document_id);
end;
$$;
revoke all on function public.get_cashier_sale_result(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_cashier_sale_result(uuid,uuid) to authenticated;

-- A manager may read only their own stock-sale receipt; the owner sees every sale.
create or replace function public.get_cash_sale_receipt(p_business_id uuid, p_journal_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_journal public.accounting_journals%rowtype;
  v_business_name text;
  v_cash_name text;
  v_cash numeric;
  v_revenue numeric;
  v_corrected boolean;
  v_description text;
  v_stock record;
begin
  if (select auth.uid()) is null or p_business_id is null or p_journal_id is null then
    raise exception 'Business access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id
    and (b.owner_id = (select auth.uid()) or exists (
      select 1 from public.business_members m where m.business_id = b.id
        and m.user_id = (select auth.uid()) and m.role = 'manager'
    ))) then
    raise exception 'Business access required' using errcode = '42501';
  end if;
  select * into v_journal from public.accounting_journals j
    where j.id = p_journal_id and j.business_id = p_business_id and j.source_type in ('cash_sale','stock_sale');
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
  v_description := v_journal.description;
  if v_journal.source_type = 'stock_sale' then
    select p.name,p.unit,m.qty_delta_milli into v_stock
    from public.inventory_movements m
    join public.inventory_products p on p.id=m.product_id and p.business_id=m.business_id
    where m.business_id=p_business_id and m.journal_id=p_journal_id
      and m.event_kind='sale';
    if not found then raise exception 'Stock sale movement missing' using errcode='23514'; end if;
    v_description := rtrim(rtrim((abs(v_stock.qty_delta_milli)::numeric / 1000.0)::text,'0'),'.')
      || ' ' || v_stock.unit || ' × ' || v_stock.name;
  end if;
  select exists(select 1 from public.accounting_corrections c
    where c.business_id=p_business_id and c.original_journal_id=p_journal_id)
    into v_corrected;
  return jsonb_build_object(
    'journalId',v_journal.id,'businessName',v_business_name,
    'receiptNo','TRX-'||upper(left(replace(v_journal.id::text,'-',''),12)),
    'date',v_journal.entry_date,'description',v_description,
    'cashName',v_cash_name,'amount',v_cash::bigint::text,'corrected',v_corrected
  );
end;
$$;
revoke all on function public.get_cash_sale_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_cash_sale_receipt(uuid,uuid) to authenticated;
