import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowDownLeft, ArrowUpRight, Equal } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { cashFlowLabel } from "@/lib/cash-flow";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import { loadCashFlowReport } from "@/lib/supabase/cash-flow";
import { todayInJakarta } from "@/lib/supabase/workspace";

type Filters = Promise<{ start?: string | string[]; end?: string | string[] }>;

export default function CashFlowPage({ searchParams }: { searchParams: Filters }) {
  return <Suspense fallback={<p role="status">Menghitung arus kas…</p>}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: Filters }) {
  await connection();
  const params = await searchParams;
  const today = todayInJakarta();
  const start = typeof params.start === "string" ? params.start : `${today.slice(0, 7)}-01`;
  const end = typeof params.end === "string" ? params.end : today;
  const result = await loadCashFlowReport(start, end);
  return <>
    <PageHeading eyebrow="Laporan · Arus kas aktual" title="Laporan arus kas" description="Uang yang benar-benar masuk dan keluar dari kas, bank, atau dompet digital. Transfer antar akun sendiri dipisahkan agar tidak terlihat sebagai pendapatan atau biaya." />
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 text-sm">
      <label>Mulai<input type="date" name="start" defaultValue={start} max={today} required className="mt-1 block h-11 rounded-lg border border-border bg-background px-3" /></label>
      <label>Sampai<input type="date" name="end" defaultValue={end} max={today} required className="mt-1 block h-11 rounded-lg border border-border bg-background px-3" /></label>
      <button type="submit" className="h-11 rounded-lg bg-primary px-5 font-semibold text-primary-foreground">Tampilkan</button>
    </form>
    {!result.ok ? <p role="alert" className="rounded-xl border border-border bg-card p-5 text-sm">{result.message}</p> : <>
      <div className="mb-5 flex flex-wrap gap-3">
        <a href={`/accounting/cash-flow/export/pdf?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-primary hover:border-primary">Unduh PDF</a>
        <a href={`/accounting/cash-flow/export/xlsx?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-primary hover:border-primary">Unduh Excel</a>
      </div>
      <div className="mb-6 rounded-2xl border border-border bg-gradient-to-br from-[#edf5eb] to-[#fffaf0] p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{result.businessName} · {formatDemoDate(start)}–{formatDemoDate(end)}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Saldo awal periode</p><p className="mt-2 text-xl font-bold tabular-nums">{formatRupiah(result.report.opening)}</p></div>
          <div className="balance-rise rounded-xl bg-card p-4 shadow-sm"><p className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowDownLeft size={14} />Uang masuk</p><p className="mt-2 text-xl font-bold tabular-nums text-primary">{formatRupiah(result.report.incoming)}</p></div>
          <div className="balance-rise rounded-xl bg-card p-4 shadow-sm"><p className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpRight size={14} />Uang keluar</p><p className="mt-2 text-xl font-bold tabular-nums">{formatRupiah(result.report.outgoing)}</p></div>
          <div className="rounded-xl border border-primary/20 bg-primary p-4 text-primary-foreground shadow-sm"><p className="flex items-center gap-1 text-xs"><Equal size={14} />Saldo akhir periode</p><p className="mt-2 text-xl font-bold tabular-nums">{formatRupiah(result.report.closing)}</p></div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Saldo akhir dicocokkan dengan seluruh akun kas pada neraca saldo. Transfer internal {formatRupiah(result.report.transfers)} tidak menambah total kas.</p>
      </div>
      <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border p-5"><h2 className="text-lg font-semibold">Rincian menurut sumber</h2><p className="mt-1 text-xs text-muted-foreground">Dari jurnal yang telah dibukukan pada periode pilihan.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Sumber transaksi</th><th className="px-4 py-3 text-right">Masuk</th><th className="px-4 py-3 text-right">Keluar</th></tr></thead><tbody className="divide-y divide-border/70">{result.report.groups.map((group) => <tr key={group.source}><th scope="row" className="px-4 py-3 text-left font-medium">{cashFlowLabel(group.source)}</th><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(group.incoming)}</td><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(group.outgoing)}</td></tr>)}</tbody></table></div>
      </section>
    </>}
  </>;
}
