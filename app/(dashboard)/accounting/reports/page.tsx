import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeading } from "@/components/page-heading";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import { loadAccountingReport } from "@/lib/supabase/accounting-reports";
import { todayInJakarta } from "@/lib/supabase/workspace";

type Filters = Promise<{ asOf?: string | string[]; account?: string | string[]; page?: string | string[] }>;

const sourceNames: Record<string, string> = {
  opening_balance: "Saldo pembuka", cash_sale: "Pendapatan tunai", cash_expense: "Beban tunai",
  capital_contribution: "Setoran modal", owner_draw: "Prive", cash_transfer: "Transfer kas/bank",
  credit_sale: "Penjualan tempo", credit_purchase: "Pembelian tempo",
  customer_receipt: "Penerimaan piutang", supplier_payment: "Pembayaran utang",
  stock_purchase: "Pembelian stok", stock_sale: "Penjualan stok",
  stock_cogs: "HPP penjualan tempo", stock_opname: "Selisih stok opname",
  asset_purchase: "Pembelian aset tetap", asset_depreciation: "Penyusutan aset tetap",
  correction_reversal: "Pembalik koreksi",
  credit_document_correction: "Pengganti dokumen tempo",
  credit_payment_correction: "Pengganti pembayaran tempo",
  asset_correction: "Pengganti aset tetap",
};

export default function AccountingReportsPage({ searchParams }: { searchParams: Filters }) {
  return <Suspense fallback={<p role="status">Memuat laporan akuntansi…</p>}>
    <ReportContent searchParams={searchParams} />
  </Suspense>;
}

async function ReportContent({ searchParams }: { searchParams: Filters }) {
  await connection();
  const filters = await searchParams;
  const asOf = typeof filters.asOf === "string" ? filters.asOf : todayInJakarta();
  const requestedCode = typeof filters.account === "string" ? filters.account : "";
  const page = filters.page === undefined ? 1 : Number(filters.page);
  const report = await loadAccountingReport(asOf, requestedCode, page);
  if (!report.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{report.message}</p>;

  const pageLink = (number: number) => `/accounting/reports?${new URLSearchParams({
    asOf: report.asOf, account: report.accountCode, page: String(number),
  })}`;

  return <>
    <PageHeading eyebrow={`Akuntansi · ${report.businessName}`} title="Neraca saldo & buku besar"
      description="Semua angka berasal dari jurnal yang sudah dibukukan hingga tanggal yang dipilih. Neraca saldo memeriksa keseimbangan debit dan kredit." />
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <label className="text-sm font-medium">Sampai tanggal
        <input type="date" name="asOf" defaultValue={report.asOf} max={todayInJakarta()}
          className="mt-1.5 block h-11 rounded-lg border border-border bg-background px-3 text-sm" />
      </label>
      <label className="text-sm font-medium">Akun buku besar
        <select name="account" defaultValue={report.accountCode} className="mt-1.5 block h-11 min-w-52 rounded-lg border border-border bg-background px-3 text-sm">
          {report.balances.map((row) => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}
        </select>
      </label>
      <button type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Tampilkan</button>
    </form>

    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-5">
        <div><h2 className="text-base font-semibold">Neraca saldo</h2><p className="mt-1 text-xs text-muted-foreground">Posisi sampai {formatDemoDate(report.asOf)} · Rupiah</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${report.balanced ? "bg-[#edf5ee] text-[#356548]" : "bg-[#fff3f0] text-[#812e22]"}`}>
          {report.balanced ? "Seimbang" : "Tidak seimbang"}
        </span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/70 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Kode</th><th className="px-5 py-3">Akun</th><th className="px-5 py-3 text-right">Debit</th><th className="px-5 py-3 text-right">Kredit</th></tr></thead>
        <tbody className="divide-y divide-border/70">{report.balances.map((row) => <tr key={row.code}>
          <td className="px-5 py-3 font-mono text-xs text-primary">{row.code}</td><td className="px-5 py-3 font-medium">{row.name}</td>
          <td className="px-5 py-3 text-right tabular-nums">{row.endingDebit ? formatRupiah(row.endingDebit) : "—"}</td>
          <td className="px-5 py-3 text-right tabular-nums">{row.endingCredit ? formatRupiah(row.endingCredit) : "—"}</td>
        </tr>)}</tbody>
        <tfoot className="border-t border-border bg-secondary/40 font-semibold"><tr><th colSpan={2} className="px-5 py-4 text-left">Total</th><td className="px-5 py-4 text-right tabular-nums">{formatRupiah(report.debit)}</td><td className="px-5 py-4 text-right tabular-nums">{formatRupiah(report.credit)}</td></tr></tfoot>
      </table></div>
    </section>

    <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5"><h2 className="text-base font-semibold">Buku besar: {report.balances.find((row) => row.code === report.accountCode)?.name ?? "Akun"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">Mutasi menurut tanggal transaksi. Saldo berjalan mengikuti sisi normal akun.</p></div>
      {report.ledger.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
        <thead className="bg-secondary/70 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Sumber & keterangan</th><th className="px-5 py-3 text-right">Debit</th><th className="px-5 py-3 text-right">Kredit</th><th className="px-5 py-3 text-right">Saldo</th></tr></thead>
        <tbody className="divide-y divide-border/70">{report.ledger.map((row) => <tr key={`${row.sourceType}:${row.sourceId}:${row.lineNo}`}>
          <td className="whitespace-nowrap px-5 py-3">{formatDemoDate(row.entryDate)}</td>
          <td className="px-5 py-3"><span className="font-medium">{row.description}</span><span className="mt-0.5 block text-xs text-muted-foreground">{sourceNames[row.sourceType] ?? row.sourceType}</span></td>
          <td className="px-5 py-3 text-right tabular-nums">{row.debit ? formatRupiah(row.debit) : "—"}</td>
          <td className="px-5 py-3 text-right tabular-nums">{row.credit ? formatRupiah(row.credit) : "—"}</td>
          <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatRupiah(row.runningBalance)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada mutasi untuk akun dan tanggal ini.</p>}
      {(report.page > 1 || report.hasMore) && <div className="flex justify-between border-t border-border p-4 text-sm">
        {report.page > 1 ? <Link href={pageLink(report.page - 1)} className="font-semibold text-primary underline">Sebelumnya</Link> : <span />}
        {report.hasMore && <Link href={pageLink(report.page + 1)} className="font-semibold text-primary underline">Berikutnya</Link>}
      </div>}
    </section>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Neraca saldo dan buku besar adalah laporan teknis pembukuan. Laporan keuangan SAK EMKM serta data kas lama masih memerlukan rekonsiliasi dan tahap pengembangan berikutnya.</p>
  </>;
}
