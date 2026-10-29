"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { CashTrendChart } from "@/components/cash-trend-chart";
import { useDemoLedger } from "@/components/demo-ledger-provider";
import { useDemoSettings } from "@/components/demo-settings-provider";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { daysBetweenDates, formatDemoDate, getCashSummary, getCashTrend, getDueSoon, getProjection, type Period } from "@/lib/demo-calculations";
import { formatRupiah, formatSignedRupiah } from "@/lib/format";

const periodLabels: Record<Period, string> = { 7: "7 hari", 30: "30 hari", all: "semua tanggal" };

export default function DashboardPage() {
  const { entries, obligations, asOf, live, businessName, role } = useDemoLedger();
  const { settings } = useDemoSettings();
  const [period, setPeriod] = useState<Period>(7);
  const summary = getCashSummary(entries, settings.openingBalance, period, asOf);
  const trend = getCashTrend(entries, settings.openingBalance, period, asOf);
  const dueSoon = getDueSoon(obligations, asOf);
  const projection = getProjection(entries, obligations, settings.openingBalance, settings.horizon, asOf);
  const currentBelowThreshold = summary.balance < settings.threshold;
  const crossing = projection.sufficient && !currentBelowThreshold
    ? projection.points.find((point) => point.day > 0 && point.cautious < settings.threshold)
    : undefined;
  const recent = entries.filter((entry) => entry.date <= asOf).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <>
      <PageHeading eyebrow={`${live ? "Data usaha" : "Data contoh"} · Per ${formatDemoDate(asOf)}`} title={`Kas ${businessName}`} description={`Saldo dan catatan yang sudah terjadi sampai ${live ? "hari ini" : "tanggal data contoh"}. Pilih periode untuk melihat uang masuk dan keluar.`} action={<div className="flex flex-wrap items-center gap-2"><label className="text-sm font-medium">Periode <select value={period} onChange={(event) => setPeriod(event.target.value === "all" ? "all" : Number(event.target.value) as 7 | 30)} className="ml-2 h-11 rounded-lg border border-border bg-background px-3 text-sm"><option value="7">7 hari</option><option value="30">30 hari</option><option value="all">Semua tanggal</option></select></label><Link href="/transactions" className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Plus size={17} /> Catat transaksi</Link></div>} />

      <section className="grid gap-5 border-y border-border py-6 sm:grid-cols-[1.3fr_.8fr_.8fr] sm:gap-0" aria-label={`Ringkasan kas ${periodLabels[period]}`}>
        <article className="sm:pr-7"><p className="text-sm text-muted-foreground">Saldo kas tercatat</p><p className="mt-2 font-serif text-[34px] leading-none tracking-tight tabular-nums sm:text-[42px]">{formatRupiah(summary.balance)}</p><p className="mt-2 text-sm text-muted-foreground">Saldo awal + seluruh transaksi sampai {formatDemoDate(asOf)}</p></article>
        <article className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:px-7 sm:pt-0"><p className="text-sm text-muted-foreground">Uang masuk · {periodLabels[period]}</p><p className="mt-2 text-[22px] font-semibold tabular-nums">{formatRupiah(summary.incoming)}</p><p className="mt-1 text-xs text-muted-foreground">Transaksi yang sudah terjadi</p></article>
        <article className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:px-7 sm:pt-0"><p className="text-sm text-muted-foreground">Uang keluar · {periodLabels[period]}</p><p className="mt-2 text-[22px] font-semibold tabular-nums">{formatRupiah(summary.outgoing)}</p><p className="mt-1 text-sm text-muted-foreground">Selisih kas {formatSignedRupiah(summary.net)}</p></article>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,.85fr)]">
        <article className="min-w-0"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Pergerakan saldo</h2><p className="mt-1 text-sm text-muted-foreground">Dihitung dari transaksi pada periode {periodLabels[period]}.</p></div>{(!live || role === "owner") && <Link href="/projection" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Lihat proyeksi <ArrowRight size={17} /></Link>}</div><CashTrendChart points={trend} /></article>

        <article className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0"><h2 className="text-lg font-semibold">Perlu diperhatikan</h2><p className="mt-1 text-sm text-muted-foreground">Berdasarkan data per {formatDemoDate(asOf)}. Mendesak berarti jatuh tempo hari ini atau lewat, atau saldo melewati batas dalam 3 hari.</p><div className="mt-4 divide-y divide-border border-y border-border">
          {dueSoon.map((item) => { const daysUntil = daysBetweenDates(asOf, item.dueDate); const urgent = daysUntil <= 0; return <div key={item.id} className="py-4"><div className="flex flex-wrap items-center gap-2"><StatusPill tone={urgent ? "red" : "amber"}>{urgent ? "Mendesak" : "Perhatian"}</StatusPill><p className="text-sm font-semibold text-[#8c382b]">Utang {daysUntil < 0 ? "lewat jatuh tempo" : "jatuh tempo"} {item.dueLabel}</p></div><p className="mt-1 text-sm">{item.party} · sisa {formatRupiah(item.amount - item.settled)}</p><p className="mt-1 text-xs text-muted-foreground">Pemicu: sudah lewat atau jatuh tempo dalam 3 hari.</p></div>; })}
          {currentBelowThreshold && <div className="py-4"><div className="flex flex-wrap items-center gap-2"><StatusPill tone="red">Mendesak</StatusPill><p className="text-sm font-semibold text-[#8c382b]">Saldo kas di bawah batas aman</p></div><p className="mt-1 text-sm">Saldo tercatat {formatRupiah(summary.balance)} per {formatDemoDate(asOf)}.</p><p className="mt-1 text-xs text-muted-foreground">Pemicu: lebih rendah dari batas {formatRupiah(settings.threshold)}.</p></div>}
          {!projection.sufficient ? <div className="py-4"><p className="text-sm font-semibold">Data belum cukup untuk proyeksi</p><p className="mt-1 text-sm text-muted-foreground">Baru ada {projection.historyDays} hari riwayat. Perlu setidaknya 14 hari.</p></div> : crossing ? <div className="py-4"><div className="flex flex-wrap items-center gap-2"><StatusPill tone={crossing.day <= 3 ? "red" : "amber"}>{crossing.day <= 3 ? "Mendesak" : "Perhatian"}</StatusPill><p className="text-sm font-semibold text-[#8c382b]">Saldo berpotensi melewati batas aman</p></div><p className="mt-1 text-sm">Skenario hati-hati: {formatRupiah(crossing.cautious)} pada {crossing.label}.</p><p className="mt-1 text-xs text-muted-foreground">Pemicu: lebih rendah dari batas {formatRupiah(settings.threshold)}.</p></div> : null}
          {dueSoon.length === 0 && projection.sufficient && !crossing && !currentBelowThreshold && <div className="py-4 text-sm text-muted-foreground">Belum ada peringatan untuk tanggal ini.</div>}
        </div><Link href="/obligations" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Lihat utang & piutang <ArrowRight size={17} /></Link></article>
      </section>

      <section className="mt-9 border-t border-border" aria-label="Transaksi terbaru"><div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h2 className="text-lg font-semibold">Transaksi terbaru</h2><p className="mt-1 text-sm text-muted-foreground">Lima catatan terakhir dari buku kas.</p></div><Link href="/transactions" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Buka buku kas <ArrowRight size={17} /></Link></div>
        {recent.length === 0 ? <p className="border-t border-border py-8 text-sm text-muted-foreground">Belum ada transaksi. Mulai dari tombol Catat transaksi.</p> : <><div className="divide-y divide-border sm:hidden">{recent.map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 py-4"><div><p className="text-sm font-semibold">{entry.title}</p><p className="mt-1 text-xs text-muted-foreground">{entry.dateLabel} · {entry.category}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{entry.type === "in" ? "+" : "−"}{formatRupiah(entry.amount)}</p></div>)}</div><div className="hidden sm:block"><table className="w-full border-collapse text-left"><thead><tr className="border-y border-border bg-secondary/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Catatan</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3 text-right">Nominal</th></tr></thead><tbody>{recent.map((entry) => <tr key={entry.id} className="border-b border-border/70"><td className="px-4 py-4 text-sm font-semibold">{entry.title}</td><td className="px-4 py-4 text-sm text-muted-foreground">{entry.category}</td><td className="px-4 py-4 text-sm text-muted-foreground">{entry.dateLabel}</td><td className="px-4 py-4 text-right text-sm font-semibold tabular-nums">{entry.type === "in" ? "+" : "−"}{formatRupiah(entry.amount)}</td></tr>)}</tbody></table></div></>}
      </section>
      <p className="mt-6 border-t border-border pt-3 text-sm text-muted-foreground">{live ? "Selisih kas" : "Data ini simulasi. Selisih kas"} berarti uang masuk dikurangi uang keluar pada periode pilihan.</p>
    </>
  );
}
