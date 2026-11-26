-- Inventory is a separate, owner-only subledger. Quantities use thousandths of a unit.
-- Moving-average cost is represented by current stock value / current quantity;
-- every issue rounds once to whole Rupiah and the final issue takes the remainder.
create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('stock', 'service')),
  sku text not null check (sku ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  unit text not null check (length(btrim(unit)) between 1 and 20),
  purchase_price bigint not null default 0 check (purchase_price between 0 and 9007199254740991),
  sale_price bigint not null default 0 check (sale_price between 0 and 9007199254740991),
  min_qty_milli bigint not null default 0 check (min_qty_milli between 0 and 1000000000000),
  inventory_account_id uuid,
  cogs_account_id uuid,
  revenue_account_id uuid not null,
  qty_milli bigint not null default 0 check (qty_milli between 0 and 1000000000000),
  stock_value bigint not null default 0 check (stock_value between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (business_id, sku),
  unique (id, business_id),
  foreign key (inventory_account_id, business_id) references public.accounting_accounts (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (cogs_account_id, business_id) references public.accounting_accounts (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (revenue_account_id, business_id) references public.accounting_accounts (id, business_id)
    on delete no action deferrable initially deferred,
  check ((kind = 'stock' and inventory_account_id is not null and cogs_account_id is not null)
    or (kind = 'service' and inventory_account_id is null and cogs_account_id is null
      and qty_milli = 0 and stock_value = 0 and min_qty_milli = 0))
);

create table public.inventory_books (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  started_on date not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null,
  event_kind text not null check (event_kind in ('opening', 'purchase', 'sale', 'opname')),
  event_date date not null,
  qty_delta_milli bigint not null,
  value_delta bigint not null,
  qty_after_milli bigint not null check (qty_after_milli between 0 and 1000000000000),
  value_after bigint not null check (value_after between 0 and 9007199254740991),
  journal_id uuid,
  credit_document_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (product_id, business_id) references public.inventory_products (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (journal_id, business_id) references public.accounting_journals (id, business_id)
    on delete no action deferrable initially deferred,
  foreign key (credit_document_id, business_id) references public.accounting_credit_documents (id, business_id)
    on delete no action deferrable initially deferred,
  check ((event_kind = 'opening' and journal_id is null and credit_document_id is null)
    or (event_kind <> 'opening' and journal_id is not null)),
  check (qty_delta_milli <> 0)
);
create index inventory_movements_product_date_idx
  on public.inventory_movements (business_id, product_id, event_date, created_at);

alter table public.inventory_products enable row level security;
alter table public.inventory_books enable row level security;
alter table public.inventory_movements enable row level security;
revoke all on public.inventory_products, public.inventory_books, public.inventory_movements from anon, authenticated;
grant select on public.inventory_products, public.inventory_books, public.inventory_movements to authenticated;
create policy "Owner reads inventory products" on public.inventory_products
for select to authenticated using (exists (select 1 from public.businesses b
  where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner reads inventory book" on public.inventory_books
for select to authenticated using (exists (select 1 from public.businesses b
  where b.id = business_id and b.owner_id = (select auth.uid())));
create policy "Owner reads inventory movements" on public.inventory_movements
for select to authenticated using (exists (select 1 from public.businesses b
  where b.id = business_id and b.owner_id = (select auth.uid())));

create function public.create_inventory_product(
  p_business_id uuid, p_kind text, p_sku text, p_name text, p_unit text,
  p_purchase_price bigint, p_sale_price bigint, p_min_qty_milli bigint,
  p_inventory_account_code text, p_cogs_account_code text, p_revenue_account_code text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inventory_id uuid;
  v_cogs_id uuid;
  v_revenue_id uuid;
  v_id uuid;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())) then
    raise exception 'Only owner may create products' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('stock', 'service')
    or upper(btrim(coalesce(p_sku, ''))) !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'
    or length(btrim(coalesce(p_name, ''))) not between 1 and 100
    or length(btrim(coalesce(p_unit, ''))) not between 1 and 20
    or p_purchase_price not between 0 and 9007199254740991
    or p_sale_price not between 0 and 9007199254740991
    or p_min_qty_milli not between 0 and 1000000000000
    or (p_kind = 'service' and p_min_qty_milli <> 0) then
    raise exception 'Invalid product fields' using errcode = '22023';
  end if;
  select a.id into v_revenue_id from public.accounting_accounts a
    where a.business_id = p_business_id and a.code = p_revenue_account_code
      and a.role = 'revenue' and a.active;
  if p_kind = 'stock' then
    select a.id into v_inventory_id from public.accounting_accounts a
      where a.business_id = p_business_id and a.code = p_inventory_account_code
        and a.role = 'inventory' and a.active;
    select a.id into v_cogs_id from public.accounting_accounts a
      where a.business_id = p_business_id and a.code = p_cogs_account_code
        and a.role = 'cogs' and a.active;
  end if;
  if v_revenue_id is null or (p_kind = 'stock' and (v_inventory_id is null or v_cogs_id is null)) then
    raise exception 'Product account roles do not match' using errcode = '23514';
  end if;
  insert into public.inventory_products (business_id, kind, sku, name, unit,
    purchase_price, sale_price, min_qty_milli, inventory_account_id,
    cogs_account_id, revenue_account_id)
  values (p_business_id, p_kind, upper(btrim(p_sku)), btrim(p_name), btrim(p_unit),
    p_purchase_price, p_sale_price, p_min_qty_milli, v_inventory_id,
    v_cogs_id, v_revenue_id) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.create_inventory_product(
  uuid, text, text, text, text, bigint, bigint, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_inventory_product(
  uuid, text, text, text, text, bigint, bigint, bigint, text, text, text
) to authenticated;

-- The opening quantity/value allocation must exactly equal the existing inventory GL balance.
-- No opening journal is invented: users first reconcile the already-posted accounting balance.
create function public.activate_inventory(p_business_id uuid, p_openings jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_product public.inventory_products%rowtype;
  v_id uuid;
  v_qty bigint;
  v_value bigint;
  v_seen uuid[] := '{}';
  v_expected numeric;
  v_actual numeric;
  v_account record;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())) then
    raise exception 'Only owner may activate inventory' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text, 31));
  if exists (select 1 from public.inventory_books where business_id = p_business_id)
    or p_openings is null or jsonb_typeof(p_openings) <> 'array'
    or jsonb_array_length(p_openings) > 10000 then
    raise exception 'Invalid or repeated inventory activation' using errcode = '23514';
  end if;
  for v_item in select value from jsonb_array_elements(p_openings) loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(v_item->>'productId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$'
      or coalesce(v_item->>'qtyMilli', '') !~ '^(0|[1-9][0-9]*)$'
      or coalesce(v_item->>'value', '') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'Invalid opening stock item' using errcode = '22023';
    end if;
    v_id := (v_item->>'productId')::uuid;
    v_qty := (v_item->>'qtyMilli')::bigint;
    v_value := (v_item->>'value')::bigint;
    if v_id = any(v_seen) or v_qty not between 0 and 1000000000000
      or v_value not between 0 and 9007199254740991
      or (v_qty = 0 and v_value <> 0) or (v_qty > 0 and v_value = 0) then
      raise exception 'Opening stock quantity/value mismatch' using errcode = '23514';
    end if;
    v_seen := array_append(v_seen, v_id);
    select * into v_product from public.inventory_products p
      where p.id = v_id and p.business_id = p_business_id and p.kind = 'stock' for update;
    if not found then raise exception 'Opening stock product missing' using errcode = '23514'; end if;
    update public.inventory_products set qty_milli = v_qty, stock_value = v_value where id = v_id;
    if v_qty > 0 then
      insert into public.inventory_movements (id, business_id, product_id, event_kind,
        event_date, qty_delta_milli, value_delta, qty_after_milli, value_after, created_by)
      values (gen_random_uuid(), p_business_id, v_id, 'opening', v_today,
        v_qty, v_value, v_qty, v_value, (select auth.uid()));
    end if;
  end loop;
  if (select count(*) from public.inventory_products p
    where p.business_id = p_business_id and p.kind = 'stock') <> cardinality(v_seen) then
    raise exception 'Every stock product needs an opening allocation, including zero' using errcode = '23514';
  end if;
  for v_account in select a.id from public.accounting_accounts a
    where a.business_id = p_business_id and a.role = 'inventory' loop
    select coalesce(sum(l.debit::numeric - l.credit::numeric), 0) into v_expected
    from public.accounting_journal_lines l where l.business_id = p_business_id
      and l.account_id = v_account.id;
    select coalesce(sum(p.stock_value::numeric), 0) into v_actual
    from public.inventory_products p where p.business_id = p_business_id
      and p.inventory_account_id = v_account.id;
    if v_expected <> v_actual then
      raise exception 'Opening stock value must equal inventory GL balance' using errcode = '23514';
    end if;
  end loop;
  insert into public.inventory_books (business_id, started_on, created_by)
    values (p_business_id, v_today, (select auth.uid()));
end; $$;
revoke all on function public.activate_inventory(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.activate_inventory(uuid, jsonb) to authenticated;

-- Once active, all changes to an inventory account must have matching product value.
create function private.check_inventory_gl_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account public.accounting_accounts%rowtype; v_gl numeric; v_stock numeric;
begin
  if not exists (select 1 from public.inventory_books b where b.business_id = new.business_id) then return null; end if;
  select * into v_account from public.accounting_accounts a where a.id = new.account_id and a.role = 'inventory';
  if not found then return null; end if;
  select coalesce(sum(l.debit::numeric-l.credit::numeric),0) into v_gl
    from public.accounting_journal_lines l where l.business_id = new.business_id and l.account_id = new.account_id;
  select coalesce(sum(p.stock_value::numeric),0) into v_stock
    from public.inventory_products p where p.business_id = new.business_id and p.inventory_account_id = new.account_id;
  if v_gl <> v_stock then raise exception 'Inventory GL and stock value differ' using errcode = '23514'; end if;
  return null;
end; $$;
create constraint trigger check_inventory_gl_balance_after_line
after insert on public.accounting_journal_lines deferrable initially deferred
for each row execute function private.check_inventory_gl_balance();
revoke all on function private.check_inventory_gl_balance() from public, anon, authenticated;

-- Reserved stock journal types require a matching immutable movement.
create function private.require_inventory_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source_type not in ('stock_purchase', 'stock_sale', 'stock_cogs', 'stock_opname') then return null; end if;
  if new.source_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$'
    or not exists (select 1 from public.inventory_movements m
      where m.id = new.source_id::uuid and m.business_id = new.business_id
        and m.journal_id = new.id) then
    raise exception 'Stock journal requires matching movement' using errcode = '23514';
  end if;
  return null;
end; $$;
create constraint trigger require_inventory_movement_after_journal
after insert on public.accounting_journals deferrable initially deferred
for each row execute function private.require_inventory_movement();
revoke all on function private.require_inventory_movement() from public, anon, authenticated;

create function public.post_inventory_event(p_business_id uuid, p_event_id uuid, p_payload jsonb)
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
      else round(v_product.stock_value::numeric * v_qty::numeric / v_product.qty_milli)::bigint end;
    v_new_qty := v_product.qty_milli - v_qty;
    v_new_value := v_product.stock_value - v_cost;
    v_delta_qty := -v_qty;
    v_delta_value := -v_cost;
  else
    v_delta_qty := v_qty - v_product.qty_milli;
    if v_delta_qty = 0 then raise exception 'Stock count has no difference' using errcode = '23514'; end if;
    if v_delta_qty < 0 then
      v_cost := case when v_qty = 0 then v_product.stock_value else
        round(v_product.stock_value::numeric * (-v_delta_qty)::numeric / v_product.qty_milli)::bigint end;
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
      raise exception 'Zero-value stock adjustment is not supported' using errcode = '23514';
    end if;
    v_journal_id := public.post_accounting_journal(p_business_id,v_date,'stock_opname',p_event_id::text,v_description,v_lines);
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
