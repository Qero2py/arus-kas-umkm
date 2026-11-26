"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postOpeningBalances } from "@/app/actions/accounting";
import { searchAccountingContacts } from "@/app/actions/accounting-credit";
import { PageHeading } from "@/components/page-heading";
import type { Account, JournalLine } from "@/lib/accounting";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import { validateOpeningCreditDetails, type OpeningCreditDetail } from "@/lib/opening-credits";

type ContactMatch = { id: string; name: string; kind: "customer" | "supplier" | "both" };
type CreditDraft = Omit<OpeningCreditDetail, "amount"> & {
  key: string; contactQuery: string; matches: ContactMatch[]; amount: string;
};

export function AccountingOpeningView({ accounts, today, locked, openingDate }: {
  accounts: Account[]; today: string; locked: boolean; openingDate: string | null;
}) {
  const router = useRouter();
  const eligible = accounts.filter((account) => account.active
    && ["asset", "liability", "equity"].includes(account.class) && account.role !== "drawings");
  const [date, setDate] = useState(today);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [credits, setCredits] = useState<CreditDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const preview = eligible.map((account) => ({ account, value: Number(amounts[account.code] || 0) }));
  const debit = preview.filter(({ account }) => account.normal === "debit").reduce((sum, row) => sum + row.value, 0);
  const credit = preview.filter(({ account }) => account.normal === "credit").reduce((sum, row) => sum + row.value, 0);
  const receivable = preview.filter(({ account }) => account.role === "receivable")
    .reduce((sum, row) => sum + row.value, 0);
  const payable = preview.filter(({ account }) => account.role === "payable")
    .reduce((sum, row) => sum + row.value, 0);
  const detailedReceivable = credits.filter((item) => item.kind === "sale")
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const detailedPayable = credits.filter((item) => item.kind === "purchase")
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  function updateCredit(key: string, patch: Partial<CreditDraft>) {
    setCredits((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function addCredit(kind: CreditDraft["kind"]) {
    const controlAccountCode = eligible.find((account) => account.role === (kind === "sale" ? "receivable" : "payable"))?.code ?? "";
    setCredits((current) => [...current, { key: crypto.randomUUID(), kind, contactId: "", contactQuery: "",
      matches: [], documentNo: "", issueDate: date, dueDate: date,
      description: "", amount: "", controlAccountCode }]);
  }

  async function findContact(item: CreditDraft) {
    try {
      const result = await searchAccountingContacts(item.contactQuery, item.kind);
      if (!result.ok) { setError(result.message); return; }
      updateCredit(item.key, { matches: result.contacts });
      if (!result.contacts.length) setError("Kontak tidak ditemukan. Tambahkan dahulu pada halaman Kontak.");
      else setError("");
    } catch {
      setError("Pencarian kontak belum berhasil. Coba lagi.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const invalid = preview.some(({ value }) => !Number.isSafeInteger(value) || value < 0);
    if (invalid || !Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)
      || debit <= 0 || debit !== credit) {
      setError("Isi nominal Rupiah bulat dan pastikan total debit sama dengan kredit.");
      return;
    }
    const lines: JournalLine[] = preview.filter(({ value }) => value > 0).map(({ account, value }) => ({
      accountCode: account.code, debit: account.normal === "debit" ? value : 0,
      credit: account.normal === "credit" ? value : 0,
    }));
    if (lines.length < 2) {
      setError("Saldo pembuka memerlukan sedikitnya dua akun.");
      return;
    }
    const documents: OpeningCreditDetail[] = credits.map((item) => ({ kind: item.kind,
      contactId: item.contactId, documentNo: item.documentNo.trim().toUpperCase(),
      issueDate: item.issueDate, dueDate: item.dueDate,
      description: item.description.trim(), amount: Number(item.amount),
      controlAccountCode: item.controlAccountCode }));
    try {
      validateOpeningCreditDetails(date, lines, accounts, documents);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Rincian tagihan pembuka tidak valid.");
      return;
    }
    if (!window.confirm("Saldo pembuka hanya dapat dibukukan sekali sebelum transaksi pertama. Pastikan angkanya sudah diperiksa. Lanjutkan?")) return;
    setSaving(true);
    setError("");
    try {
      const result = await postOpeningBalances({ date, lines, documents });
      if (!result.ok) setError(result.message);
      else router.refresh();
    } catch {
      setError("Saldo pembuka belum tersimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHeading eyebrow="Akuntansi · Pengaturan awal" title="Saldo pembuka"
      description="Masukkan posisi aset, utang, dan modal saat mulai memakai buku akuntansi. Periksa data lama sebelum membukukan saldo ini." />
    {locked ? <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">{openingDate ? "Saldo pembuka sudah dibukukan" : "Pembukuan dimulai dari saldo nol"}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{openingDate
        ? `Tanggal saldo pembuka: ${formatDemoDate(openingDate)}. Lihat hasilnya pada buku besar dan neraca saldo.`
        : "Transaksi akuntansi sudah dimulai tanpa jurnal saldo pembuka. Jurnal pembuka tidak dapat ditambahkan setelah transaksi pertama."}</p>
      <Link href="/accounting/reports" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Lihat laporan</Link>
    </section> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]">
      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <label className="block max-w-xs text-sm font-medium">Tanggal mulai pembukuan
          <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} required
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        </label>
        <div className="mt-6 divide-y divide-border/70">
          {eligible.map((account) => <label key={account.code} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
            <span className="text-sm font-medium"><span className="mr-2 font-mono text-xs text-primary">{account.code}</span>{account.name}
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Saldo {account.normal === "debit" ? "debit" : "kredit"}</span>
            </span>
            <input type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" inputMode="numeric" placeholder="0"
              value={amounts[account.code] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [account.code]: event.target.value }))}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-right text-sm tabular-nums" />
          </label>)}
        </div>
        <section className="mt-7 border-t border-border pt-6">
          <h2 className="text-base font-semibold">Rincian piutang dan utang pembuka</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Isi sisa tagihan per pelanggan atau pemasok. Nominal ini sudah termasuk dalam akun piutang/utang di atas; tidak akan dicatat sebagai penjualan atau pembelian baru. Tambahkan pihaknya lebih dulu di <Link href="/accounting/contacts" className="font-semibold text-primary underline">Kontak</Link>.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => addCredit("sale")} className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold">Tambah piutang</button>
            <button type="button" onClick={() => addCredit("purchase")} className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold">Tambah utang</button>
          </div>
          <div className="mt-4 space-y-4">{credits.map((item) => <div key={item.key} className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{item.kind === "sale" ? "Piutang pelanggan" : "Utang pemasok"}</h3>
              <button type="button" onClick={() => setCredits((current) => current.filter((row) => row.key !== item.key))} className="text-xs font-semibold text-[#812e22]">Hapus</button></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="text-xs font-medium">Cari nama pihak<input value={item.contactQuery} onChange={(event) => updateCredit(item.key, { contactQuery: event.target.value, contactId: "", matches: [] })}
                placeholder="Ketik sedikitnya dua huruf" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label>
                <button type="button" onClick={() => findContact(item)} className="mt-2 min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">Cari kontak</button></div>
              <label className="text-xs font-medium">Pihak<select value={item.contactId} onChange={(event) => updateCredit(item.key, { contactId: event.target.value })} required className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">Pilih kontak</option>{item.matches.map((match) => <option key={match.id} value={match.id}>{match.name}</option>)}
              </select></label>
              <label className="text-xs font-medium">Akun {item.kind === "sale" ? "piutang" : "utang"}<select value={item.controlAccountCode} onChange={(event) => updateCredit(item.key, { controlAccountCode: event.target.value })} required className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {eligible.filter((account) => account.role === (item.kind === "sale" ? "receivable" : "payable"))
                  .map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}
              </select></label>
              <label className="text-xs font-medium">Nomor tagihan<input value={item.documentNo} onChange={(event) => updateCredit(item.key, { documentNo: event.target.value.toUpperCase() })} required maxLength={40} placeholder="INV-LAMA-001" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label>
              <label className="text-xs font-medium">Sisa tagihan (Rp)<input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={item.amount} onChange={(event) => updateCredit(item.key, { amount: event.target.value })} required className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-right text-sm" /></label>
              <label className="text-xs font-medium">Tanggal tagihan<input type="date" max={date} value={item.issueDate} onChange={(event) => updateCredit(item.key, { issueDate: event.target.value })} required className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label>
              <label className="text-xs font-medium">Jatuh tempo<input type="date" min={item.issueDate} value={item.dueDate} onChange={(event) => updateCredit(item.key, { dueDate: event.target.value })} required className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label>
              <label className="text-xs font-medium sm:col-span-2">Keterangan<input value={item.description} onChange={(event) => updateCredit(item.key, { description: event.target.value })} required maxLength={250} placeholder="Rincian tagihan yang masih terbuka" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label>
            </div>
          </div>)}</div>
        </section>
        <button type="submit" disabled={saving} className="mt-5 min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Membukukan…" : "Bukukan saldo pembuka"}</button>
        {error && <p role="alert" className="mt-4 text-sm text-[#812e22]">{error}</p>}
      </form>
      <aside className="h-fit rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Pemeriksaan keseimbangan</h2>
        <dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt>Total debit</dt><dd className="font-semibold tabular-nums">{formatRupiah(debit)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Total kredit</dt><dd className="font-semibold tabular-nums">{formatRupiah(credit)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Piutang / rincian</dt><dd className="text-right tabular-nums">{formatRupiah(receivable)} / {formatRupiah(detailedReceivable)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Utang / rincian</dt><dd className="text-right tabular-nums">{formatRupiah(payable)} / {formatRupiah(detailedPayable)}</dd></div></dl>
        <p className={`mt-4 rounded-lg p-3 text-xs font-medium ${debit > 0 && debit === credit ? "bg-[#edf5ee] text-[#356548]" : "bg-[#f8f3e8] text-[#594c35]"}`}>
          {debit > 0 && debit === credit ? "Debit dan kredit seimbang." : "Isi aset di sisi debit serta utang dan modal di sisi kredit hingga sama besar."}
        </p>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Rincian piutang/utang wajib sama dengan saldo masing-masing akun. Akun pendapatan, beban, dan prive tidak digunakan sebagai saldo pembuka. Buku kas lama tidak otomatis menjadi jurnal akuntansi.</p>
      </aside>
    </div>}
  </>;
}
