import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import { ownerContext } from "@/lib/supabase/workspace";

export default async function LegacyArchivePage() {
  const context = await ownerContext();
  if (context.status !== "ok") return <p role="alert">Masuk ke akun usaha untuk melihat arsip.</p>;
  const [cash, obligations] = await Promise.all([
    context.supabase.from("transactions").select("id,entry_date,title,category,type,amount,method").eq("business_id", context.business.id).order("entry_date", { ascending: false }).limit(1000),
    context.supabase.from("obligations").select("id,kind,party,description,obligation_date,due_date,amount").eq("business_id", context.business.id).order("due_date", { ascending: false }).limit(1000),
  ]);
  if (cash.error || obligations.error) return <p role="alert">Arsip belum dapat dimuat. Coba lagi setelah memeriksa koneksi.</p>;
  return <>
    <PageHeading eyebrow="Arsip · sistem kas terdahulu" title="Catatan kas lama" description="Catatan ini dipertahankan untuk penelusuran sejarah. Saldo pembuka akuntansi merangkum posisi awal; transaksi baru dan laporan keuangan menggunakan jurnal." />
    <div className="mb-6 flex flex-wrap gap-3 text-sm"><Link href="/transactions" className="font-semibold text-primary underline">Buku kas dari jurnal</Link>{context.role === "owner" && <Link href="/accounting/credit" className="font-semibold text-primary underline">Tagihan saat ini</Link>}</div>
    <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border p-4"><h2 className="font-semibold">Transaksi lama</h2><p className="mt-1 text-xs text-muted-foreground">Ditampilkan paling banyak 1.000 catatan terakhir.</p></div>
      {(cash.data ?? []).length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Catatan</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3 text-right">Nominal</th></tr></thead><tbody className="divide-y divide-border/70">{(cash.data ?? []).map((entry) => <tr key={entry.id}><td className="px-4 py-3">{formatDemoDate(entry.entry_date)}</td><td className="px-4 py-3 font-semibold">{entry.title}</td><td className="px-4 py-3">{entry.category} · {entry.method}</td><td className="px-4 py-3 text-right tabular-nums">{entry.type === "in" ? "+" : "−"}{formatRupiah(Number(entry.amount))}</td></tr>)}</tbody></table></div> : <p className="p-4 text-sm text-muted-foreground">Tidak ada transaksi lama.</p>}
    </section>
    <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border p-4"><h2 className="font-semibold">Utang dan piutang lama</h2><p className="mt-1 text-xs text-muted-foreground">Ditampilkan paling banyak 1.000 catatan terakhir.</p></div>
      {(obligations.data ?? []).length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Pihak</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3 text-right">Nilai awal</th></tr></thead><tbody className="divide-y divide-border/70">{(obligations.data ?? []).map((item) => <tr key={item.id}><td className="px-4 py-3"><span className="font-semibold">{item.party}</span><span className="block text-xs text-muted-foreground">{item.description}</span></td><td className="px-4 py-3 capitalize">{item.kind}</td><td className="px-4 py-3">{formatDemoDate(item.obligation_date)} · jatuh tempo {formatDemoDate(item.due_date)}</td><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(Number(item.amount))}</td></tr>)}</tbody></table></div> : <p className="p-4 text-sm text-muted-foreground">Tidak ada utang atau piutang lama.</p>}
    </section>
  </>;
}
