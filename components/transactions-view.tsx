"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, CirclePlus, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { useDemoLedger } from "@/components/demo-ledger-provider";
import { useDemoSettings } from "@/components/demo-settings-provider";
import { type CashEntry } from "@/lib/demo-data";
import { entriesForPeriod, formatDemoDate, getCashSummary, isValidDemoDate, type Period } from "@/lib/demo-calculations";
import { formatRupiah, formatSignedRupiah } from "@/lib/format";

type Filter = "all" | "in" | "out";
const surface = "rounded-xl border border-border bg-card";
const periodLabels: Record<Period, string> = { 7: "7 hari", 30: "30 hari", all: "Semua tanggal" };

export function TransactionsView() {
  const { entries, obligations, addEntry, updateEntry, asOf, live } = useDemoLedger();
  const { settings } = useDemoSettings();
  const [period, setPeriod] = useState<Period>(30);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CashEntry | null>(null);
  const [entryType, setEntryType] = useState<"in" | "out">("in");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const summary = getCashSummary(entries, settings.openingBalance, period, asOf);

  const visible = useMemo(() => entriesForPeriod(entries, period, asOf)
    .filter((entry) => filter === "all" || entry.type === filter)
    .filter((entry) => `${entry.title} ${entry.category} ${entry.method}`.toLocaleLowerCase("id-ID").includes(query.toLocaleLowerCase("id-ID")))
    .sort((a, b) => b.date.localeCompare(a.date)), [entries, filter, period, query, asOf]);

  function openNew() {
    setEditing(null);
    setEntryType("in");
    setFormError("");
    dialogRef.current?.showModal();
  }

  function openEdit(entry: CashEntry) {
    setEditing(entry);
    setEntryType(entry.type);
    setFormError("");
    dialogRef.current?.showModal();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date") ?? "");
    const title = String(data.get("title") ?? "").trim();
    const amount = Number(data.get("amount"));
    if (!title || !isValidDemoDate(date, asOf) || !Number.isSafeInteger(amount) || amount <= 0) {
      setFormError(`Isi nama dan nominal di atas 0. Tanggal transaksi paling lambat ${formatDemoDate(asOf)}.`);
      return;
    }
    const linked = editing?.linkedObligationId ? obligations.find((item) => item.id === editing.linkedObligationId) : null;
    if (editing?.linkedObligationId && (!linked || amount > linked.amount - linked.settled + editing.amount)) {
      setFormError("Nominal koreksi melebihi nilai utang/piutang awal.");
      return;
    }
    const input = { date, title: editing?.linkedObligationId ? editing.title : title, amount, type: editing?.linkedObligationId ? editing.type : entryType, category: editing?.linkedObligationId ? editing.category : String(data.get("category")), method: String(data.get("method")) };
    setSaving(true);
    let saved = false;
    try { saved = await (editing ? updateEntry(editing.id, input) : addEntry(input)); } catch { saved = false; }
    setSaving(false);
    if (!saved) {
      setFormError("Catatan belum tersimpan di browser. Periksa ruang penyimpanan lalu coba lagi.");
      return;
    }
    setNotice(editing ? "Transaksi diperbarui. Saldo dan proyeksi ikut dihitung ulang." : "Transaksi ditambahkan. Saldo dan proyeksi ikut dihitung ulang.");
    setFilter("all");
    setQuery("");
    setPeriod("all");
    dialogRef.current?.close();
    setEditing(null);
  }

  return (
    <>
      <PageHeading eyebrow={`Buku kas · ${live ? "Per" : "Data contoh per"} ${formatDemoDate(asOf)}`} title="Catatan transaksi" description="Catat uang yang sudah masuk atau keluar. Perbaiki catatan jika ada nominal atau tanggal yang keliru." action={<Button onClick={openNew} className="h-11 px-4 text-sm"><CirclePlus size={17} /> Catat transaksi</Button>} />

      {notice && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#a8c7ae] bg-[#edf5ee] px-4 py-3 text-sm text-[#28513a]"><span>{notice}</span><button type="button" aria-label="Tutup pesan" onClick={() => setNotice("")} className="grid size-9 place-items-center rounded-lg hover:bg-[#dce9dd]"><X size={17} /></button></div>}

      <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label={`Ringkasan transaksi ${periodLabels[period]}`}>
        <article className={`${surface} p-4 sm:p-5`}><p className="text-sm text-muted-foreground">Uang masuk · {periodLabels[period]}</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatRupiah(summary.incoming)}</p></article>
        <article className={`${surface} p-4 sm:p-5`}><p className="text-sm text-muted-foreground">Uang keluar · {periodLabels[period]}</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatRupiah(summary.outgoing)}</p></article>
        <article className={`${surface} p-4 sm:p-5`}><p className="text-sm text-muted-foreground">Selisih kas · {periodLabels[period]}</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatSignedRupiah(summary.net)}</p></article>
      </section>

      <section className={`${surface} overflow-hidden`} aria-label="Daftar transaksi">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[auto_minmax(180px,1fr)_auto] sm:items-center sm:p-5">
          <div className="flex gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Jenis transaksi">
            {([{ id: "all", label: "Semua" }, { id: "in", label: "Masuk" }, { id: "out", label: "Keluar" }] as const).map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold sm:flex-none ${filter === item.id ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}
          </div>
          <label className="relative block"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari transaksi" aria-label="Cari transaksi" className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary" /></label>
          <label className="flex items-center gap-2 text-sm font-medium">Periode <select value={period} onChange={(event) => setPeriod(event.target.value === "all" ? "all" : Number(event.target.value) as 7 | 30)} className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm sm:flex-none"><option value="7">7 hari</option><option value="30">30 hari</option><option value="all">Semua tanggal</option></select></label>
        </div>

        {visible.length === 0 ? <div role="status" className="px-5 py-12 text-center"><p className="text-base font-semibold">{entries.length === 0 ? "Belum ada transaksi." : "Tidak ada transaksi yang cocok."}</p><p className="mt-1 text-sm text-muted-foreground">{entries.length === 0 ? "Catat transaksi pertama untuk mulai melihat saldo." : "Coba periode, jenis, atau kata pencarian lain."}</p><button type="button" onClick={entries.length === 0 ? openNew : () => { setFilter("all"); setQuery(""); setPeriod("all"); }} className="mt-4 min-h-11 rounded-lg px-4 text-sm font-semibold text-primary underline underline-offset-4">{entries.length === 0 ? "Catat transaksi" : "Tampilkan semua"}</button></div> : <>
          <div className="divide-y divide-border sm:hidden">
            {visible.map((entry) => <article key={entry.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{entry.title}</p><p className="mt-1 text-sm text-muted-foreground">{entry.dateLabel} · {entry.category}</p></div><p className={`shrink-0 text-sm font-semibold tabular-nums ${entry.type === "in" ? "text-[#285d3e]" : "text-foreground"}`}>{entry.type === "in" ? "+" : "−"}{formatRupiah(entry.amount)}</p></div><div className="mt-3 flex items-center justify-between"><span className="text-sm text-muted-foreground">{entry.method}{entry.linkedObligationId ? " · Dari utang/piutang" : ""}</span><button type="button" onClick={() => openEdit(entry)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary"><Pencil size={15} /> Koreksi</button></div></article>)}
          </div>
          <div className="hidden overflow-x-auto sm:block"><table className="w-full border-collapse text-left"><thead><tr className="border-b border-border bg-secondary/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">Tanggal</th><th className="px-4 py-3">Catatan</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Nominal</th><th className="px-5 py-3 text-right">Tindakan</th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.id} className="border-b border-border/70 last:border-0"><td className="whitespace-nowrap px-5 py-4 text-sm text-muted-foreground">{entry.dateLabel}</td><td className="px-4 py-4"><p className="text-sm font-semibold">{entry.title}</p><p className="text-xs text-muted-foreground">{entry.category} · {entry.method}</p></td><td className="px-4 py-4 text-sm">{entry.type === "in" ? <span className="inline-flex items-center gap-1 text-[#285d3e]"><ArrowDownLeft size={16} /> Masuk</span> : <span className="inline-flex items-center gap-1"><ArrowUpRight size={16} /> Keluar</span>}</td><td className="whitespace-nowrap px-4 py-4 text-sm font-semibold tabular-nums">{entry.type === "in" ? "+" : "−"}{formatRupiah(entry.amount)}</td><td className="px-5 py-4 text-right"><button type="button" onClick={() => openEdit(entry)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-secondary"><Pencil size={15} /> Koreksi</button></td></tr>)}</tbody></table></div>
        </>}
        <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">{visible.length} dari {entriesForPeriod(entries, period, asOf).length} transaksi pada periode {periodLabels[period].toLowerCase()}.</p>
      </section>

      <dialog ref={dialogRef} className="m-auto w-[calc(100%-24px)] max-w-[480px] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl">
        <form key={editing?.id ?? "new"} onSubmit={save} onChange={() => { if (formError) setFormError(""); }} onInvalidCapture={() => setFormError("Periksa kolom yang wajib diisi dan pastikan nominal lebih dari 0.")}>
          <div className="flex items-start justify-between border-b border-border p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buku kas</p><h2 className="mt-1 text-xl font-semibold">{editing ? "Koreksi transaksi" : "Catat transaksi"}</h2></div><button type="button" aria-label="Tutup formulir" onClick={() => dialogRef.current?.close()} className="grid size-11 place-items-center rounded-lg hover:bg-secondary"><X size={18} /></button></div>
          <div className="space-y-4 p-5">
            {formError && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] px-3 py-2.5 text-sm font-medium text-[#812e22]">{formError}</p>}
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1" role="group" aria-label="Jenis transaksi"><button type="button" disabled={!!editing?.linkedObligationId} aria-pressed={entryType === "in"} onClick={() => setEntryType("in")} className={`min-h-11 rounded-md text-sm font-semibold disabled:cursor-not-allowed ${entryType === "in" ? "bg-card text-[#285d3e] ring-1 ring-border" : "text-foreground"}`}>Uang masuk</button><button type="button" disabled={!!editing?.linkedObligationId} aria-pressed={entryType === "out"} onClick={() => setEntryType("out")} className={`min-h-11 rounded-md text-sm font-semibold disabled:cursor-not-allowed ${entryType === "out" ? "bg-card text-foreground ring-1 ring-border" : "text-foreground"}`}>Uang keluar</button></div>
            <label className="block text-sm font-semibold">Nama catatan<input name="title" defaultValue={editing?.title ?? ""} readOnly={!!editing?.linkedObligationId} required maxLength={80} placeholder="Contoh: Penjualan pagi" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal read-only:bg-secondary" /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Nominal (Rp)<input name="amount" defaultValue={editing?.amount ?? ""} required type="number" min="1" step="1" inputMode="numeric" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" /></label><label className="block text-sm font-semibold">Tanggal<input name="date" defaultValue={editing?.date ?? asOf} required type="date" max={asOf} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" /></label></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Kategori<select name="category" disabled={!!editing?.linkedObligationId} defaultValue={editing?.category ?? "Penjualan"} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal disabled:bg-secondary"><option>Penjualan</option><option>Pesanan</option><option>Bahan baku</option><option>Operasional</option><option>Tim</option><option>Lainnya</option><option>Pembayaran utang</option><option>Penerimaan piutang</option></select></label><label className="block text-sm font-semibold">Metode<select name="method" defaultValue={editing?.method ?? "Tunai"} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal"><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Lainnya</option></select></label></div>
            <p className="text-xs leading-5 text-muted-foreground">{editing?.linkedObligationId ? "Transaksi ini terkait utang/piutang. Koreksi nominalnya juga mengubah sisa yang belum selesai." : live ? "Transaksi tersimpan pada akun usaha ini. Koreksi akan mengubah saldo dan proyeksi." : "Data contoh tersimpan di browser ini. Koreksi transaksi mengubah saldo dan proyeksi."}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-secondary/40 p-4"><Button type="button" variant="outline" onClick={() => dialogRef.current?.close()} className="h-11">Batal</Button><Button type="submit" disabled={saving} className="h-11">{saving ? "Menyimpan…" : editing ? "Simpan koreksi" : "Simpan transaksi"}</Button></div>
        </form>
      </dialog>
    </>
  );
}
