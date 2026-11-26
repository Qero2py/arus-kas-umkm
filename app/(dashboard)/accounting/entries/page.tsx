import { listAccountingAccounts } from "@/app/actions/accounting";
import { AccountingEntryView } from "@/components/accounting-entry-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { todayInJakarta } from "@/lib/supabase/workspace";

export default async function AccountingEntriesPage() {
  if (!isSupabaseConfigured())
    return <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm">Pembukuan tersedia setelah masuk ke usaha yang terhubung.</p>;
  const accounts = await listAccountingAccounts();
  if (!accounts.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{accounts.message}</p>;
  return <AccountingEntryView accounts={accounts.accounts} today={todayInJakarta()} role={accounts.role} />;
}
