-- Publish changes so an open business workspace refreshes after another account writes.
-- Existing table grants and RLS policies still determine who receives each event.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'businesses', 'transactions', 'obligations', 'business_members', 'business_invites'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
