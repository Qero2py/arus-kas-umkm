"use client";

import Link from "next/link";
import { AlertCircle, Clock3 } from "lucide-react";
import { useDemoLedger } from "@/components/demo-ledger-provider";
import { buildAgingSummary, type AgingTotals } from "@/lib/aging";
import { formatRupiah } from "@/lib/format";

const buckets: { key: keyof Omit<AgingTotals, "total">; label: string }[] = [
  { key: "belum_jatuh_tempo", label: "Belum jatuh tempo" },
  { key: "lewat_1_30", label: "Lewat 1–30 hari" },
  { key: "lewat_31_60", label: "Lewat 31–60 hari" },
  { key: "lewat_61_plus", label: "Lewat 61+ hari" },
];

function AgingCard({ title, totals }: { title: string; totals: AgingTotals }) {
  return <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    <p className="mt-2 text-2xl font-bold tabular-nums text-primary">{formatRupiah(totals.total)}</p>
    <div className="mt-4 space-y-2">{buckets.map((bucket) => <div key={bucket.key} className="flex items-center justify-between gap-3 border-t border-border/70 pt-2 text-xs"><span className="text-muted-foreground">{bucket.label}</span><span className="font-semibold tabular-nums">{formatRupiah(totals[bucket.key])}</span></div>)}</div>
  </article>;
}

export function AgingSummary({ compact = false }: { compact?: boolean }) {
  const { obligations, asOf, accountingActive, role } = useDemoLedger();
  if (!accountingActive) return null;
  const summary = buildAgingSummary(obligations, asOf);
  return <section className="mb-6" aria-label="Umur piutang dan utang">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Clock3 size={19} aria-hidden="true" />Umur piutang & utang</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Sisa tagihan dikelompokkan menurut jarak dari tanggal jatuh tempo. Angka berasal dari dokumen tempo dan pembayaran yang dibukukan.</p></div>{compact && role === "owner" && <Link href="/accounting/credit" className="text-sm font-semibold text-primary underline">Kelola tagihan</Link>}</div>
    <div className="grid gap-4 md:grid-cols-2"><AgingCard title="Piutang pelanggan" totals={summary.receivables} /><AgingCard title="Utang pemasok" totals={summary.payables} /></div>
    {(summary.receivables.lewat_61_plus > 0 || summary.payables.lewat_61_plus > 0) && <p className="mt-3 flex items-center gap-2 text-xs text-[#845b22]"><AlertCircle size={15} aria-hidden="true" />Ada tagihan lewat jatuh tempo lebih dari 60 hari.</p>}
    <p className="mt-3 text-xs text-muted-foreground">Punya catatan sebelum pembukuan baru? <Link href="/archive" className="font-semibold text-primary underline">Buka arsip lama</Link>.</p>
  </section>;
}
