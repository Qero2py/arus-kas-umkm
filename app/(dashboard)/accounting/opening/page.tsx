import { listAccountingAccounts } from "@/app/actions/accounting";
import { AccountingOpeningView } from "@/components/accounting-opening-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

export default async function AccountingOpeningPage() {
  if (!isSupabaseConfigured())
    return <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm">Saldo pembuka tersedia setelah masuk ke usaha yang terhubung.</p>;
  const accounts = await listAccountingAccounts();
  if (!accounts.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{accounts.message}</p>;
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">Hanya pemilik yang dapat membuka saldo pembuka.</p>;
  const { data, error } = await context.supabase.from("accounting_journals")
    .select("source_type, entry_date").eq("business_id", context.business.id)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">Status saldo pembuka belum dapat dimuat.</p>;
  return <AccountingOpeningView accounts={accounts.accounts} today={todayInJakarta()}
    locked={Boolean(data)} openingDate={data?.source_type === "opening_balance" ? data.entry_date : null} />;
}
