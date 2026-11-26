"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { createAccountingCreditDocument, recordAccountingCreditPayment } from "@/app/actions/accounting-credit";
import { ContactPicker } from "@/components/contact-picker";
import { PageHeading } from "@/components/page-heading";
import type { Account } from "@/lib/accounting";
import { formatRupiah } from "@/lib/format";
import type { CreditDocument } from "@/lib/supabase/accounting-credit";

const fieldClass = "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const todayPlus = (today: string, days: number) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

function AccountChoice({ label, role, roles, accounts, value, onChange }: {
  label: string; role?: Account["role"]; roles?: Account["role"][]; accounts: Account[];
  value: string; onChange: (code: string) => void;
}) {
  const allowed = roles ?? (role ? [role] : []);
  return <label className="block text-sm font-medium">{label}
    <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)} required>
      {!value && <option value="" disabled hidden>Pilih akun</option>}
      {accounts.filter((account) => account.active && allowed.includes(account.role)).map((account) =>
        <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}
    </select>
  </label>;
}

export function AccountingCreditView({ documents, accounts, businessName, inventoryActive, assetActive, today }: {
  documents: CreditDocument[]; accounts: Account[]; businessName: string;
  inventoryActive: boolean; assetActive: boolean; today: string;
}) {
  const router = useRouter();
  const [kind] = useState<"sale" | "purchase">("purchase");
  const [contactId, setContactId] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(todayPlus(today, 7));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [recognition, setRecognition] = useState("");
  const [control, setControl] = useState("");
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const documentId = useRef<string | null>(null);

  const [paymentDocumentId, setPaymentDocumentId] = useState("");
  const [paidDate, setPaidDate] = useState(today);
  const [paidAmount, setPaidAmount] = useState("");
  const [cashAccount, setCashAccount] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const paymentId = useRef<string | null>(null);
  const selectedDocument = documents.find((item) => item.id === paymentDocumentId);

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (documentSaving) return;
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0 || !contactId) {
      setDocumentError("Pilih kontak dan isi nominal Rupiah bulat lebih dari nol.");
      return;
    }
    documentId.current ??= crypto.randomUUID();
    setDocumentSaving(true);
    setDocumentError("");
    setDocumentMessage("");
    try {
      const result = await createAccountingCreditDocument({
        id: documentId.current, kind, contactId, documentNo, issueDate, dueDate,
        description, amount: numericAmount, recognitionAccountCode: recognition,
        controlAccountCode: control,
      });
      if (!result.ok) setDocumentError(result.message);
      else {
        documentId.current = null;
        setDocumentNo(""); setDescription(""); setAmount("");
        setDocumentMessage("Dokumen dan jurnal berhasil dibukukan.");
        router.refresh();
      }
    } catch {
      setDocumentError("Hasil penyimpanan belum diketahui. Periksa daftar dokumen sebelum mengulang.");
    } finally {
      setDocumentSaving(false);
    }
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paymentSaving) return;
    const numericAmount = Number(paidAmount);
    if (!selectedDocument || !Number.isSafeInteger(numericAmount) || numericAmount <= 0
      || numericAmount > selectedDocument.outstanding) {
      setPaymentError("Pilih dokumen dan isi nominal maksimal sebesar sisa tagihan.");
      return;
    }
    paymentId.current ??= crypto.randomUUID();
    setPaymentSaving(true);
    setPaymentError("");
    setPaymentMessage("");
    try {
      const result = await recordAccountingCreditPayment({
        id: paymentId.current, documentId: selectedDocument.id, paidDate,
        amount: numericAmount, cashAccountCode: cashAccount,
      });
      if (!result.ok) setPaymentError(result.message);
      else {
        paymentId.current = null;
        setPaidAmount("");
        setPaymentMessage("Pembayaran dan jurnal berhasil dibukukan.");
        router.refresh();
      }
    } catch {
      setPaymentError("Hasil pembayaran belum diketahui. Periksa sisa tagihan sebelum mengulang.");
    } finally {
      setPaymentSaving(false);
    }
  }

  return <>
    <PageHeading eyebrow={`Akuntansi · ${businessName}`} title="Dokumen tempo & pelunasan"
      description="Kelola tagihan dan pelunasan pelanggan maupun pemasok. Penjualan tempo dibuat melalui Kasir; pembelian tempo dibuat di sini." />
    <p className="mb-5 rounded-xl border border-[#e7dfca] bg-[#f8f3e8] p-4 text-sm">Membuat bon untuk pelanggan? <Link href="/cashier" className="font-semibold text-primary underline">Buka Kasir</Link> agar produk dan stok ikut tercatat.</p>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Buat tagihan pembelian tempo</h2>
        <p className="mt-1 text-xs text-muted-foreground">Siapkan <Link href="/accounting/contacts" className="font-semibold text-primary underline">kontak</Link> dan saldo pembuka sebelum transaksi pertama.</p>
        <form onSubmit={createDocument} className="mt-5 space-y-4">
          <ContactPicker kind={kind} value={contactId} onChange={setContactId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Nomor dokumen<input value={documentNo} onChange={(event) => setDocumentNo(event.target.value.toUpperCase())}
              required maxLength={40} pattern="[A-Z0-9][A-Z0-9._/-]{0,39}" placeholder={kind === "sale" ? "INV-001" : "BILL-001"} className={fieldClass} /></label>
            <label className="block text-sm font-medium">Nominal (Rp)<input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" inputMode="numeric"
              value={amount} onChange={(event) => setAmount(event.target.value)} required className={fieldClass} /></label>
            <label className="block text-sm font-medium">Tanggal dokumen<input type="date" max={today} value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required className={fieldClass} /></label>
            <label className="block text-sm font-medium">Jatuh tempo<input type="date" min={issueDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} required className={fieldClass} /></label>
          </div>
          <label className="block text-sm font-medium">Keterangan<input value={description} onChange={(event) => setDescription(event.target.value)}
            required maxLength={250} placeholder="Barang atau jasa yang ditagihkan" className={fieldClass} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <AccountChoice accounts={accounts} roles={kind === "sale" ? ["revenue"]
              : ["expense", ...(!inventoryActive ? ["inventory" as const] : []),
                ...(!assetActive ? ["fixed_asset" as const] : [])]}
              label={kind === "sale" ? "Akun pendapatan" : "Akun pembelian"} value={recognition} onChange={setRecognition} />
            <AccountChoice accounts={accounts} role={kind === "sale" ? "receivable" : "payable"}
              label={kind === "sale" ? "Akun piutang" : "Akun utang"} value={control} onChange={setControl} />
          </div>
          <button disabled={documentSaving} type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{documentSaving ? "Membukukan…" : "Bukukan dokumen"}</button>
          {documentMessage && <p role="status" className="text-sm text-[#356548]">{documentMessage}</p>}
          {documentError && <p role="alert" className="text-sm text-[#812e22]">{documentError}</p>}
        </form>
      </section>
      <section className="h-fit rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Terima atau bayar cicilan</h2>
        <p className="mt-1 text-xs text-muted-foreground">Pilih dokumen terbuka pada halaman daftar di bawah. Pembayaran dapat dilakukan beberapa kali.</p>
        <form onSubmit={createPayment} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">Dokumen<select value={paymentDocumentId} onChange={(event) => {
            setPaymentDocumentId(event.target.value); setPaidAmount(""); paymentId.current = null;
          }} required className={fieldClass}>
            {!paymentDocumentId && <option value="" disabled hidden>Pilih dokumen yang belum lunas</option>}
            {documents.filter((item) => item.outstanding > 0).map((item) => <option key={item.id} value={item.id}>
              {item.documentNo} · {item.contactName} · sisa {formatRupiah(item.outstanding)}
            </option>)}
          </select></label>
          {selectedDocument && <p className="rounded-lg bg-secondary p-3 text-xs leading-5">{selectedDocument.kind === "sale" ? "Terima piutang" : "Bayar utang"} · {selectedDocument.origin === "opening" ? "saldo pembuka" : `diterbitkan ${selectedDocument.issueDate}`} · sisa {formatRupiah(selectedDocument.outstanding)}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Tanggal pembayaran<input type="date" min={selectedDocument?.issueDate} max={today} value={paidDate}
              onChange={(event) => setPaidDate(event.target.value)} required className={fieldClass} /></label>
            <label className="block text-sm font-medium">Nominal (Rp)<input type="number" min="1" max={selectedDocument?.outstanding ?? Number.MAX_SAFE_INTEGER}
              step="1" inputMode="numeric" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} required className={fieldClass} /></label>
          </div>
          <AccountChoice accounts={accounts} role="cash" label="Akun kas/bank" value={cashAccount} onChange={setCashAccount} />
          <button disabled={paymentSaving || !selectedDocument} type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{paymentSaving ? "Membukukan…" : "Bukukan pembayaran"}</button>
          {paymentMessage && <p role="status" className="text-sm text-[#356548]">{paymentMessage}</p>}
          {paymentError && <p role="alert" className="text-sm text-[#812e22]">{paymentError}</p>}
        </form>
        <p className="mt-5 rounded-lg border border-[#e7dfca] bg-[#f8f3e8] p-3 text-xs leading-5 text-[#594c35]">{inventoryActive ? <>Barang stok dicatat melalui <Link href="/accounting/inventory" className="font-semibold underline">Produk & stok</Link>.</> : "Pembelian ke akun persediaan sebelum aktivasi stok baru mencatat nilainya; nilai itu harus dialokasikan saat stok diaktifkan."} {assetActive ? <>Pembelian aset tetap dicatat melalui <Link href="/accounting/assets" className="font-semibold underline">Aset tetap</Link>.</> : "Pembelian ke akun aset tetap sebelum aktivasi register baru mencatat nilainya; aset harus dirinci saat register diaktifkan."}</p>
      </section>
    </div>
    <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5"><h2 className="text-base font-semibold">Daftar dokumen tempo</h2><p className="mt-1 text-xs text-muted-foreground">Urut menurut jatuh tempo · {documents.length} dokumen pada halaman ini</p></div>
      {documents.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
        <thead className="bg-secondary/70 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Dokumen</th><th className="px-5 py-3">Pihak</th><th className="px-5 py-3">Jatuh tempo</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Dibayar</th><th className="px-5 py-3 text-right">Sisa</th></tr></thead>
        <tbody className="divide-y divide-border/70">{documents.map((item) => <tr key={item.id}>
          <td className="px-5 py-3"><span className="font-semibold">{item.documentNo}</span><span className="mt-1 block text-xs text-muted-foreground">{item.origin === "opening" ? "Saldo pembuka" : item.kind === "sale" ? "Penjualan" : "Pembelian"} · {item.issueDate}</span><span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>{item.kind === "sale" && item.origin === "operational" && <Link href={`/accounting/credit/${item.id}/invoice`} className="mt-2 inline-block text-xs font-semibold text-primary underline">Lihat / cetak invoice</Link>}</td>
          <td className="px-5 py-3">{item.contactName}</td><td className="whitespace-nowrap px-5 py-3">{item.dueDate}</td>
          <td className="px-5 py-3 text-right tabular-nums">{formatRupiah(item.amount)}</td>
          <td className="px-5 py-3 text-right tabular-nums">{formatRupiah(item.paid)}</td>
          <td className={`px-5 py-3 text-right font-semibold tabular-nums ${item.outstanding ? "text-[#812e22]" : "text-[#356548]"}`}>{item.outstanding ? formatRupiah(item.outstanding) : "Lunas"}</td>
        </tr>)}</tbody>
      </table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada dokumen tempo. Buat dokumen pertama melalui formulir di atas.</p>}
    </section>
  </>;
}
