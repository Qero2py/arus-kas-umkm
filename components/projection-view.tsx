"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { useDemoLedger } from "@/components/demo-ledger-provider";
import { useDemoSettings } from "@/components/demo-settings-provider";
import { formatDemoDate, getProjection } from "@/lib/demo-calculations";
import { type ProjectionPoint } from "@/lib/demo-data";
import { formatCompactRupiah, formatRupiah, formatSignedRupiah } from "@/lib/format";

type Horizon = 7 | 14 | 30;
type Scenario = "scheduled" | "cautious";

function importantDays(horizon: Horizon) {
  return horizon === 30 ? [0, 7, 14, 21, 30] : horizon === 14 ? [0, 7, 14] : [0, 3, 7];
}

function ProjectionChart({ points, horizon, scenario, threshold }: { points: ProjectionPoint[]; horizon: Horizon; scenario: Scenario; threshold: number }) {
  const width = 740;
  const height = 270;
  const allValues = points.flatMap((point) => [point.scheduled, point.cautious]);
  const min = Math.min(...allValues, threshold, 0);
  const max = Math.max(...allValues, threshold, 1_000_000);
  const pad = Math.max((max - min) * 0.1, 500_000);
  const low = min - pad;
  const high = max + pad;
  const x = (day: number) => 70 + day / horizon * (width - 90);
  const y = (value: number) => 20 + (high - value) / (high - low) * (height - 55);
  const pathFor = (key: Scenario) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.day).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(" ");
  const keyDays = importantDays(horizon);

  return (
    <>
      <div className="mt-5 hidden sm:block"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Proyeksi saldo ${horizon} hari. Skenario ${scenario === "scheduled" ? "terjadwal" : "hati-hati"}. Batas aman ${formatRupiah(threshold)}.`} className="h-[265px] w-full">
        {[0, 1, 2, 3, 4].map((step) => { const value = low + (high - low) * step / 4; return <g key={step}><line x1="70" x2={width - 20} y1={y(value)} y2={y(value)} stroke="#ddd8cd" strokeDasharray="3 5" /><text x="0" y={y(value) + 4} fill="#4c4b43" fontSize="11">{formatCompactRupiah(value)}</text></g>; })}
        <line x1="70" x2={width - 20} y1={y(threshold)} y2={y(threshold)} stroke="#9a4536" strokeWidth="2" strokeDasharray="5 5" />
        <path d={pathFor(scenario === "scheduled" ? "cautious" : "scheduled")} fill="none" stroke="#7c8e82" strokeWidth="2" strokeDasharray="5 6" />
        <path d={pathFor(scenario)} fill="none" stroke="#285d3e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {keyDays.map((day) => { const point = points[day]; return <g key={day}><circle cx={x(day)} cy={y(point[scenario])} r="5" fill="#fff" stroke="#285d3e" strokeWidth="3" /><text x={x(day)} y={height - 5} textAnchor={day === 0 ? "start" : day === horizon ? "end" : "middle"} fill="#4c4b43" fontSize="11">{point.label}</text></g>; })}
      </svg></div>
      <div className="mt-5 divide-y divide-border rounded-lg border border-border sm:hidden" aria-label="Proyeksi menurut tanggal">{keyDays.map((day) => { const point = points[day]; return <div key={day} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="font-medium">{day === 0 ? "Saldo awal" : point.label}</span><span className="font-semibold tabular-nums">{formatRupiah(point[scenario])}</span></div>; })}</div>
    </>
  );
}

export function ProjectionView() {
  const { entries, obligations, asOf, live } = useDemoLedger();
  const { settings } = useDemoSettings();
  const [selectedHorizon, setSelectedHorizon] = useState<Horizon | null>(null);
  const horizon = selectedHorizon ?? settings.horizon;
  const [scenario, setScenario] = useState<Scenario>("scheduled");
  const result = getProjection(entries, obligations, settings.openingBalance, horizon, asOf);
  const values = result.points.map((point) => point[scenario]);
  const low = Math.min(...values);
  const lowPoint = result.points[values.indexOf(low)];
  const end = result.points[result.points.length - 1][scenario];
  const currentBelowThreshold = result.opening < settings.threshold;
  const firstCrossing = result.points.find((point) => point[scenario] < settings.threshold);
  const thresholdTitle = currentBelowThreshold ? "Saldo saat ini di bawah batas aman" : firstCrossing ? "Saldo diperkirakan melewati batas aman" : "Saldo tidak di bawah batas aman";
  const thresholdMessage = currentBelowThreshold
    ? `Saldo tercatat ${formatRupiah(result.opening)} hari ini berada di bawah batas ${formatRupiah(settings.threshold)}.`
    : firstCrossing
      ? `Perkiraan ${formatRupiah(firstCrossing[scenario])} pada ${firstCrossing.label} berada di bawah batas ${formatRupiah(settings.threshold)}.`
      : `Selama ${horizon} hari, saldo terendah ${formatRupiah(low)} tidak berada di bawah batas ${formatRupiah(settings.threshold)}.`;

  return (
    <>
      <PageHeading eyebrow={`Proyeksi kas · ${live ? "Per" : "Data contoh per"} ${formatDemoDate(asOf)}`} title="Perkiraan saldo ke depan" description="Lihat pengaruh arus kas harian dan utang/piutang yang belum selesai. Angka ini perkiraan, bukan kepastian." />

      <div className="mb-5 flex flex-wrap gap-3"><div className="flex gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Lama proyeksi">{([7, 14, 30] as const).map((value) => <button key={value} type="button" aria-pressed={horizon === value} onClick={() => setSelectedHorizon(value)} className={`min-h-11 rounded-md px-4 text-sm font-semibold ${horizon === value ? "bg-card ring-1 ring-border" : "text-muted-foreground"}`}>{value} hari</button>)}</div></div>

      {!result.sufficient ? <section role="status" className="rounded-xl border-l-4 border-[#986d2f] bg-[#fbf4e5] p-5 sm:p-6"><h2 className="text-lg font-semibold">Data belum cukup untuk proyeksi</h2><p className="mt-2 max-w-2xl text-sm leading-6">Ada {result.historyDays} hari riwayat transaksi. Perkiraan baru ditampilkan setelah tersedia setidaknya 14 hari. Saldo kas tercatat saat ini {formatRupiah(result.opening)}.</p>{result.opening < settings.threshold && <p className="mt-3 text-sm font-semibold text-[#812e22]">Saldo saat ini di bawah batas aman {formatRupiah(settings.threshold)}. Peringatan ini memakai saldo tercatat, bukan perkiraan.</p>}<Link href="/transactions" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">Lihat buku kas</Link></section> : <>
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Ringkasan proyeksi"><article className="rounded-xl border border-border bg-card p-4 sm:p-5"><p className="text-sm text-muted-foreground">Saldo awal proyeksi</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatRupiah(result.opening)}</p></article><article className="rounded-xl border border-border bg-card p-4 sm:p-5"><p className="text-sm text-muted-foreground">Saldo terendah · {horizon} hari</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatRupiah(low)}</p><p className="mt-1 text-xs text-muted-foreground">Pada {lowPoint.label}</p></article><article className="rounded-xl border border-border bg-card p-4 sm:p-5"><p className="text-sm text-muted-foreground">Saldo akhir · {horizon} hari</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatRupiah(end)}</p><p className="mt-1 text-xs text-muted-foreground">Skenario {scenario === "scheduled" ? "terjadwal" : "hati-hati"}</p></article></section>

        <section className="mt-5 rounded-xl border border-border bg-card p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Jalur saldo kas</h2><p className="mt-1 text-sm text-muted-foreground">Batas aman {formatRupiah(settings.threshold)}</p></div><div className="flex gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Skenario">{([{ id: "scheduled", label: "Terjadwal" }, { id: "cautious", label: "Hati-hati" }] as const).map((option) => <button key={option.id} type="button" aria-pressed={scenario === option.id} onClick={() => setScenario(option.id)} className={`min-h-11 rounded-md px-3 text-sm font-semibold ${scenario === option.id ? "bg-card ring-1 ring-border" : "text-muted-foreground"}`}>{option.label}</button>)}</div></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="h-[3px] w-6 bg-[#285d3e]" />Skenario dipilih</span><span className="inline-flex items-center gap-2"><span className="h-0 w-6 border-t-2 border-dashed border-[#7c8e82]" />Skenario lain</span><span className="inline-flex items-center gap-2"><span className="h-0 w-6 border-t-2 border-dashed border-[#9a4536]" />Batas aman</span></div><ProjectionChart points={result.points} horizon={horizon} scenario={scenario} threshold={settings.threshold} /></section>

        <section className="mt-5 grid gap-4 lg:grid-cols-2"><article className="rounded-xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">Dari mana angka ini?</h2><dl className="mt-4 divide-y divide-border text-sm"><div className="flex justify-between gap-3 py-2"><dt>Saldo awal</dt><dd className="font-semibold tabular-nums">{formatRupiah(result.opening)}</dd></div><div className="flex justify-between gap-3 py-2"><dt>Arus rata-rata per hari × {horizon}</dt><dd className="font-semibold tabular-nums">{formatSignedRupiah(result.dailyNet * horizon)}</dd></div><div className="flex justify-between gap-3 py-2"><dt>Utang belum dibayar dalam periode</dt><dd className="font-semibold tabular-nums">−{formatRupiah(result.payables)}</dd></div>{scenario === "scheduled" && <div className="flex justify-between gap-3 py-2"><dt>Piutang belum diterima dalam periode</dt><dd className="font-semibold tabular-nums">+{formatRupiah(result.receivables)}</dd></div>}<div className="flex justify-between gap-3 border-t border-border py-3 font-semibold"><dt>Saldo akhir perkiraan</dt><dd className="tabular-nums">{formatRupiah(end)}</dd></div></dl><p className="mt-3 text-xs leading-5 text-muted-foreground">Jumlah arus rutin pada 30 hari terakhir dibagi 30, termasuk hari tanpa transaksi. Pembayaran utang/piutang tidak masuk arus rutin. Ada {result.historyDays} hari riwayat.</p></article><article className="rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{thresholdTitle}</h2>{firstCrossing && <StatusPill tone={firstCrossing.day <= 3 ? "red" : "amber"}>{firstCrossing.day <= 3 ? "Mendesak" : "Perhatian"}</StatusPill>}</div><p className="mt-2 text-sm leading-6">{thresholdMessage}</p><p className="mt-4 text-sm leading-6 text-muted-foreground">Skenario terjadwal memasukkan semua piutang pada tanggal jatuh tempo. Skenario hati-hati menganggap seluruh piutang belum pasti dan tidak memasukkannya. Pembayaran yang sudah dicatat hanya masuk sebagai saldo aktual. Tingkat mendesak berarti saldo melewati batas dalam 3 hari.</p><Link href="/settings" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">Ubah batas aman</Link></article></section>
      </>}
      <p className="mt-5 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">{live ? "Proyeksi dihitung dari catatan usaha Anda." : "Proyeksi adalah simulasi dari data contoh."} Pencatatan yang belum lengkap atau pembayaran yang bergeser tanggal dapat mengubah hasil.</p>
    </>
  );
}
