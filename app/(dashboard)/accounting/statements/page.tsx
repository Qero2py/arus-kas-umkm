import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { PageHeading } from "@/components/page-heading";
import { ACCOUNTING_NOTE_POLICIES } from "@/lib/accounting-notes";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import type { StatementLine } from "@/lib/financial-statements";
import { loadFinancialStatements } from "@/lib/supabase/financial-statements";
import { todayInJakarta } from "@/lib/supabase/workspace";

type Filters = Promise<{ asOf?: string | string[] }>;
type Pair = { current: number; prior: number };

function Amount({ value }: { value: number }) {
  return <>{value === 0 ? "—" : formatRupiah(value)}</>;
}

function Line({ label, values, strong = false }: { label: string; values: Pair; strong?: boolean }) {
  return <tr className={strong ? "border-t border-border bg-secondary/50 font-semibold" : "border-t border-border/60"}>
    <th scope="row" className={`px-4 py-3 text-left ${strong ? "font-semibold" : "font-normal"}`}>{label}</th>
    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums"><Amount value={values.current} /></td>
    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums"><Amount value={values.prior} /></td>
  </tr>;
}

function Section({ title, rows }: { title: string; rows: StatementLine[] }) {
  const visible = rows.filter((row) => row.current !== 0 || row.prior !== 0);
  return <>
    <tr className="bg-secondary/25"><th colSpan={3} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</th></tr>
    {visible.length ? visible.map((row) => <Line key={row.code} label={`${row.code} · ${row.name}`} values={row} />)
      : <tr><td colSpan={3} className="px-4 py-3 text-sm text-muted-foreground">Tidak ada saldo pada kedua periode.</td></tr>}
  </>;
}

function ReportTable({ title, currentLabel, priorLabel, children }: {
  title: string; currentLabel: string; priorLabel: string; children: ReactNode;
}) {
  return <section className="overflow-hidden rounded-xl border border-border bg-card">
    <div className="border-b border-border px-5 py-4"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">Rupiah · berdasarkan jurnal yang dibukukan</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm">
      <thead className="bg-secondary/50 text-left text-xs text-muted-foreground"><tr>
        <th className="px-4 py-3">Pos</th><th className="px-4 py-3 text-right">{currentLabel}</th><th className="px-4 py-3 text-right">{priorLabel}</th>
      </tr></thead><tbody>{children}</tbody>
    </table></div>
  </section>;
}

export default function FinancialStatementsPage({ searchParams }: { searchParams: Filters }) {
  return <Suspense fallback={<p role="status">Memuat laporan keuangan…</p>}>
    <Content searchParams={searchParams} />
  </Suspense>;
}

async function Content({ searchParams }: { searchParams: Filters }) {
  await connection();
  const filters = await searchParams;
  const asOf = typeof filters.asOf === "string" ? filters.asOf : todayInJakarta();
  const report = await loadFinancialStatements(asOf);
  if (!report.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{report.message}</p>;
  const { dates, statements } = report;
  const income = statements.income;
  const position = statements.position;

  return <>
    <PageHeading eyebrow={`Akuntansi · ${report.businessName}`} title="Laba rugi & posisi keuangan"
      description="Laporan draf dari jurnal usaha. Kolom pembanding menampilkan periode yang sama pada tahun sebelumnya." />
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <label className="text-sm font-medium">Sampai tanggal
        <input type="date" name="asOf" defaultValue={dates.asOf} max={todayInJakarta()}
          className="mt-1.5 block h-11 rounded-lg border border-border bg-background px-3 text-sm" />
      </label>
      <button type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Tampilkan</button>
      <span className="rounded-full bg-secondary px-3 py-2 text-xs font-semibold">Draf · CaLK ringkas</span>
    </form>
    <div className="mb-5 flex flex-wrap gap-3">
      <a href={`/accounting/statements/export/pdf?asOf=${encodeURIComponent(dates.asOf)}`}
        className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-primary hover:border-primary">Unduh PDF</a>
      <a href={`/accounting/statements/export/xlsx?asOf=${encodeURIComponent(dates.asOf)}`}
        className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-primary hover:border-primary">Unduh Excel</a>
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <ReportTable title="Laporan laba rugi"
        currentLabel={`${formatDemoDate(dates.currentStart)}–${formatDemoDate(dates.asOf)}`}
        priorLabel={`${formatDemoDate(dates.priorStart)}–${formatDemoDate(dates.priorAsOf)}`}>
        <Section title="Pendapatan" rows={income.revenue} />
        <Line label="Jumlah pendapatan" values={income.totalRevenue} strong />
        <Section title="Harga pokok penjualan" rows={income.cogs} />
        <Line label="Jumlah HPP" values={income.totalCogs} strong />
        <Line label="Laba kotor" values={income.grossProfit} strong />
        <Section title="Beban usaha" rows={income.expenses} />
        <Line label="Jumlah beban usaha" values={income.totalExpenses} strong />
        <Line label="Laba (rugi) periode" values={income.netProfit} strong />
      </ReportTable>
      <ReportTable title="Laporan posisi keuangan"
        currentLabel={formatDemoDate(dates.asOf)} priorLabel={formatDemoDate(dates.priorAsOf)}>
        <Section title="Aset, termasuk akun kontra" rows={position.assets} />
        <Line label="Jumlah aset" values={position.totalAssets} strong />
        <Section title="Liabilitas" rows={position.liabilities} />
        <Line label="Jumlah liabilitas" values={position.totalLiabilities} strong />
        <Section title="Ekuitas dan prive" rows={position.equityAccounts} />
        <Line label="Hasil usaha sebelum tahun berjalan" values={position.priorYearsResult} />
        <Line label="Laba (rugi) tahun berjalan" values={position.currentResult} />
        <Line label="Jumlah ekuitas" values={position.totalEquity} strong />
        <Line label="Jumlah liabilitas dan ekuitas" values={position.totalLiabilitiesAndEquity} strong />
      </ReportTable>
    </div>
    <section id="notes" className="mt-8 space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">Catatan atas laporan keuangan · draf</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Catatan ini menjelaskan kebijakan yang diterapkan oleh modul pembukuan dan rincian saldo akun. Laporan belum dinyatakan sesuai SAK EMKM; saldo pembuka, transaksi material, dan kebijakan usaha masih perlu ditinjau pemilik.</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-primary">
          <a href="#note-cash" className="underline">Kas dan bank</a>
          <a href="#note-receivables" className="underline">Piutang</a>
          <a href="#note-inventory" className="underline">Persediaan</a>
          <a href="#note-assets" className="underline">Aset tetap</a>
          <a href="#note-payables" className="underline">Utang</a>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold">1. Identitas dan dasar angka</h3>
          <p className="mt-2 text-sm leading-6">Usaha: <strong>{report.businessName}</strong>. Laporan disajikan dalam Rupiah sampai {formatDemoDate(dates.asOf)}, dengan pembanding sampai {formatDemoDate(dates.priorAsOf)}. Angka diambil dari jurnal yang sudah dibukukan pada usaha ini. Laba rugi dihitung sejak 1 Januari masing-masing tahun; posisi keuangan menunjukkan saldo pada tanggal kolomnya.</p>
        </article>
        <article className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold">2. Kebijakan yang digunakan aplikasi</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
            {ACCOUNTING_NOTE_POLICIES.map((policy) => <li key={policy}>{policy}</li>)}
          </ul>
        </article>
      </div>
      <div id="note-cash"><ReportTable title="3. Kas, bank, dan dompet digital" currentLabel={formatDemoDate(dates.asOf)} priorLabel={formatDemoDate(dates.priorAsOf)}>
        <Section title="Rincian akun kas" rows={report.notes.cash} />
        <Line label="Jumlah kas, bank, dan dompet digital" values={report.notes.cashTotal} strong />
      </ReportTable></div>
      <div id="note-receivables"><ReportTable title="4. Piutang usaha" currentLabel={formatDemoDate(dates.asOf)} priorLabel={formatDemoDate(dates.priorAsOf)}>
        <Section title="Rincian akun piutang" rows={report.notes.receivables} />
        <Line label="Jumlah piutang" values={report.notes.receivablesTotal} strong />
      </ReportTable></div>
      <div id="note-inventory"><ReportTable title="5. Persediaan" currentLabel={formatDemoDate(dates.asOf)} priorLabel={formatDemoDate(dates.priorAsOf)}>
        <Section title="Rincian akun persediaan" rows={report.notes.inventory} />
        <Line label="Jumlah persediaan" values={report.notes.inventoryTotal} strong />
      </ReportTable></div>
      <div id="note-assets" className="space-y-4"><ReportTable title="6. Aset tetap" currentLabel={formatDemoDate(dates.asOf)} priorLabel={formatDemoDate(dates.priorAsOf)}>
        <Section title="Biaya perolehan" rows={report.notes.fixedCost} />
        <Line label="Jumlah biaya perolehan" values={report.notes.fixedCostTotal} strong />
        <Section title="Akumulasi penyusutan (pengurang)" rows={report.notes.accumulatedDepreciation} />
        <Line label="Jumlah akumulasi penyusutan" values={report.notes.accumulatedTotal} strong />
        <Line label="Nilai buku aset tetap" values={report.notes.netFixedAssets} strong />
      </ReportTable>
        {report.assetRegister.status === "ready" ? <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border p-5"><h3 className="font-semibold">Rincian register aset pada {formatDemoDate(dates.asOf)}</h3><p className="mt-1 text-xs text-muted-foreground">Jumlah biaya dan akumulasi telah dicocokkan dengan akun buku besar.</p></div>
          {report.assetRegister.assets.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Kode dan aset</th><th className="px-4 py-3">Siap digunakan</th><th className="px-4 py-3 text-right">Biaya</th><th className="px-4 py-3 text-right">Akumulasi</th><th className="px-4 py-3 text-right">Nilai buku</th></tr></thead>
            <tbody>{report.assetRegister.assets.map((asset) => <tr key={asset.id} className="border-t border-border/60"><th scope="row" className="px-4 py-3 text-left font-normal">{asset.asset_code} · {asset.name}</th><td className="px-4 py-3">{formatDemoDate(asset.ready_on)}</td><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(asset.cost)}</td><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(asset.accumulated)}</td><td className="px-4 py-3 text-right tabular-nums">{formatRupiah(asset.cost - asset.accumulated)}</td></tr>)}</tbody>
          </table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada aset pada register.</p>}
        </div> : <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">{report.assetRegister.status === "historical" ? "Register aset saat ini tidak dapat dipakai untuk merinci saldo historis. Rincian akun di atas tetap berasal dari jurnal pada tanggal laporan." : report.assetRegister.status === "inactive" ? "Register aset belum diaktifkan. Rincian yang tersedia masih per akun buku besar." : report.assetRegister.status === "unreconciled" ? "Jumlah register aset belum cocok dengan buku besar pada tanggal ini; daftar aset disembunyikan sampai diperiksa." : report.assetRegister.status === "too_many" ? "Daftar aset terlalu panjang untuk ditampilkan utuh di CaLK; ringkasan per akun tetap tersedia." : "Register aset belum dapat dimuat; ringkasan per akun tetap tersedia."}</p>}
      </div>
      <div id="note-payables"><ReportTable title="7. Utang usaha" currentLabel={formatDemoDate(dates.asOf)} priorLabel={formatDemoDate(dates.priorAsOf)}>
        <Section title="Rincian akun utang" rows={report.notes.payables} />
        <Line label="Jumlah utang" values={report.notes.payablesTotal} strong />
      </ReportTable></div>
      <p className="rounded-xl border border-border bg-card p-5 text-sm leading-6 text-muted-foreground">Rincian piutang dan utang di atas masih per akun, belum per pelanggan atau pemasok pada tanggal historis. Pajak, retur, potongan, dan transaksi material lain yang belum dimodelkan memerlukan peninjauan terpisah. Catatan kas lama belum digabungkan otomatis.</p>
    </section>
  </>;
}
