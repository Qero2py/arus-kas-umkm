import { ArrowRight, CircleHelp, Scale } from "lucide-react";
import { formatRupiah } from "@/lib/format";

export function AccountingEquation({ assets, liabilities, equity }: {
  assets: number; liabilities: number; equity: number;
}) {
  return <section className="mb-6 overflow-hidden rounded-2xl border border-[#d3dfd1] bg-gradient-to-br from-[#eef5e9] via-[#f8faf3] to-[#f7f0e0] p-5 sm:p-7" aria-label="Penjelasan neraca">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Memahami laporan</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold"><Scale size={22} aria-hidden="true" />Neraca: posisi usaha pada tanggal laporan</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Semua yang dimiliki usaha berasal dari utang atau modal pemilik, termasuk laba yang belum diambil.</p></div>
      <span className="rounded-full border border-primary/20 bg-card/80 px-3 py-1.5 text-xs font-semibold text-primary">Aset = Utang + Modal</span>
    </div>
    <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div className="balance-rise rounded-2xl border border-[#bbd3c2] bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aset · yang dimiliki</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-primary sm:text-3xl">{formatRupiah(assets)}</p>
        <p className="mt-2 text-xs text-muted-foreground">Contoh: kas, persediaan, dan peralatan.</p>
      </div>
      <ArrowRight className="mx-auto rotate-90 text-primary sm:rotate-0" size={23} aria-hidden="true" />
      <div className="grid gap-2">
        <div className="balance-rise rounded-xl border border-[#e2d4b2] bg-card px-4 py-3 shadow-sm"><p className="text-xs font-semibold text-muted-foreground">Utang · kewajiban usaha</p><p className="mt-1 text-lg font-bold tabular-nums">{formatRupiah(liabilities)}</p></div>
        <div className="balance-rise rounded-xl border border-[#bbd3c2] bg-card px-4 py-3 shadow-sm"><p className="text-xs font-semibold text-muted-foreground">Modal + hasil usaha</p><p className="mt-1 text-lg font-bold tabular-nums">{formatRupiah(equity)}</p></div>
      </div>
    </div>
    <details className="mt-5 rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-sm"><summary className="flex cursor-pointer items-center gap-2 font-semibold"><CircleHelp size={17} aria-hidden="true" />Apa bedanya neraca dan neraca saldo?</summary><p className="mt-2 leading-6 text-muted-foreground">Neraca menjawab “apa yang dimiliki dan dari mana dananya?” Neraca saldo adalah daftar teknis semua akun untuk memastikan jumlah debit sama dengan kredit. Keduanya bisa dibuka dari menu Laporan.</p></details>
  </section>;
}
