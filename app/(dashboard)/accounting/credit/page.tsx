import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountingCreditView } from "@/components/accounting-credit-view";
import { AccountingCreditCorrections } from "@/components/accounting-credit-corrections";
import { AgingSummary } from "@/components/aging-summary";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadAccountingCredit } from "@/lib/supabase/accounting-credit";
import { todayInJakarta } from "@/lib/supabase/workspace";

type Filters = Promise<{ page?: string | string[] }>;

export default function AccountingCreditPage({ searchParams }: { searchParams: Filters }) {
  return <Suspense fallback={<p role="status">Memuat dokumen tempo…</p>}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: Filters }) {
  await connection();
  if (!isSupabaseConfigured()) return <p role="status">Dokumen tempo tersedia setelah masuk ke usaha yang terhubung.</p>;
  const filters = await searchParams;
  const page = filters.page === undefined ? 1 : Number(filters.page);
  const result = await loadAccountingCredit(page);
  if (!result.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  return <>
    <AgingSummary />
    <AccountingCreditView documents={result.documents} accounts={result.accounts}
      businessName={result.businessName} inventoryActive={result.inventoryActive}
      assetActive={result.assetActive} today={todayInJakarta()} />
    <AccountingCreditCorrections documents={result.documents} payments={result.payments}
      accounts={result.accounts} today={todayInJakarta()} />
    {(result.page > 1 || result.hasMore) && <div className="mt-5 flex justify-between text-sm">
      {result.page > 1 ? <Link href={`/accounting/credit?page=${result.page - 1}`} className="font-semibold text-primary underline">Sebelumnya</Link> : <span />}
      {result.hasMore && <Link href={`/accounting/credit?page=${result.page + 1}`} className="font-semibold text-primary underline">Berikutnya</Link>}
    </div>}
  </>;
}
