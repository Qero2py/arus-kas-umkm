-- Run against the dedicated development project only. This transaction leaves no data behind.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  'a0000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'accounting-smoke@example.invalid', '', now(), now(), now()
);

insert into public.businesses (id, owner_id, name)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Smoke Test Business');

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $$
declare
  v_business uuid := 'b0000000-0000-4000-8000-000000000001';
  v_journal uuid;
  v_debit text;
  v_credit text;
  v_balance text;
begin
  if (select count(*) from public.accounting_accounts where business_id = v_business) <> 15 then
    raise exception 'Account template did not seed or is not visible to owner';
  end if;

  begin
    perform public.post_accounting_journal(
      v_business, current_date - 2, 'opening_balance', 'initial', 'Saldo pembuka salah',
      '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"4100","debit":0,"credit":100000}]'::jsonb
    );
    raise exception 'Revenue account was accepted in opening balances';
  exception when check_violation then
    null;
  end;
  if exists (select 1 from public.accounting_journals where business_id = v_business) then
    raise exception 'Rejected opening balance left a journal behind';
  end if;

  select public.post_accounting_journal(
    v_business, current_date - 2, 'opening_balance', 'initial', 'Saldo pembuka',
    '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"3100","debit":0,"credit":100000}]'::jsonb
  ) into v_journal;

  if (select count(*) from public.accounting_journal_lines where journal_id = v_journal) <> 2 then
    raise exception 'Posted journal lines are not visible to owner';
  end if;

  perform public.post_accounting_journal(
    v_business, current_date - 1, 'cash_sale', 'sale-1', 'Penjualan tunai uji',
    '[{"accountCode":"1010","debit":50000,"credit":0},{"accountCode":"4100","debit":0,"credit":50000}]'::jsonb
  );
  perform public.post_accounting_journal(
    v_business, current_date, 'cash_expense', 'expense-1', 'Beban tunai uji',
    '[{"accountCode":"6100","debit":20000,"credit":0},{"accountCode":"1010","debit":0,"credit":20000}]'::jsonb
  );

  select t.total_debit, t.total_credit, t.ending_debit
    into v_debit, v_credit, v_balance
  from public.get_accounting_trial_balance(v_business, current_date) t where t.code = '1010';
  if v_debit <> '150000' or v_credit <> '20000' or v_balance <> '130000' then
    raise exception 'Trial balance does not match posted cash journals';
  end if;
  select t.total_debit into v_debit
  from public.get_accounting_trial_balance(v_business, current_date - 2) t where t.code = '1010';
  if v_debit <> '100000' then
    raise exception 'As-of date does not filter future journal dates';
  end if;
  select l.running_balance into v_balance
  from public.get_accounting_ledger(v_business, '1010', current_date, 101, 0) l
  order by l.entry_date desc limit 1;
  if v_balance <> '130000' then
    raise exception 'Ledger running balance is incorrect';
  end if;
  if (select count(*) from public.get_accounting_ledger(v_business, '1010', current_date, 101, 0)) <> 3 then
    raise exception 'Ledger should show three cash movements';
  end if;

  begin
    perform public.post_accounting_journal(
      v_business, current_date, 'opening_balance', 'initial-2', 'Saldo pembuka ulang',
      '[{"accountCode":"1020","debit":1000,"credit":0},{"accountCode":"3100","debit":0,"credit":1000}]'::jsonb
    );
    raise exception 'Late opening journal was accepted';
  exception when check_violation then
    null;
  end;
  begin
    perform public.post_accounting_journal(
      v_business, current_date - 3, 'cash_sale', 'pre-opening', 'Transaksi terlalu lama',
      '[{"accountCode":"1010","debit":1000,"credit":0},{"accountCode":"4100","debit":0,"credit":1000}]'::jsonb
    );
    raise exception 'Pre-opening operational journal was accepted';
  exception when check_violation then
    null;
  end;

  begin
    perform public.post_accounting_journal(
      v_business, current_date, 'smoke', 'duplicate', 'Jurnal tidak seimbang',
      '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"3100","debit":0,"credit":99999}]'::jsonb
    );
    raise exception 'Unbalanced journal was accepted';
  exception when check_violation then
    null;
  end;

  if exists (select 1 from public.accounting_journals where business_id = v_business and source_id = 'duplicate') then
    raise exception 'Unbalanced journal left a header behind';
  end if;

  begin
    perform public.post_accounting_journal(
      v_business, current_date - 1, 'cash_sale', 'sale-1', 'Duplicate source',
      '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"3100","debit":0,"credit":100000}]'::jsonb
    );
    raise exception 'Duplicate journal was accepted';
  exception when unique_violation then
    null;
  end;

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
  begin
    perform public.get_accounting_trial_balance(v_business, current_date);
    raise exception 'Non-owner read trial balance';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.post_accounting_journal(
      v_business, current_date, 'smoke', 'wrong-owner', 'Unauthorized source',
      '[{"accountCode":"1010","debit":100000,"credit":0},{"accountCode":"3100","debit":0,"credit":100000}]'::jsonb
    );
    raise exception 'Non-owner posted a journal';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);

  begin
    insert into public.accounting_journals (business_id, entry_date, source_type, source_id, description, created_by)
    values (v_business, current_date, 'smoke', 'direct', 'Direct insert', 'a0000000-0000-4000-8000-000000000001');
    raise exception 'Direct journal insert was accepted';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'Accounting database smoke test passed';
end;
$$;

reset role;
delete from auth.users where id = 'a0000000-0000-4000-8000-000000000001';
set constraints all immediate;
do $$
begin
  if exists (select 1 from public.businesses where id = 'b0000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.accounting_journals where business_id = 'b0000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.accounting_journal_lines where business_id = 'b0000000-0000-4000-8000-000000000001') then
    raise exception 'Deleting an owner did not clean up accounting data';
  end if;
end;
$$;

rollback;
