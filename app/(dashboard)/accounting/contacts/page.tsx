import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountingContactsView } from "@/components/accounting-contacts-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadAccountingContacts } from "@/lib/supabase/accounting-credit";

type Filters = Promise<{ page?: string | string[] }>;

export default function AccountingContactsPage({ searchParams }: { searchParams: Filters }) {
  return <Suspense fallback={<p role="status">Memuat kontak…</p>}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: Filters }) {
  await connection();
  if (!isSupabaseConfigured()) return <p role="status">Kontak tersedia setelah masuk ke usaha yang terhubung.</p>;
  const filters = await searchParams;
  const page = filters.page === undefined ? 1 : Number(filters.page);
  const result = await loadAccountingContacts(page);
  if (!result.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  return <>
    <AccountingContactsView contacts={result.contacts} businessName={result.businessName} />
    {(result.page > 1 || result.hasMore) && <div className="mt-5 flex justify-between text-sm">
      {result.page > 1 ? <Link href={`/accounting/contacts?page=${result.page - 1}`} className="font-semibold text-primary underline">Sebelumnya</Link> : <span />}
      {result.hasMore && <Link href={`/accounting/contacts?page=${result.page + 1}`} className="font-semibold text-primary underline">Berikutnya</Link>}
    </div>}
  </>;
}
