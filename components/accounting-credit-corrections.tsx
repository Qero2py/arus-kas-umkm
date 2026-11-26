"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { correctAccountingCreditDocument, correctAccountingCreditPayment } from "@/app/actions/accounting-credit";
import { formatRupiah } from "@/lib/format";
import type { Account } from "@/lib/accounting";
import type { CreditDocument, CreditPayment } from "@/lib/supabase/accounting-credit";

const field = "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function AccountingCreditCorrections({ documents, payments, accounts, today }: {
  documents: CreditDocument[]; payments: CreditPayment[]; accounts: Account[]; today: string;
}) {
  const router = useRouter();
  const documentRequestId = useRef<string | null>(null);
  const paymentRequestId = useRef<string | null>(null);
  const [documentId, setDocumentId] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [documentAmount, setDocumentAmount] = useState("");
  const [documentDueDate, setDocumentDueDate] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [documentReason, setDocumentReason] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCash, setPaymentCash] = useState("");
  const [paymentReason, setPaymentReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedDocument = documents.find((row) => row.id === documentId);
  const selectedPayment = payments.find((row) => row.id === paymentId);
  const paymentDocument = documents.find((row) => row.id === selectedPayment?.documentId);

  function chooseDocument(id: string) {
    const row = documents.find((item) => item.id === id);
    setDocumentId(id); setDocumentDate(row?.issueDate ?? "");
    setDocumentAmount(row ? String(row.amount) : "");
    setDocumentDueDate(row?.dueDate ?? ""); setDocumentDescription(row?.description ?? "");
    setDocumentReason(""); documentRequestId.current = null; setError(""); setNotice("");
  }
  function choosePayment(id: string) {
    const row = payments.find((item) => item.id === id);
    setPaymentId(id); setPaymentDate(row?.paidDate ?? "");
    setPaymentAmount(row ? String(row.amount) : ""); setPaymentCash(row?.cashAccountCode ?? "");
    setPaymentReason(""); paymentRequestId.current = null; setError(""); setNotice("");
  }
  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDocument || saving) return;
    const amount = Number(documentAmount);
    if (!Number.isSafeInteger(amount) || amount < selectedDocument.paid || amount <= 0
      || documentDate < selectedDocument.issueDate || documentDate > today
      || documentDate.slice(0, 7) !== selectedDocument.issueDate.slice(0, 7)
      || documentDueDate < selectedDocument.issueDate || documentReason.trim().length < 10) {
      setError("Periksa nominal minimal pembayaran, tanggal pada bulan dokumen, dan alasan minimal 10 karakter.");
      return;
    }
    documentRequestId.current ??= crypto.randomUUID();
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await correctAccountingCreditDocument({
        correctionId: documentRequestId.current, documentId, correctionDate: documentDate,
        reason: documentReason, amount, dueDate: documentDueDate, description: documentDescription,
      });
      if (!result.ok) setError(result.message);
      else { documentRequestId.current = null; setDocumentId("");
        setNotice("Dokumen terkoreksi; jurnal pembalik dan pengganti sudah dibukukan."); router.refresh(); }
    } catch { setError("Hasil koreksi belum diketahui. Muat ulang daftar sebelum mencoba lagi."); }
    finally { setSaving(false); }
  }
  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPayment || !paymentDocument || saving) return;
    const amount = Number(paymentAmount);
    const maximum = paymentDocument.amount - paymentDocument.paid + selectedPayment.amount;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > maximum
      || paymentDate < selectedPayment.paidDate || paymentDate > today
      || paymentDate.slice(0, 7) !== selectedPayment.paidDate.slice(0, 7)
      || paymentReason.trim().length < 10 || !paymentCash) {
      setError("Periksa nominal maksimal sisa dokumen, tanggal pada bulan pembayaran, akun kas, dan alasan.");
      return;
    }
    paymentRequestId.current ??= crypto.randomUUID();
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await correctAccountingCreditPayment({
        correctionId: paymentRequestId.current, paymentId, correctionDate: paymentDate,
        reason: paymentReason, amount, cashAccountCode: paymentCash,
      });
      if (!result.ok) setError(result.message);
      else { paymentRequestId.current = null; setPaymentId("");
        setNotice("Pembayaran terkoreksi; jurnal pembalik dan pengganti sudah dibukukan."); router.refresh(); }
    } catch { setError("Hasil koreksi belum diketahui. Muat ulang daftar sebelum mencoba lagi."); }
    finally { setSaving(false); }
  }

  return <section className="mt-5 rounded-xl border border-border bg-card p-5 sm:p-6">
    <h2 className="text-lg font-semibold">Koreksi dokumen & pembayaran tempo</h2>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">Koreksi dalam bulan yang masih terbuka membuat jurnal pembalik dan pengganti. Dokumen stok atau aset tetap dikoreksi dari modulnya agar nilai pendukung tetap cocok.</p>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <form onSubmit={submitDocument} className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="font-semibold">Koreksi dokumen biasa</h3>
        <label className="block text-sm font-medium">Dokumen
          <select className={field} value={documentId} onChange={(event) => chooseDocument(event.target.value)} required>
            <option value="">Pilih dokumen pendapatan/beban</option>
            {documents.filter((row) => row.correctable).map((row) => <option key={row.id} value={row.id}>{row.documentNo} · {row.contactName}</option>)}
          </select>
        </label>
        {selectedDocument && <>
          <p className="rounded-lg bg-secondary p-3 text-xs">Dibayar {formatRupiah(selectedDocument.paid)} · Nominal baru tidak boleh lebih kecil.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Tanggal koreksi<input type="date" required min={selectedDocument.issueDate} max={today} value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} className={field} /></label>
            <label className="text-sm font-medium">Nominal baru<input type="number" required min={Math.max(1, selectedDocument.paid)} max={Number.MAX_SAFE_INTEGER} step="1" value={documentAmount} onChange={(event) => setDocumentAmount(event.target.value)} className={field} /></label>
            <label className="text-sm font-medium">Jatuh tempo baru<input type="date" required min={selectedDocument.issueDate} value={documentDueDate} onChange={(event) => setDocumentDueDate(event.target.value)} className={field} /></label>
          </div>
          <label className="block text-sm font-medium">Keterangan baru<input required maxLength={250} value={documentDescription} onChange={(event) => setDocumentDescription(event.target.value)} className={field} /></label>
          <label className="block text-sm font-medium">Alasan<textarea required minLength={10} maxLength={500} rows={2} value={documentReason} onChange={(event) => setDocumentReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-background p-3" /></label>
          <button disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Membukukan…" : "Bukukan koreksi dokumen"}</button>
        </>}
      </form>
      <form onSubmit={submitPayment} className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="font-semibold">Koreksi pembayaran</h3>
        <label className="block text-sm font-medium">Pembayaran
          <select className={field} value={paymentId} onChange={(event) => choosePayment(event.target.value)} required>
            <option value="">Pilih pembayaran</option>
            {payments.map((row) => <option key={row.id} value={row.id}>{documents.find((doc) => doc.id === row.documentId)?.documentNo ?? "Dokumen"} · {row.paidDate} · {formatRupiah(row.amount)}</option>)}
          </select>
        </label>
        {selectedPayment && paymentDocument && <>
          <p className="rounded-lg bg-secondary p-3 text-xs">Nominal maksimal setelah koreksi: {formatRupiah(paymentDocument.amount - paymentDocument.paid + selectedPayment.amount)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Tanggal koreksi<input type="date" required min={selectedPayment.paidDate} max={today} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={field} /></label>
            <label className="text-sm font-medium">Nominal baru<input type="number" required min="1" max={paymentDocument.amount - paymentDocument.paid + selectedPayment.amount} step="1" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className={field} /></label>
          </div>
          <label className="block text-sm font-medium">Akun kas/bank<select required value={paymentCash} onChange={(event) => setPaymentCash(event.target.value)} className={field}><option value="">Pilih akun</option>{accounts.filter((account) => account.active && account.role === "cash").map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Alasan<textarea required minLength={10} maxLength={500} rows={2} value={paymentReason} onChange={(event) => setPaymentReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-background p-3" /></label>
          <button disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Membukukan…" : "Bukukan koreksi pembayaran"}</button>
        </>}
      </form>
    </div>
    {notice && <p role="status" className="mt-4 rounded-lg bg-[#e7f3e8] p-3 text-sm text-[#356548]">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#fff0ed] p-3 text-sm text-[#812e22]">{error}</p>}
  </section>;
}
