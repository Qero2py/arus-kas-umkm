"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { useDemoLedger } from "@/components/demo-ledger-provider";
import { useDemoSettings } from "@/components/demo-settings-provider";
import { PageHeading } from "@/components/page-heading";
import { getCashSummary } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";

export function AccountingCashbookView() {
  const { entries, asOf, role } = useDemoLedger();
  const { settings } = useDemoSettings();
  const summary = getCashSummary(entries, settings.openingBalance, "all", asOf);
  return <>
    <PageHeading eyebrow="Kegiatan usaha · Kas & bank" title="Buku kas"
      description="Semua pergerakan kas dan bank diambil dari jurnal yang sudah dibukukan. Transfer antarakun tampil sebagai dua sisi dengan jumlah bersih nol."
      action={<Link href="/accounting/entries" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={17} />{role === "owner" ? "Catat transaksi" : "Catat penjualan"}</Link>} />
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Uang masuk sejak saldo pembuka</p><p className="mt-1 text-xl font-semibold tabular-nums text-primary">{formatRupiah(summary.incoming)}</p></div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Uang keluar sejak saldo pembuka</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatRupiah(summary.outgoing)}</p></div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Saldo kas & bank saat ini</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatRupiah(summary.balance)}</p></div>
    </div>
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5"><h2 className="font-semibold">Riwayat dari jurnal</h2><p className="mt-1 text-xs text-muted-foreground">Pembayaran tagihan, pembelian stok, dan transaksi tunai tampil di satu daftar.</p></div>
      {entries.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm">
        <thead className="bg-secondary/60 text-left text-xs font-semibold text-muted-foreground"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Transaksi</th><th className="px-4 py-3">Akun kas/bank</th><th className="px-4 py-3 text-right">Perubahan</th></tr></thead>
        <tbody className="divide-y divide-border/70">{entries.map((entry) => <tr key={entry.id}>
          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{entry.dateLabel}</td>
          <td className="px-4 py-3"><span className="font-semibold">{entry.title}</span><span className="mt-1 block text-xs capitalize text-muted-foreground">{entry.category}</span></td>
          <td className="px-4 py-3">{entry.method}</td>
          <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${entry.type === "in" ? "text-primary" : ""}`}><span className="inline-flex items-center gap-1">{entry.type === "in" ? <ArrowDownLeft size={15} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}{entry.type === "in" ? "+" : "−"}{formatRupiah(entry.amount)}</span></td>
        </tr>)}</tbody>
      </table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada pergerakan kas setelah saldo pembuka.</p>}
    </section>
    <p className="mt-4 text-xs text-muted-foreground">Perubahan atas transaksi yang sudah dibukukan dilakukan lewat fitur koreksi agar jejak jurnal tetap utuh. <Link href="/archive" className="font-semibold text-primary underline">Lihat catatan sebelum pembukuan</Link>.</p>
  </>;
}
