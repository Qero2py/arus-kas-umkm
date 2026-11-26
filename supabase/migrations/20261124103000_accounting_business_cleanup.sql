-- Business deletion must remove its ledger, while direct deletion of a used
-- account or journal remains blocked at transaction commit.
alter table public.accounting_journal_lines
  add constraint accounting_journal_lines_business_id_fkey
  foreign key (business_id) references public.businesses (id) on delete cascade;

alter table public.accounting_journal_lines
  drop constraint accounting_journal_lines_journal_id_business_id_fkey,
  add constraint accounting_journal_lines_journal_id_business_id_fkey
    foreign key (journal_id, business_id)
    references public.accounting_journals (id, business_id)
    on delete no action deferrable initially deferred;

alter table public.accounting_journal_lines
  drop constraint accounting_journal_lines_account_id_business_id_fkey,
  add constraint accounting_journal_lines_account_id_business_id_fkey
    foreign key (account_id, business_id)
    references public.accounting_accounts (id, business_id)
    on delete no action deferrable initially deferred;
