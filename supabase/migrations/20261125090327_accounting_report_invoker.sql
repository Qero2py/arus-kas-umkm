-- Read-only reports already have owner checks and read through owner-scoped RLS.
-- Invoker rights avoid giving report callers database-owner privileges.
alter function public.get_accounting_trial_balance(uuid, date) security invoker;
alter function public.get_accounting_ledger(uuid, text, date, integer, integer) security invoker;
alter function public.get_accounting_credit_documents(uuid, integer, integer) security invoker;
