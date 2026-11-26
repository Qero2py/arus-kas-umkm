-- Keep the original source journal and record each effective revision separately.
alter table public.accounting_credit_documents add column effective_journal_id uuid;
alter table public.accounting_credit_payments add column effective_journal_id uuid;
alter table public.accounting_credit_documents add constraint accounting_credit_documents_effective_journal_fkey
  foreign key(effective_journal_id,business_id) references public.accounting_journals(id,business_id)
  on delete no action deferrable initially deferred;
alter table public.accounting_credit_payments add constraint accounting_credit_payments_effective_journal_fkey
  foreign key(effective_journal_id,business_id) references public.accounting_journals(id,business_id)
  on delete no action deferrable initially deferred;
alter table public.accounting_credit_payments add constraint accounting_credit_payments_id_business_key
  unique(id,business_id);

create table public.accounting_credit_document_revisions(
  correction_id uuid primary key references public.accounting_corrections(id) on delete cascade,
  business_id uuid not null,
  document_id uuid not null,
  old_amount bigint not null,
  new_amount bigint not null,
  old_due_date date not null,
  new_due_date date not null,
  old_description text not null,
  new_description text not null,
  foreign key(document_id,business_id) references public.accounting_credit_documents(id,business_id)
    on delete no action deferrable initially deferred
);
create table public.accounting_credit_payment_revisions(
  correction_id uuid primary key references public.accounting_corrections(id) on delete cascade,
  business_id uuid not null,
  payment_id uuid not null,
  old_amount bigint not null,
  new_amount bigint not null,
  old_paid_date date not null,
  new_paid_date date not null,
  old_cash_account_id uuid not null,
  new_cash_account_id uuid not null,
  foreign key(payment_id,business_id) references public.accounting_credit_payments(id,business_id)
    on delete no action deferrable initially deferred
);
alter table public.accounting_credit_document_revisions enable row level security;
alter table public.accounting_credit_payment_revisions enable row level security;
revoke all on public.accounting_credit_document_revisions,public.accounting_credit_payment_revisions
  from public,anon,authenticated;
grant select on public.accounting_credit_document_revisions,public.accounting_credit_payment_revisions
  to authenticated;
create policy "Owner reads credit document revisions" on public.accounting_credit_document_revisions
for select to authenticated using(exists(select 1 from public.businesses b
  where b.id=business_id and b.owner_id=(select auth.uid())));
create policy "Owner reads credit payment revisions" on public.accounting_credit_payment_revisions
for select to authenticated using(exists(select 1 from public.businesses b
  where b.id=business_id and b.owner_id=(select auth.uid())));

create function private.reverse_accounting_journal_for_correction(
  p_business_id uuid,p_original_journal_id uuid,p_correction_id uuid,p_date date
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_original public.accounting_journals%rowtype; v_reversal uuid;
begin
  select * into v_original from public.accounting_journals j
    where j.id=p_original_journal_id and j.business_id=p_business_id;
  if not found or not exists(select 1 from public.accounting_corrections c
    where c.id=p_correction_id and c.business_id=p_business_id
      and c.original_journal_id=p_original_journal_id and c.correction_date=p_date) then
    raise exception 'Correction audit does not match journal' using errcode='23514';
  end if;
  insert into public.accounting_journals(business_id,entry_date,source_type,source_id,description,created_by)
    values(p_business_id,p_date,'correction_reversal',p_correction_id::text,
      'Pembalik: '||left(v_original.description,240),(select auth.uid())) returning id into v_reversal;
  insert into public.accounting_journal_lines(business_id,journal_id,account_id,line_no,debit,credit)
    select p_business_id,v_reversal,l.account_id,l.line_no,l.credit,l.debit
    from public.accounting_journal_lines l where l.journal_id=p_original_journal_id;
  return v_reversal;
end; $$;
revoke all on function private.reverse_accounting_journal_for_correction(uuid,uuid,uuid,date)
  from public,anon,authenticated;

create function private.require_accounting_credit_correction_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.source_type not in ('credit_document_correction','credit_payment_correction') then return null; end if;
  if not exists(select 1 from public.accounting_corrections c where c.id::text=new.source_id
    and c.business_id=new.business_id and c.replacement_journal_id=new.id) then
    raise exception 'Credit correction journal needs matching audit' using errcode='23514';
  end if;
  if new.source_type='credit_document_correction' and not exists(
    select 1 from public.accounting_credit_document_revisions r
    join public.accounting_credit_documents d on d.id=r.document_id and d.business_id=r.business_id
    where r.correction_id::text=new.source_id and r.business_id=new.business_id
      and d.effective_journal_id=new.id) then
    raise exception 'Credit document correction needs matching revision' using errcode='23514';
  end if;
  if new.source_type='credit_payment_correction' and not exists(
    select 1 from public.accounting_credit_payment_revisions r
    join public.accounting_credit_payments p on p.id=r.payment_id and p.business_id=r.business_id
    where r.correction_id::text=new.source_id and r.business_id=new.business_id
      and p.effective_journal_id=new.id) then
    raise exception 'Credit payment correction needs matching revision' using errcode='23514';
  end if;
  return null;
end; $$;
create constraint trigger require_accounting_credit_correction_source_after_insert
after insert on public.accounting_journals deferrable initially deferred for each row
execute function private.require_accounting_credit_correction_source();
revoke all on function private.require_accounting_credit_correction_source() from public,anon,authenticated;

create function public.correct_accounting_credit_document(
  p_business_id uuid,p_correction_id uuid,p_document_id uuid,p_correction_date date,
  p_reason text,p_amount bigint,p_due_date date,p_description text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_document public.accounting_credit_documents%rowtype;
  v_recognition_code text; v_recognition_role text; v_control_code text;
  v_paid numeric; v_original_journal uuid; v_reversal uuid; v_replacement uuid; v_lines jsonb;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=(select auth.uid())) then
    raise exception 'Only owner may correct credit documents' using errcode='42501';
  end if;
  select * into v_document from public.accounting_credit_documents d
    where d.id=p_document_id and d.business_id=p_business_id for update;
  if not found then raise exception 'Credit document missing' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,17));
  if p_correction_id is null or p_correction_date is null
    or p_correction_date<v_document.issue_date
    or p_correction_date>(now() at time zone 'Asia/Jakarta')::date
    or date_trunc('month',p_correction_date)<>date_trunc('month',v_document.issue_date)
    or p_amount is null or p_amount not between 1 and 9007199254740991
    or p_due_date is null or p_due_date<v_document.issue_date
    or length(btrim(coalesce(p_description,''))) not between 1 and 250
    or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception 'Invalid credit document correction' using errcode='22023';
  end if;
  if exists(select 1 from public.accounting_period_closures c where c.business_id=p_business_id
    and c.period_month>=date_trunc('month',p_correction_date)::date) then
    raise exception 'Accounting period is closed' using errcode='23514';
  end if;
  if exists(select 1 from public.inventory_movements m where m.credit_document_id=p_document_id)
    or exists(select 1 from public.accounting_fixed_assets a where a.credit_document_id=p_document_id) then
    raise exception 'Stock and asset documents need a domain-specific correction' using errcode='23514';
  end if;
  select a.code,a.role into v_recognition_code,v_recognition_role from public.accounting_accounts a
    where a.id=v_document.recognition_account_id and a.business_id=p_business_id and a.active;
  select a.code into v_control_code from public.accounting_accounts a
    where a.id=v_document.control_account_id and a.business_id=p_business_id and a.active;
  if v_recognition_code is null or v_control_code is null
    or (v_document.kind='sale' and v_recognition_role<>'revenue')
    or (v_document.kind='purchase' and v_recognition_role<>'expense') then
    raise exception 'Only ordinary revenue or expense documents can be corrected here' using errcode='23514';
  end if;
  select coalesce(sum(p.amount),0) into v_paid from public.accounting_credit_payments p
    where p.business_id=p_business_id and p.document_id=p_document_id;
  if p_amount<v_paid then raise exception 'New document amount is below payments' using errcode='23514'; end if;
  v_original_journal:=coalesce(v_document.effective_journal_id,v_document.journal_id);
  insert into public.accounting_corrections(id,business_id,original_journal_id,correction_date,reason,corrected_by)
    values(p_correction_id,p_business_id,v_original_journal,p_correction_date,btrim(p_reason),(select auth.uid()));
  v_reversal:=private.reverse_accounting_journal_for_correction(
    p_business_id,v_original_journal,p_correction_id,p_correction_date);
  v_lines:=case when v_document.kind='sale' then jsonb_build_array(
    jsonb_build_object('accountCode',v_control_code,'debit',p_amount,'credit',0),
    jsonb_build_object('accountCode',v_recognition_code,'debit',0,'credit',p_amount)) else jsonb_build_array(
    jsonb_build_object('accountCode',v_recognition_code,'debit',p_amount,'credit',0),
    jsonb_build_object('accountCode',v_control_code,'debit',0,'credit',p_amount)) end;
  v_replacement:=public.post_accounting_journal(p_business_id,p_correction_date,
    'credit_document_correction',p_correction_id::text,btrim(p_description),v_lines);
  update public.accounting_credit_documents set amount=p_amount,due_date=p_due_date,
    description=btrim(p_description),effective_journal_id=v_replacement where id=p_document_id;
  insert into public.accounting_credit_document_revisions
    (correction_id,business_id,document_id,old_amount,new_amount,old_due_date,new_due_date,
      old_description,new_description)
    values(p_correction_id,p_business_id,p_document_id,v_document.amount,p_amount,
      v_document.due_date,p_due_date,v_document.description,btrim(p_description));
  update public.accounting_corrections set reversal_journal_id=v_reversal,
    replacement_journal_id=v_replacement where id=p_correction_id;
  return v_replacement;
end; $$;
revoke all on function public.correct_accounting_credit_document(uuid,uuid,uuid,date,text,bigint,date,text)
  from public,anon,authenticated;
grant execute on function public.correct_accounting_credit_document(uuid,uuid,uuid,date,text,bigint,date,text)
  to authenticated;

create function public.correct_accounting_credit_payment(
  p_business_id uuid,p_correction_id uuid,p_payment_id uuid,p_correction_date date,
  p_reason text,p_amount bigint,p_cash_account_code text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_payment public.accounting_credit_payments%rowtype;
  v_document public.accounting_credit_documents%rowtype;
  v_cash_id uuid; v_control_code text; v_paid numeric;
  v_original_journal uuid; v_reversal uuid; v_replacement uuid; v_lines jsonb;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=(select auth.uid())) then
    raise exception 'Only owner may correct credit payments' using errcode='42501';
  end if;
  select d.* into v_document from public.accounting_credit_documents d
    join public.accounting_credit_payments p on p.document_id=d.id and p.business_id=d.business_id
    where p.id=p_payment_id and p.business_id=p_business_id for update of d;
  if not found then raise exception 'Credit payment missing' using errcode='23514'; end if;
  select * into v_payment from public.accounting_credit_payments p
    where p.id=p_payment_id and p.business_id=p_business_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,17));
  if p_correction_id is null or p_correction_date is null
    or p_correction_date<v_payment.paid_date or p_correction_date<v_document.issue_date
    or p_correction_date>(now() at time zone 'Asia/Jakarta')::date
    or date_trunc('month',p_correction_date)<>date_trunc('month',v_payment.paid_date)
    or length(btrim(coalesce(p_reason,''))) not between 10 and 500
    or p_amount is null or p_amount not between 1 and 9007199254740991 then
    raise exception 'Invalid credit payment correction' using errcode='22023';
  end if;
  if exists(select 1 from public.accounting_period_closures c where c.business_id=p_business_id
    and c.period_month>=date_trunc('month',p_correction_date)::date) then
    raise exception 'Accounting period is closed' using errcode='23514';
  end if;
  select a.id into v_cash_id from public.accounting_accounts a
    where a.business_id=p_business_id and a.code=p_cash_account_code and a.role='cash' and a.active;
  select a.code into v_control_code from public.accounting_accounts a
    where a.id=v_document.control_account_id and a.business_id=p_business_id and a.active;
  if v_cash_id is null or v_control_code is null then
    raise exception 'Cash or control account is inactive' using errcode='23514';
  end if;
  select coalesce(sum(p.amount),0) into v_paid from public.accounting_credit_payments p
    where p.business_id=p_business_id and p.document_id=v_document.id;
  if v_paid-v_payment.amount+p_amount>v_document.amount then
    raise exception 'Payment correction exceeds document amount' using errcode='23514';
  end if;
  v_original_journal:=coalesce(v_payment.effective_journal_id,v_payment.journal_id);
  insert into public.accounting_corrections(id,business_id,original_journal_id,correction_date,reason,corrected_by)
    values(p_correction_id,p_business_id,v_original_journal,p_correction_date,btrim(p_reason),(select auth.uid()));
  v_reversal:=private.reverse_accounting_journal_for_correction(
    p_business_id,v_original_journal,p_correction_id,p_correction_date);
  v_lines:=case when v_document.kind='sale' then jsonb_build_array(
    jsonb_build_object('accountCode',p_cash_account_code,'debit',p_amount,'credit',0),
    jsonb_build_object('accountCode',v_control_code,'debit',0,'credit',p_amount)) else jsonb_build_array(
    jsonb_build_object('accountCode',v_control_code,'debit',p_amount,'credit',0),
    jsonb_build_object('accountCode',p_cash_account_code,'debit',0,'credit',p_amount)) end;
  v_replacement:=public.post_accounting_journal(p_business_id,p_correction_date,
    'credit_payment_correction',p_correction_id::text,
    case when v_document.kind='sale' then 'Koreksi penerimaan piutang ' else 'Koreksi pembayaran utang ' end
      ||v_document.document_no,v_lines);
  update public.accounting_credit_payments set amount=p_amount,paid_date=p_correction_date,
    cash_account_id=v_cash_id,effective_journal_id=v_replacement where id=p_payment_id;
  insert into public.accounting_credit_payment_revisions
    (correction_id,business_id,payment_id,old_amount,new_amount,old_paid_date,new_paid_date,
      old_cash_account_id,new_cash_account_id)
    values(p_correction_id,p_business_id,p_payment_id,v_payment.amount,p_amount,
      v_payment.paid_date,p_correction_date,v_payment.cash_account_id,v_cash_id);
  update public.accounting_corrections set reversal_journal_id=v_reversal,
    replacement_journal_id=v_replacement where id=p_correction_id;
  return v_replacement;
end; $$;
revoke all on function public.correct_accounting_credit_payment(uuid,uuid,uuid,date,text,bigint,text)
  from public,anon,authenticated;
grant execute on function public.correct_accounting_credit_payment(uuid,uuid,uuid,date,text,bigint,text)
  to authenticated;
