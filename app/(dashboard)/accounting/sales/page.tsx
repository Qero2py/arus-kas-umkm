import { connection } from "next/server";
import { Suspense } from "react";
import { BarChart3, CircleHelp } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import { formatQuantity } from "@/lib/inventory";
import { loadSalesAnalytics } from "@/lib/supabase/sales-analytics";
import { todayInJakarta } from "@/lib/supabase/workspace";

type Filters = Promise<{ start?: string | string[]; end?: string | string[] }>;

export default function SalesAnalyticsPage({ searchParams }: { searchParams: Filters }) {
  return <Suspense fallback={<p role="status">Menghitung penjualan…</p>}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: Filters }) {
  await connection();
  const params = await searchParams;
  const today = todayInJakarta();
  const start = typeof params.start === "string" ? params.start : `${today.slice(0, 7)}-01`;
  const end = typeof params.end === "string" ? params.end : today;
  const result = await loadSalesAnalytics(start, end);
  return <>
    <PageHeading eyebrow="Laporan · Analisis penjualan" title="Apa yang paling laku?"
      description="Lihat penjualan barang per produk dan tagihan tempo per pelanggan pada periode pilihan. Jumlah dan nilai berasal dari dokumen serta jurnal yang telah dibukukan." />
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 text-sm">
      <label>Mulai<input type="date" name="start" defaultValue={start} max={today} required className="mt-1 block h-11 rounded-lg border border-border bg-background px-3" /></label>
      <label>Sampai<input type="date" name="end" defaultValue={end} max={today} required className="mt-1 block h-11 rounded-lg border border-border bg-background px-3" /></label>
      <button type="submit" className="h-11 rounded-lg bg-primary px-5 font-semibold text-primary-foreground">Tampilkan</button>
    </form>
    {!result.ok ? <p role="alert" className="rounded-xl border border-border bg-card p-5 text-sm">{result.message}</p> : <>
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#d3dfd1] bg-gradient-to-r from-[#eef5e9] to-[#fffaf0] p-5"><BarChart3 size={25} className="text-primary" aria-hidden="true" /><div><p className="text-sm font-semibold">{result.businessName}</p><p className="text-xs text-muted-foreground">{formatDemoDate(start)}–{formatDemoDate(end)} · diurutkan berdasarkan nilai penjualan</p></div></div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border p-5"><h2 className="font-semibold">Per produk</h2><p className="mt-1 text-xs text-muted-foreground">Barang stok yang memiliki mutasi penjualan.</p></div>
          {result.products.length ? <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm"><thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Produk</th><th className="px-4 py-3 text-right">Terjual</th><th className="px-4 py-3 text-right">Penjualan</th><th className="px-4 py-3 text-right">Laba kotor</th></tr></thead><tbody className="divide-y divide-border/70">{result.products.map((product) => <tr key={product.id}><th scope="row" className="px-4 py-3 text-left"><span className="font-semibold">{product.name}</span><span className="block text-xs text-muted-foreground">{product.sku}</span></th><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(product.quantityMilli)} {product.unit}</td><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(product.revenue)}</td><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(product.revenue - product.cogs)}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada penjualan barang stok pada periode ini.</p>}</section>
        <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border p-5"><h2 className="font-semibold">Per pelanggan</h2><p className="mt-1 text-xs text-muted-foreground">Penjualan tempo yang memiliki kontak pelanggan.</p></div>
          {result.customers.length ? <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-sm"><thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Pelanggan</th><th className="px-4 py-3 text-right">Dokumen</th><th className="px-4 py-3 text-right">Penjualan</th></tr></thead><tbody className="divide-y divide-border/70">{result.customers.map((customer) => <tr key={customer.id}><th scope="row" className="px-4 py-3 text-left font-semibold">{customer.name}</th><td className="px-4 py-3 text-right tabular-nums">{customer.documentCount}</td><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(customer.revenue)}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada penjualan tempo pada periode ini.</p>}</section>
      </div>
      <p className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground"><CircleHelp size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Penjualan tunai tanpa produk tidak muncul pada tabel produk. Penjualan tunai tanpa kontak tidak muncul pada tabel pelanggan. Gunakan laporan laba rugi untuk melihat seluruh pendapatan usaha.</p>
    </>}
  </>;
}
