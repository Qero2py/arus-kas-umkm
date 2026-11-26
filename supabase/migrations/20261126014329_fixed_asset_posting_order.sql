-- Once a month is booked, acquisitions from an earlier completed month cannot
-- be inserted later and silently change prior asset reports.
create function private.guard_fixed_asset_acquisition_order()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_last date;
  v_current date := date_trunc('month',now() at time zone 'Asia/Jakarta')::date;
  v_earliest date;
begin
  if new.source_kind = 'opening' then return new; end if;
  select b.last_depreciated_month into v_last
    from public.accounting_fixed_asset_books b where b.business_id = new.business_id;
  if v_last is null then return new; end if;
  v_earliest := case when v_last = v_current then v_last
    else (v_last + interval '1 month')::date end;
  if new.acquired_on < v_earliest then
    raise exception 'Asset acquisition predates a completed depreciation month' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger guard_fixed_asset_acquisition_order_before_insert
before insert on public.accounting_fixed_assets
for each row execute function private.guard_fixed_asset_acquisition_order();
revoke all on function private.guard_fixed_asset_acquisition_order() from public,anon,authenticated;
