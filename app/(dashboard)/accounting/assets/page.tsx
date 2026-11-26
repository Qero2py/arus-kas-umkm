import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { FixedAssetsView } from "@/components/fixed-assets-view";
import { FixedAssetCorrectionView } from "@/components/fixed-asset-correction-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadFixedAssets } from "@/lib/supabase/fixed-assets";
import { todayInJakarta } from "@/lib/supabase/workspace";

type Filters = Promise<{ page?: string | string[] }>;

export default function FixedAssetsPage({ searchParams }: { searchParams: Filters }) {
  return <Suspense fallback={<p role="status">Memuat aset tetap…</p>}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: Filters }) {
  await connection();
  if (!isSupabaseConfigured()) return <p role="status">Aset tetap tersedia setelah masuk ke usaha yang terhubung.</p>;
  const filters = await searchParams;
  const page = filters.page === undefined ? 1 : Number(filters.page);
  const result = await loadFixedAssets(page);
  if (!result.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  return <>
    <FixedAssetsView {...result} today={todayInJakarta()} />
    <FixedAssetCorrectionView assets={result.assets} accounts={result.accounts} today={todayInJakarta()} />
    {(result.page > 1 || result.hasMore) && <div className="mt-5 flex justify-between text-sm">
      {result.page > 1 ? <Link href={`/accounting/assets?page=${result.page - 1}`} className="font-semibold text-primary underline">Sebelumnya</Link> : <span />}
      {result.hasMore && <Link href={`/accounting/assets?page=${result.page + 1}`} className="font-semibold text-primary underline">Berikutnya</Link>}
    </div>}
  </>;
}
