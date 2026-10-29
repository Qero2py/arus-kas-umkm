"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, CirclePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { useDemoLedger } from "@/components/demo-ledger-provider";
import { type Obligation } from "@/lib/demo-data";
import { dateFromDemoDay, daysBetweenDates, formatDemoDate, getDueSoon, isValidIsoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";

type Filter = "semua" | "utang" | "piutang";

function dueText(item: Obligation, asOf: string) {
  const days = daysBetweenDates(asOf, item.dueDate);
  if (days < 0) return `Lewat jatuh tempo · ${item.dueLabel}`;
  if (days === 0) return `Jatuh tempo · ${item.dueLabel}`;
  return `Jatuh tempo ${item.dueLabel}`;
}

export function ObligationsView() {
  const { obligations, addObligation, updateObligation, recordPayment, asOf, live } = useDemoLedger();
  const [filter, setFilter] = useState<Filter>("semua");
  const [kind, setKind] = useState<"utang" | "piutang">("utang");
  const [paymentItem, setPaymentItem] = useState<Obligation | null>(null);
  const [editingItem, setEditingItem] = useState<Obligation | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const addRef = useRef<HTMLDialogElement>(null);
  const paymentRef = useRef<HTMLDialogElement>(null);

  const visible = useMemo(() => obligations.filter((item) => filter === "semua" || item.kind === filter).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [obligations, filter]);
  const outstanding = (type: "utang" | "piutang") => obligations.filter((item) => item.kind === type).reduce((sum, item) => sum + Math.max(item.amount - item.settled, 0), 0);
  const dueSoon = getDueSoon(obligations, asOf).length;

  function openAdd() {
    setFormError("");
    setEditingItem(null);
    setKind("utang");
    addRef.current?.showModal();
  }

  function openEdit(item: Obligation) {
    setFormError("");
    setEditingItem(item);
    setKind(item.kind);
    addRef.current?.showModal();
  }

  function openPayment(item: Obligation) {
    setFormError("");
    setPaymentItem(item);
    paymentRef.current?.showModal();
  }

  async function saveObligation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const party = String(data.get("party") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const date = String(data.get("date") ?? "");
    const dueDate = String(data.get("dueDate") ?? "");
    const amount = Number(data.get("amount"));
    if (!party || !description || !isValidIsoDate(date) || date > asOf || !isValidIsoDate(dueDate) || !Number.isSafeInteger(amount) || amount <= 0) {
      setFormError("Isi pihak terkait, keterangan, tanggal, dan nominal bilangan bulat di atas 0.");
      return;
    }
    if (editingItem && amount < editingItem.settled) {
      setFormError(`Nominal tidak boleh kurang dari ${formatRupiah(editingItem.settled)} yang sudah dibayar atau diterima.`);
      return;
    }
    setSaving(true);
    let saved = false;
    try { saved = editingItem
      ? await updateObligation(editingItem.id, { party, description, date, dueDate, amount })
      : await addObligation({ party, description, date, dueDate, amount, kind }); } catch { saved = false; }
    setSaving(false);
    if (!saved) {
      setFormError(live ? "Catatan belum tersimpan. Periksa koneksi dan coba lagi." : "Catatan belum tersimpan di browser. Periksa ruang penyimpanan lalu coba lagi.");
      return;
    }
    setNotice(`${kind === "utang" ? "Utang" : "Piutang"} ${formatRupiah(amount)} ${editingItem ? "diperbarui" : "ditambahkan"}.`);
    setFilter("semua");
    addRef.current?.close();
    setEditingItem(null);
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!paymentItem) return;
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const remaining = paymentItem.amount - paymentItem.settled;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) {
      setFormError(`Masukkan nominal di atas 0 sampai ${formatRupiah(remaining)}.`);
      return;
    }
    setSaving(true);
    let saved = false;
    try { saved = await recordPayment(paymentItem.id, amount, String(data.get("method"))); } catch { saved = false; }
    setSaving(false);
    if (!saved) {
      setFormError(live ? "Pembayaran belum tersimpan. Periksa koneksi dan sisa kewajiban, lalu coba lagi." : "Pembayaran belum tersimpan di browser. Coba lagi.");
      return;
    }
    setNotice(`${paymentItem.kind === "utang" ? "Pembayaran" : "Penerimaan"} ${formatRupiah(amount)} dicatat. Sisa dan saldo kas ikut diperbarui.`);
    paymentRef.current?.close();
    setPaymentItem(null);
  }

  return (
    <>
      <PageHeading eyebrow={`Utang & piutang · ${live ? "Per" : "Data contoh per"} ${formatDemoDate(asOf)}`} title="Yang akan masuk dan keluar." description="Catat jumlah yang belum selesai. Pembayaran dan penerimaan akan masuk ke buku kas secara otomatis." action={<Button onClick={openAdd} className="h-11 px-4 text-sm"><CirclePlus size={17} /> Catat utang/piutang</Button>} />

      {notice && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#a8c7ae] bg-[#edf5ee] px-4 py-3 text-sm text-[#28513a]"><span>{notice}</span><button type="button" aria-label="Tutup pesan" onClick={() => setNotice("")} className="grid size-9 place-items-center rounded-lg hover:bg-[#dce9dd]"><X size={17} /></button></div>}

      <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Ringkasan utang dan piutang">
        <article className="rounded-xl border border-border bg-card p-4 sm:p-5"><p className="text-sm text-muted-foreground">Utang belum dibayar</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatRupiah(outstanding("utang"))}</p></article>
        <article className="rounded-xl border border-border bg-card p-4 sm:p-5"><p className="text-sm text-muted-foreground">Piutang belum diterima</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatRupiah(outstanding("piutang"))}</p></article>
        <article className="rounded-xl border border-border bg-card p-4 sm:p-5"><p className="text-sm text-muted-foreground">Utang perlu ditinjau</p><p className="mt-2 text-xl font-semibold tabular-nums">{dueSoon} <span className="text-sm font-normal">catatan</span></p><p className="mt-1 text-xs text-muted-foreground">Sudah lewat atau jatuh tempo dalam 3 hari</p></article>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Daftar utang dan piutang">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5"><div><h2 className="text-base font-semibold">Daftar catatan</h2><p className="mt-1 text-sm text-muted-foreground">Sisa dihitung setelah pembayaran yang dicatat.</p></div><div className="flex gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Jenis catatan">{([{ id: "semua", label: "Semua" }, { id: "utang", label: "Utang" }, { id: "piutang", label: "Piutang" }] as const).map((option) => <button type="button" key={option.id} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)} className={`min-h-11 rounded-md px-3 text-sm font-semibold ${filter === option.id ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground"}`}>{option.label}</button>)}</div></div>
        {visible.length === 0 ? <div role="status" className="px-5 py-12 text-center"><p className="text-base font-semibold">{obligations.length === 0 ? "Belum ada utang atau piutang." : "Tidak ada catatan untuk jenis ini."}</p><p className="mt-1 text-sm text-muted-foreground">{obligations.length === 0 ? "Tambahkan catatan pertama agar tanggal jatuh tempo mudah dipantau." : "Pilih jenis lain untuk melihat catatan."}</p><Button type="button" onClick={openAdd} className="mt-4 h-11">Catat utang/piutang</Button></div> : <div className="divide-y divide-border">{visible.map((item) => {
          const remaining = Math.max(item.amount - item.settled, 0);
          const days = daysBetweenDates(asOf, item.dueDate);
          return <article key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(130px,.7fr)_minmax(160px,.8fr)_auto] sm:items-center sm:p-5">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-base font-semibold">{item.kind === "utang" ? <ArrowUpRight size={18} aria-hidden="true" /> : <ArrowDownLeft size={18} aria-hidden="true" />}{item.party}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.kind === "utang" ? "Utang" : "Piutang"} · {item.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">Tanggal catatan: {formatDemoDate(item.date)}</p>
            </div>
            <div><p className="text-xs text-muted-foreground">Sisa</p><p className="mt-1 text-sm font-semibold tabular-nums">{formatRupiah(remaining)}</p><p className="text-xs text-muted-foreground">dari {formatRupiah(item.amount)}</p></div>
            <div><p className="text-xs text-muted-foreground">Status: {remaining === 0 ? "Lunas" : item.settled > 0 ? "Sebagian" : item.kind === "utang" ? "Belum dibayar" : "Belum diterima"}</p><p className={`mt-1 text-sm font-medium ${remaining > 0 && days <= 3 ? "text-[#8c382b]" : "text-foreground"}`}>{remaining === 0 ? "Lunas" : dueText(item, asOf)}</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openEdit(item)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary">Ubah</button>{remaining > 0 && <button type="button" onClick={() => openPayment(item)} className="min-h-11 rounded-lg border border-primary px-3 text-sm font-semibold text-primary hover:bg-secondary">Catat {item.kind === "utang" ? "pembayaran" : "penerimaan"}</button>}</div>
          </article>;
        })}</div>}
      </section>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">Pembayaran sebagian mengurangi sisa. Setiap pembayaran juga muncul sebagai transaksi kas pada {live ? "tanggal hari ini" : "tanggal data contoh"}.</p>

      <dialog ref={addRef} className="m-auto w-[calc(100%-24px)] max-w-[480px] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl">
        <form key={editingItem?.id ?? "new"} onSubmit={saveObligation} onChange={() => { if (formError) setFormError(""); }} onInvalidCapture={() => setFormError("Periksa kembali kolom wajib dan nominalnya.")}>
          <div className="flex items-center justify-between border-b border-border p-5"><h2 className="text-xl font-semibold">{editingItem ? "Ubah utang/piutang" : "Catat utang/piutang"}</h2><button type="button" aria-label="Tutup formulir" onClick={() => addRef.current?.close()} className="grid size-11 place-items-center rounded-lg hover:bg-secondary"><X size={18} /></button></div>
          <div className="space-y-4 p-5">
            {formError && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] p-3 text-sm font-medium text-[#812e22]">{formError}</p>}
            {editingItem ? <p className="text-sm text-muted-foreground">Jenis {kind === "utang" ? "utang" : "piutang"} tidak dapat diubah setelah dicatat.</p> : <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1"><button type="button" aria-pressed={kind === "utang"} onClick={() => setKind("utang")} className={`min-h-11 rounded-md text-sm font-semibold ${kind === "utang" ? "bg-card ring-1 ring-border" : ""}`}>Utang · keluar</button><button type="button" aria-pressed={kind === "piutang"} onClick={() => setKind("piutang")} className={`min-h-11 rounded-md text-sm font-semibold ${kind === "piutang" ? "bg-card ring-1 ring-border" : ""}`}>Piutang · masuk</button></div>}
            <label className="block text-sm font-semibold">Pihak terkait<input name="party" required maxLength={80} defaultValue={editingItem?.party ?? ""} placeholder="Nama pemasok atau pelanggan" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" /></label>
            <label className="block text-sm font-semibold">Keterangan<input name="description" required maxLength={100} defaultValue={editingItem?.description ?? ""} placeholder="Contoh: Bahan baku mingguan" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" /></label>
            <label className="block text-sm font-semibold">Nominal (Rp)<input name="amount" required type="number" min={Math.max(editingItem?.settled ?? 0, 1)} step="1" inputMode="numeric" defaultValue={editingItem?.amount} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Tanggal catatan<input name="date" required type="date" max={asOf} defaultValue={editingItem?.date ?? asOf} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" /></label><label className="block text-sm font-semibold">Jatuh tempo<input name="dueDate" required type="date" defaultValue={editingItem?.dueDate ?? dateFromDemoDay(5, asOf)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" /></label></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-secondary/40 p-4"><Button type="button" variant="outline" onClick={() => addRef.current?.close()}>Batal</Button><Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : editingItem ? "Simpan perubahan" : "Simpan catatan"}</Button></div>
        </form>
      </dialog>

      <dialog ref={paymentRef} className="m-auto w-[calc(100%-24px)] max-w-[480px] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl"><form key={paymentItem?.id ?? "none"} onSubmit={savePayment} onChange={() => { if (formError) setFormError(""); }} onInvalidCapture={() => setFormError(`Masukkan nominal ${paymentItem?.kind === "utang" ? "pembayaran" : "penerimaan"} yang valid.`)}><div className="flex items-center justify-between border-b border-border p-5"><h2 className="text-xl font-semibold">{paymentItem?.kind === "utang" ? "Catat pembayaran" : "Catat penerimaan"}</h2><button type="button" aria-label="Tutup formulir" onClick={() => paymentRef.current?.close()} className="grid size-11 place-items-center rounded-lg hover:bg-secondary"><X size={18} /></button></div><div className="space-y-4 p-5"><p className="text-sm leading-6 text-muted-foreground">{paymentItem?.party} · sisa {formatRupiah(Math.max((paymentItem?.amount ?? 0) - (paymentItem?.settled ?? 0), 0))}</p>{formError && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] p-3 text-sm font-medium text-[#812e22]">{formError}</p>}<label className="block text-sm font-semibold">Nominal yang {paymentItem?.kind === "utang" ? "dibayar" : "diterima"} (Rp)<input name="amount" required type="number" min="1" max={Math.max((paymentItem?.amount ?? 0) - (paymentItem?.settled ?? 0), 0)} step="1" inputMode="numeric" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" /></label><label className="block text-sm font-semibold">Metode<select name="method" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal"><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Lainnya</option></select></label><p className="text-xs leading-5 text-muted-foreground">Tanggal transaksi: {formatDemoDate(asOf)}. Nominal yang dicatat akan langsung mengubah saldo.</p></div><div className="flex justify-end gap-2 border-t border-border bg-secondary/40 p-4"><Button type="button" variant="outline" onClick={() => paymentRef.current?.close()}>Batal</Button><Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : `Simpan ${paymentItem?.kind === "utang" ? "pembayaran" : "penerimaan"}`}</Button></div></form></dialog>
    </>
  );
}
