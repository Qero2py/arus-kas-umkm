"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { closeAccountingPeriod, correctBasicAccountingJournal } from "@/app/actions/accounting-controls";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import type { Account } from "@/lib/accounting";
import type { BasicJournalRow, CorrectionHistoryRow, PeriodClosureRow } from "@/lib/supabase/accounting-controls";

const names: Record<string, string> = {
  cash_sale: "Pendapatan tunai", cash_expense: "Beban tunai",
  capital_contribution: "Setoran modal", owner_draw: "Prive pemilik",
  cash_transfer: "Transfer kas/bank",
};
const roles: Record<string, [Account["role"], Account["role"]]> = {
  cash_sale: ["cash", "revenue"], cash_expense: ["expense", "cash"],
  capital_contribution: ["cash", "capital"], owner_draw: ["drawings", "cash"],
  cash_transfer: ["cash", "cash"],
};

export function AccountingControlsView({ today, nextClosableMonth, closures, journals, history, accounts }: {
  today: string; nextClosableMonth: string; closures: PeriodClosureRow[];
  journals: BasicJournalRow[]; history: CorrectionHistoryRow[]; accounts: Account[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<BasicJournalRow | null>(null);
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [debitCode, setDebitCode] = useState("");
  const [creditCode, setCreditCode] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function choose(row: BasicJournalRow) {
    setSelected(row);
    setDate(row.entryDate);
    setDescription(row.description);
    setAmount(String(row.amount));
    setDebitCode(row.debitCode);
    setCreditCode(row.creditCode);
    setReason("");
    setError("");
    setNotice("");
  }

  async function closeMonth() {
    if (!nextClosableMonth || !confirmed || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await closeAccountingPeriod(nextClosableMonth);
      if (!result.ok) setError(result.message);
      else { setConfirmed(false); setSelected(null); setNotice("Periode berhasil ditutup."); router.refresh(); }
    } catch { setError("Periode belum ditutup. Periksa koneksi lalu coba lagi."); }
    finally { setBusy(false); }
  }

  async function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0 || debitCode === creditCode
      || date < selected.entryDate || date.slice(0, 7) !== selected.entryDate.slice(0, 7)
      || date > today || reason.trim().length < 10) {
      setError("Periksa nominal, akun, alasan minimal 10 karakter, dan tanggal dalam bulan jurnal asal.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await correctBasicAccountingJournal({
        originalJournalId: selected.id, correctionId: crypto.randomUUID(), date,
        reason: reason.trim(), description: description.trim(), amount: value, debitCode, creditCode,
      });
      if (!result.ok) setError(result.message);
      else { setSelected(null); setNotice("Koreksi dibukukan. Jurnal asal, pembalik, dan pengganti tersedia di buku besar."); router.refresh(); }
    } catch { setError("Koreksi belum dibukukan. Periksa koneksi lalu coba lagi."); }
    finally { setBusy(false); }
  }

  const options = (role: Account["role"]) => accounts.filter((account) => account.active && account.role === role);
  const currentRoles = selected ? roles[selected.type] : null;

  return <div className="space-y-6">
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Tutup bulan</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Periksa neraca saldo dan transaksi sebelum menutup bulan. Bulan yang ditutup tidak dapat dibuka kembali melalui aplikasi; transaksi bertanggal pada bulan itu akan ditolak.</p>
      {nextClosableMonth ? <div className="mt-4 space-y-3">
        <p className="text-sm">Bulan berikutnya: <strong>{new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${nextClosableMonth}T00:00:00Z`))}</strong></p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />Saya sudah memeriksa jurnal dan neraca saldo bulan ini.</label>
        <button type="button" onClick={closeMonth} disabled={!confirmed || busy}
          className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Memproses…" : "Tutup bulan ini"}</button>
      </div> : <p className="mt-4 text-sm text-muted-foreground">Belum ada bulan lampau yang siap ditutup. Pembukuan dimulai dari bulan jurnal pertama.</p>}
      {closures.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Bulan tertutup</th><th className="py-2 text-right">Jurnal</th><th className="py-2 text-right">Total debit/kredit</th><th className="py-2 text-right">Ditutup</th></tr></thead>
        <tbody>{closures.map((row) => <tr key={row.periodMonth} className="border-b border-border/60"><td className="py-2">{row.periodMonth.slice(0, 7)}</td><td className="py-2 text-right">{row.journalCount}</td><td className="py-2 text-right tabular-nums">{formatRupiah(row.totalDebit)}</td><td className="py-2 text-right">{new Date(row.closedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td></tr>)}</tbody>
      </table></div>}
    </section>

    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Koreksi transaksi kas umum</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Pilih jurnal pada periode terbuka. Koreksi memakai tanggal dalam bulan jurnal asal; catatan lama tetap terlihat. Koreksi dokumen tempo, stok, dan aset tetap tersedia pada modul masing-masing sesuai syarat transaksinya.</p>
      {journals.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-sm">
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Tanggal</th><th className="py-2">Transaksi</th><th className="py-2 text-right">Nominal</th><th className="py-2 text-right">Tindakan</th></tr></thead>
        <tbody>{journals.map((row) => <tr key={row.id} className="border-b border-border/60"><td className="py-3">{formatDemoDate(row.entryDate)}</td><td className="py-3"><span className="font-medium">{row.description}</span><span className="block text-xs text-muted-foreground">{names[row.type] ?? row.type}</span></td><td className="py-3 text-right tabular-nums">{formatRupiah(row.amount)}</td><td className="py-3 text-right">{row.closed ? "Tertutup" : row.corrected ? "Sudah dikoreksi" : <button type="button" onClick={() => choose(row)} className="font-medium text-primary underline">Koreksi</button>}</td></tr>)}</tbody>
      </table></div> : <p className="mt-4 text-sm text-muted-foreground">Belum ada transaksi kas umum.</p>}
    </section>

    {selected && currentRoles && <form onSubmit={correct} className="space-y-4 rounded-xl border border-primary/30 bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Pengganti: {names[selected.type]}</h2>
      <p className="text-xs text-muted-foreground">Jurnal asal {selected.id}. Catatan pembalik dibuat otomatis.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Tanggal koreksi<input type="date" required min={selected.entryDate} max={today} value={date} onChange={(event) => setDate(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
        <label className="text-sm font-medium">Nominal pengganti (Rp)<input type="number" required min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
      </div>
      <label className="block text-sm font-medium">Keterangan pengganti<input required maxLength={250} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Akun debit<select required value={debitCode} onChange={(event) => setDebitCode(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3"><option value="" disabled hidden>Pilih akun</option>{options(currentRoles[0]).map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select></label>
        <label className="text-sm font-medium">Akun kredit<select required value={creditCode} onChange={(event) => setCreditCode(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3"><option value="" disabled hidden>Pilih akun</option>{options(currentRoles[1]).map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select></label>
      </div>
      <label className="block text-sm font-medium">Alasan koreksi<textarea required minLength={10} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan data yang salah dan perubahan yang dibuat" className="mt-1.5 w-full rounded-lg border border-border bg-background p-3" /></label>
      <button disabled={busy} type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Membukukan…" : "Bukukan koreksi"}</button>
    </form>}

    {notice && <p role="status" className="rounded-lg bg-[#e7f3e8] p-4 text-sm text-[#356548]">{notice}</p>}
    {error && <p role="alert" className="rounded-lg bg-[#fff0ed] p-4 text-sm text-[#812e22]">{error}</p>}
    {history.length > 0 && <section className="rounded-xl border border-border bg-card p-5 sm:p-6"><h2 className="text-lg font-semibold">Jejak koreksi terbaru</h2><ul className="mt-3 divide-y divide-border text-sm">{history.map((row) => <li key={row.id} className="py-3"><strong>{formatDemoDate(row.date)}</strong> · {row.reason}<span className="block text-xs text-muted-foreground">Jurnal asal {row.originalJournalId} · Dicatat {new Date(row.correctedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</span></li>)}</ul></section>}
  </div>;
}
