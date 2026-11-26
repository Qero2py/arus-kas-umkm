import { listAccountingAccounts } from "@/app/actions/accounting";
import { AccountingAccountsView } from "@/components/accounting-accounts-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AccountingAccountsPage() {
  if (!isSupabaseConfigured()) {
    return <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm">Daftar akun tersedia setelah masuk ke usaha yang terhubung.</p>;
  }
  const result = await listAccountingAccounts();
  if (!result.ok) {
    return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  }
  return <AccountingAccountsView accounts={result.accounts} />;
}
