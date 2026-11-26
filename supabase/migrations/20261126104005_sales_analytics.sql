-- Owner-only operational sales summaries. Cash sales without a product/contact are
-- intentionally absent from the corresponding attribution table.
create function public.get_accounting_product_sales(
  p_business_id uuid, p_start date, p_end date
) returns table (
  product_id uuid, sku text, product_name text, unit text,
  quantity_milli text, revenue text, cogs text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) then raise exception 'Only owner may read sales analytics' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_start > p_end
    or p_end > (now() at time zone 'Asia/Jakarta')::date
    or p_end - p_start > 366 then
    raise exception 'Invalid sales analytics period' using errcode = '22023';
  end if;
  return query
  select p.id, p.sku, p.name, p.unit,
    sum(-m.qty_delta_milli)::text,
    sum(coalesce(r.amount, 0))::text,
    sum(-m.value_delta)::text
  from public.inventory_movements m
  join public.inventory_products p on p.id = m.product_id and p.business_id = m.business_id
  left join public.accounting_credit_documents d
    on d.id = m.credit_document_id and d.business_id = m.business_id
  left join lateral (
    select coalesce(sum(l.credit - l.debit), 0) as amount
    from public.accounting_journal_lines l
    join public.accounting_accounts a on a.id = l.account_id and a.business_id = l.business_id
    where l.journal_id = coalesce(d.journal_id, m.journal_id)
      and l.business_id = p_business_id and a.role = 'revenue'
  ) r on true
  where m.business_id = p_business_id and m.event_date between p_start and p_end
    and (m.event_kind = 'sale' or (m.event_kind = 'correction_reversal'
      and exists (select 1 from public.accounting_inventory_corrections c
        join public.inventory_movements original on original.id = c.original_movement_id
        where c.reversal_movement_id = m.id and original.event_kind = 'sale')))
  group by p.id, p.sku, p.name, p.unit
  order by sum(coalesce(r.amount, 0)) desc, p.sku
  limit 1000;
end;
$$;
revoke all on function public.get_accounting_product_sales(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_accounting_product_sales(uuid, date, date) to authenticated;

create function public.get_accounting_customer_sales(
  p_business_id uuid, p_start date, p_end date
) returns table (
  contact_id uuid, customer_name text, document_count bigint, revenue text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) then raise exception 'Only owner may read sales analytics' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_start > p_end
    or p_end > (now() at time zone 'Asia/Jakarta')::date
    or p_end - p_start > 366 then
    raise exception 'Invalid sales analytics period' using errcode = '22023';
  end if;
  return query
  select d.contact_id, d.contact_name, count(*)::bigint, sum(d.amount)::text
  from public.accounting_credit_documents d
  join public.accounting_accounts a on a.id = d.recognition_account_id
    and a.business_id = d.business_id and a.role = 'revenue'
  where d.business_id = p_business_id and d.kind = 'sale'
    and d.issue_date between p_start and p_end
  group by d.contact_id, d.contact_name
  order by sum(d.amount) desc, d.contact_name
  limit 1000;
end;
$$;
revoke all on function public.get_accounting_customer_sales(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_accounting_customer_sales(uuid, date, date) to authenticated;
