-- Order movements deterministically, including reversal and replacement in one transaction.
alter table public.inventory_movements add column posting_order bigint;
with ordered as (
  select id,row_number() over(order by created_at,id) as seq from public.inventory_movements
)
update public.inventory_movements m set posting_order=o.seq from ordered o where o.id=m.id;
create sequence public.inventory_movement_posting_order_seq;
select setval('public.inventory_movement_posting_order_seq',
  greatest(coalesce(max(posting_order),0),1),coalesce(max(posting_order),0)>0)
from public.inventory_movements;
alter table public.inventory_movements alter column posting_order
  set default nextval('public.inventory_movement_posting_order_seq');
alter table public.inventory_movements alter column posting_order set not null;
alter sequence public.inventory_movement_posting_order_seq owned by public.inventory_movements.posting_order;
create unique index inventory_movements_posting_order_idx on public.inventory_movements(posting_order);

create or replace function public.correct_cash_inventory_event(
  p_business_id uuid,p_correction_id uuid,p_original_movement_id uuid,
  p_replacement_event_id uuid,p_correction_date date,p_reason text,p_payload jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_movement public.inventory_movements%rowtype;
  v_product public.inventory_products%rowtype;
  v_latest_id uuid;
  v_before_qty bigint; v_before_value bigint;
  v_reversal_movement_id uuid:=gen_random_uuid();
  v_reversal_journal_id uuid; v_replacement_journal_id uuid;
  v_payload jsonb;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=(select auth.uid())) then
    raise exception 'Only owner may correct inventory' using errcode='42501';
  end if;
  if p_correction_id is null or p_original_movement_id is null or p_replacement_event_id is null
    or p_correction_id=p_replacement_event_id or p_correction_id=v_reversal_movement_id
    or p_correction_date is null or p_correction_date>(now() at time zone 'Asia/Jakarta')::date
    or length(btrim(coalesce(p_reason,''))) not between 10 and 500
    or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'Invalid inventory correction metadata' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,31));
  select * into v_movement from public.inventory_movements m
    where m.id=p_original_movement_id and m.business_id=p_business_id for update;
  if not found or v_movement.event_kind not in ('purchase','sale','opname')
    or v_movement.credit_document_id is not null
    or p_correction_date<v_movement.event_date
    or date_trunc('month',p_correction_date)<>date_trunc('month',v_movement.event_date) then
    raise exception 'Only open, cash-funded product events can be corrected here' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,17));
  if exists(select 1 from public.accounting_period_closures c where c.business_id=p_business_id
    and c.period_month>=date_trunc('month',p_correction_date)::date) then
    raise exception 'Accounting period is closed' using errcode='23514';
  end if;
  select m.id into v_latest_id from public.inventory_movements m
    where m.business_id=p_business_id and m.product_id=v_movement.product_id
    order by m.posting_order desc limit 1;
  select * into v_product from public.inventory_products p
    where p.id=v_movement.product_id and p.business_id=p_business_id for update;
  if v_latest_id<>v_movement.id or v_product.qty_milli<>v_movement.qty_after_milli
    or v_product.stock_value<>v_movement.value_after then
    raise exception 'Correct the latest product movement only' using errcode='23514';
  end if;
  if p_payload->>'kind'<>v_movement.event_kind
    or p_payload->>'productId'<>v_movement.product_id::text then
    raise exception 'Replacement must keep product and event kind' using errcode='23514';
  end if;
  v_before_qty:=v_movement.qty_after_milli-v_movement.qty_delta_milli;
  v_before_value:=v_movement.value_after-v_movement.value_delta;
  if v_before_qty not between 0 and 1000000000000
    or v_before_value not between 0 and 9007199254740991 then
    raise exception 'Original stock state cannot be restored' using errcode='23514';
  end if;
  insert into public.accounting_inventory_corrections
    (id,business_id,original_movement_id,reason,corrected_by)
    values(p_correction_id,p_business_id,p_original_movement_id,btrim(p_reason),(select auth.uid()));
  if v_movement.journal_id is not null then
    insert into public.accounting_corrections
      (id,business_id,original_journal_id,correction_date,reason,corrected_by)
      values(p_correction_id,p_business_id,v_movement.journal_id,p_correction_date,
        btrim(p_reason),(select auth.uid()));
    v_reversal_journal_id:=private.reverse_accounting_journal_for_correction(
      p_business_id,v_movement.journal_id,p_correction_id,p_correction_date);
  end if;
  update public.inventory_products set qty_milli=v_before_qty,stock_value=v_before_value
    where id=v_product.id;
  insert into public.inventory_movements(id,business_id,product_id,event_kind,event_date,
    qty_delta_milli,value_delta,qty_after_milli,value_after,journal_id,created_by)
    values(v_reversal_movement_id,p_business_id,v_product.id,'correction_reversal',p_correction_date,
      -v_movement.qty_delta_milli,-v_movement.value_delta,v_before_qty,v_before_value,
      v_reversal_journal_id,(select auth.uid()));
  v_payload:=p_payload||jsonb_build_object('date',p_correction_date::text);
  perform public.post_inventory_event(p_business_id,p_replacement_event_id,v_payload);
  select m.journal_id into v_replacement_journal_id from public.inventory_movements m
    where m.id=p_replacement_event_id and m.business_id=p_business_id;
  update public.accounting_inventory_corrections set reversal_movement_id=v_reversal_movement_id,
    replacement_movement_id=p_replacement_event_id where id=p_correction_id;
  if v_movement.journal_id is not null then
    update public.accounting_corrections set reversal_journal_id=v_reversal_journal_id,
      replacement_journal_id=v_replacement_journal_id where id=p_correction_id;
  end if;
  return p_replacement_event_id;
end; $$;
revoke all on function public.correct_cash_inventory_event(uuid,uuid,uuid,uuid,date,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.correct_cash_inventory_event(uuid,uuid,uuid,uuid,date,text,jsonb)
  to authenticated;
