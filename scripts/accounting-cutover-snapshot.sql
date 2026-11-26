-- Read-only production snapshot for the proposed 1 December 2026 accounting cutover.
-- Before 1 December, through_date is today in Jakarta and all values are provisional.
-- Run with an explicit production project ref; never use these amounts as a final
-- opening journal without cash/bank, stock, asset, and liability verification.
begin read only;
with cutoff as (
  select least(date '2026-11-30',(now() at time zone 'Asia/Jakarta')::date) as through_date
)
select b.id as business_id,b.name as business_name,c.through_date,
  b.opening_balance::text as old_cash_opening,
  coalesce(t.cash_in,0)::text as cash_in,
  coalesce(t.cash_out,0)::text as cash_out,
  (b.opening_balance+coalesce(t.cash_in,0)-coalesce(t.cash_out,0))::text as old_book_cash,
  coalesce(t.entry_count,0) as cash_entry_count,
  coalesce(o.receivable,0)::text as outstanding_receivable,
  coalesce(o.payable,0)::text as outstanding_payable,
  coalesce(o.open_details,'[]'::jsonb) as open_obligations
from public.businesses b cross join cutoff c
left join lateral (
  select count(*) as entry_count,
    sum(amount) filter (where type='in') as cash_in,
    sum(amount) filter (where type='out') as cash_out
  from public.transactions t
  where t.business_id=b.id and t.entry_date<=c.through_date
) t on true
left join lateral (
  select sum(d.remaining) filter (where d.kind='piutang') as receivable,
    sum(d.remaining) filter (where d.kind='utang') as payable,
    jsonb_agg(jsonb_build_object(
      'legacyId',d.id,'kind',d.kind,'party',d.party,'description',d.description,
      'obligationDate',d.obligation_date,
      'dueDate',d.due_date,'amount',d.amount::text,'paid',d.paid::text,
      'outstanding',d.remaining::text
    ) order by d.kind,d.due_date,d.id) filter (where d.remaining>0) as open_details
  from (
    select ob.id,ob.kind,ob.party,ob.description,ob.obligation_date,ob.due_date,ob.amount,
      coalesce(p.paid,0) as paid,
      greatest(ob.amount-coalesce(p.paid,0),0) as remaining
    from public.obligations ob
    left join lateral (
      select sum(pay.amount) as paid from public.transactions pay
      where pay.obligation_id=ob.id and pay.entry_date<=c.through_date
    ) p on true
    where ob.business_id=b.id and ob.obligation_date<=c.through_date
  ) d
) o on true
order by b.created_at,b.id;
