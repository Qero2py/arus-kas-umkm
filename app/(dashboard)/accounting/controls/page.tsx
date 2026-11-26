import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { AccountingControlsView } from "@/components/accounting-controls-view";
import { loadAccountingControls } from "@/lib/supabase/accounting-controls";

export default async function AccountingControlsPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const params = await searchParams;
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const result = await loadAccountingControls(page);
  if (!result.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  return <>
    <PageHeading eyebrow={`Akuntansi · ${result.businessName}`} title="Tutup buku & koreksi"
      description="Tutup bulan yang sudah selesai setelah memeriksa jurnal. Koreksi transaksi kas umum mempertahankan catatan lama dan membukukan pembalik serta pengganti." />
    <AccountingControlsView {...result} />
    <div className="mt-5 flex justify-between text-sm">
      {page > 1 ? <Link href={`/accounting/controls?page=${page - 1}`} className="font-medium text-primary underline">Transaksi sebelumnya</Link> : <span />}
      {result.hasMore ? <Link href={`/accounting/controls?page=${page + 1}`} className="font-medium text-primary underline">Transaksi berikutnya</Link> : <span />}
    </div>
  </>;
}
