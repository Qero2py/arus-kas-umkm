"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { searchAccountingContacts, createAccountingCreditDocument } from "@/app/actions/accounting-credit";
import { postBasicAccountingEvent } from "@/app/actions/accounting";
import { searchCashierProducts } from "@/app/actions/cashier";
import { postInventoryEvent } from "@/app/actions/inventory";
import { PageHeading } from "@/components/page-heading";
import { calculateSaleTotal } from "@/lib/cashier";
import { formatRupiah } from "@/lib/format";
import { formatQuantity, parseQuantity } from "@/lib/inventory";
import type { CashierAccount, CashierProduct } from "@/lib/supabase/cashier";

const field = "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

export function CashierView({ businessName, role, accounts, products: initialProducts, bookDate, today }: {
  businessName: string; role: "owner" | "manager"; accounts: CashierAccount[]; products: CashierProduct[];
  bookDate: string | null; today: string;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState(initialProducts[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState(String(initialProducts[0]?.sale_price ?? 0));
  const [payment, setPayment] = useState<"cash" | "credit">("cash");
  const [date, setDate] = useState(today);
  const [cashCode, setCashCode] = useState(accounts.find((item) => item.role === "cash" && item.active)?.code ?? "");
  const [controlCode, setControlCode] = useState(accounts.find((item) => item.role === "receivable" && item.active)?.code ?? "");
  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [contactId, setContactId] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ label: string; href: string } | null>(null);
  const requestId = useRef<string | null>(null);
  const selected = products.find((item) => item.id === selectedId);
  const quantity = parseQuantity(qty);
  const price = Number(unitPrice);
  const total = calculateSaleTotal(qty, price) ?? 0;

  async function findProducts() {
    if (searching) return;
    setSearching(true); setError("");
    try {
      const response = await searchCashierProducts(query);
      if (!response.ok) setError(response.message);
      else {
        setProducts(response.products as CashierProduct[]);
        setSelectedId(response.products[0]?.id ?? "");
        setUnitPrice(String(response.products[0]?.sale_price ?? 0));
        requestId.current = null;
      }
    } catch { setError("Produk belum dapat dicari. Coba lagi."); }
    finally { setSearching(false); }
  }

  async function findContacts() {
    setError(""); setContacts([]); setContactId("");
    try {
      const response = await searchAccountingContacts(contactQuery, "sale");
      if (!response.ok) setError(response.message);
      else { setContacts(response.contacts); if (!response.contacts.length) setError("Pelanggan tidak ditemukan. Tambahkan di Data & pengaturan."); }
    } catch { setError("Pelanggan belum dapat dicari."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (!selected || quantity === null || quantity <= 0 || !Number.isSafeInteger(price) || price <= 0
      || !Number.isSafeInteger(total) || total <= 0
      || (selected.kind === "stock" && (!bookDate || date < bookDate || quantity > selected.qty_milli))) {
      setError("Pilih produk aktif dan periksa jumlah, harga, serta stok tersedia."); return;
    }
    if (payment === "credit" && (role !== "owner" || !contactId || !controlCode || !documentNo.trim() || dueDate < date)) {
      setError("Bon tempo memerlukan pelanggan, nomor bon, akun piutang, dan jatuh tempo."); return;
    }
    const revenueCode = accounts.find((account) => account.id === selected.revenue_account_id && account.active)?.code;
    if (!revenueCode || (payment === "cash" && !cashCode)) {
      setError("Akun penjualan belum lengkap. Periksa daftar akun produk dan kas."); return;
    }
    const id = requestId.current ?? crypto.randomUUID();
    requestId.current = id;
    const description = `${formatQuantity(quantity)} ${selected.unit} ${selected.name} (${selected.sku})`;
    setBusy(true); setError(""); setResult(null);
    try {
      if (selected.kind === "stock") {
        const response = await postInventoryEvent({ id, kind: "sale", productId: selected.id,
          date, qty, amount: total, payment, cashAccountCode: cashCode,
          controlAccountCode: controlCode, expenseAccountCode: "", contactId,
          documentNo, dueDate });
        if (!response.ok) { setError(response.message); return; }
        setResult(payment === "cash"
          ? { label: "Lihat dan cetak struk", href: `/accounting/entries/${response.journalId}/receipt` }
          : { label: "Lihat dan cetak bon", href: `/accounting/credit/${response.documentId || id}/invoice` });
      } else if (payment === "cash") {
        const response = await postBasicAccountingEvent({ type: "cash_sale", sourceId: id,
          date, description, amount: total, cash: cashCode, revenue: revenueCode });
        if (!response.ok) { setError(response.message); return; }
        setResult({ label: "Lihat dan cetak struk", href: `/accounting/entries/${response.journalId}/receipt` });
      } else {
        const response = await createAccountingCreditDocument({ id, kind: "sale", contactId,
          documentNo, issueDate: date, dueDate, description, amount: total,
          recognitionAccountCode: revenueCode, controlAccountCode: controlCode });
        if (!response.ok) { setError(response.message); return; }
        setResult({ label: "Lihat dan cetak bon", href: `/accounting/credit/${id}/invoice` });
      }
      requestId.current = null;
      setQty("1");
      setDocumentNo("");
      if (selected.kind === "stock") {
        const fresh = await searchCashierProducts(selected.sku).catch(() => null);
        if (fresh?.ok) {
          const updated = fresh.products.find((item) => item.id === selected.id);
          if (updated) setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
        }
      }
      router.refresh();
    } catch { setError("Hasil penjualan belum diketahui. Periksa buku kas atau tagihan sebelum mengulang."); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeading eyebrow={`Kegiatan usaha · ${businessName}`} title="Kasir pelanggan"
      description="Pilih barang atau jasa yang sudah terdaftar. Penjualan lunas menghasilkan struk; penjualan tempo menghasilkan bon dan piutang pelanggan. Satu transaksi saat ini memuat satu barang atau jasa." />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,.8fr)]">
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-sm font-medium">Cari barang atau jasa<input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} placeholder="Nama atau SKU" className={field} /></label><button type="button" onClick={() => void findProducts()} disabled={searching} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-primary disabled:opacity-60">{searching ? "Mencari…" : "Cari"}</button></div>
        <label className="block text-sm font-medium">Produk<select value={selectedId} onChange={(event) => {
          const next = products.find((item) => item.id === event.target.value);
          setSelectedId(event.target.value); setUnitPrice(String(next?.sale_price ?? 0)); requestId.current = null;
        }} required className={field}><option value="">Pilih produk</option>{products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}{item.kind === "stock" ? ` · stok ${formatQuantity(item.qty_milli)} ${item.unit}` : " · jasa"}</option>)}</select></label>
        {!products.length && <p className="text-sm text-muted-foreground">Produk belum ditemukan. Tambahkan dahulu di <Link href="/accounting/inventory" className="font-semibold text-primary underline">Produk & stok</Link>.</p>}
        {selected?.kind === "stock" && <p className="rounded-lg bg-secondary p-3 text-xs">Stok tersedia: {formatQuantity(selected.qty_milli)} {selected.unit}. Penjualan akan mengurangi stok dan membukukan HPP.</p>}
        {selected?.kind === "stock" && !bookDate && <p role="alert" className="text-sm text-[#812e22]">Aktifkan stok awal di halaman Produk & stok sebelum menjual barang ini.</p>}
        <div className="grid gap-4 sm:grid-cols-3"><label className="block text-sm font-medium">Tanggal<input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} required className={field} /></label><label className="block text-sm font-medium">Jumlah ({selected?.unit ?? "unit"})<input value={qty} onChange={(event) => { setQty(event.target.value); requestId.current = null; }} inputMode="decimal" required className={field} /></label><label className="block text-sm font-medium">Harga per unit (Rp)<input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); requestId.current = null; }} required className={field} /></label></div>
        <div className="rounded-xl bg-[#edf3e9] p-4"><p className="text-xs font-medium text-muted-foreground">Total transaksi</p><p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatRupiah(total)}</p></div>
        <label className="block text-sm font-medium">Cara bayar<select value={payment} onChange={(event) => { setPayment(event.target.value as "cash" | "credit"); requestId.current = null; }} className={field}><option value="cash">Lunas sekarang · struk</option>{role === "owner" && <option value="credit">Tempo · bon / invoice</option>}</select></label>
        {payment === "cash" ? <label className="block text-sm font-medium">Masuk ke kas/bank<select value={cashCode} onChange={(event) => setCashCode(event.target.value)} required className={field}><option value="">Pilih kas/bank</option>{accounts.filter((item) => item.active && item.role === "cash").map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label> : <div className="space-y-4 rounded-xl border border-border p-4"><div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-sm font-medium">Cari pelanggan<input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} minLength={2} maxLength={80} className={field} /></label><button type="button" onClick={() => void findContacts()} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-primary">Cari</button></div><label className="block text-sm font-medium">Pelanggan<select value={contactId} onChange={(event) => setContactId(event.target.value)} required className={field}><option value="">Pilih pelanggan</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Nomor bon<input value={documentNo} onChange={(event) => setDocumentNo(event.target.value.toUpperCase())} required maxLength={40} pattern="[A-Z0-9][A-Z0-9._/-]{0,39}" placeholder="BON-001" className={field} /></label><label className="block text-sm font-medium">Jatuh tempo<input type="date" min={date} value={dueDate} onChange={(event) => setDueDate(event.target.value)} required className={field} /></label></div><label className="block text-sm font-medium">Akun piutang<select value={controlCode} onChange={(event) => setControlCode(event.target.value)} required className={field}><option value="">Pilih piutang</option>{accounts.filter((item) => item.active && item.role === "receivable").map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><p className="text-xs text-muted-foreground">Belum ada pelanggan? <Link href="/accounting/contacts" className="font-semibold text-primary underline">Tambah di kontak</Link>.</p></div>}
        <button type="submit" disabled={busy || !selected || (selected.kind === "stock" && !bookDate)} className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Membukukan…" : "Selesaikan penjualan"}</button>
        {result && <p role="status" className="rounded-lg border border-[#a8c7ae] bg-[#edf5ee] p-3 text-sm text-[#28513a]">Penjualan sudah dibukukan. <Link href={result.href} className="font-semibold underline">{result.label}</Link>.</p>}
        {error && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] p-3 text-sm text-[#812e22]">{error}</p>}
      </form>
      <aside className="h-fit space-y-4"><section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Satu alur untuk pelanggan</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Barang stok memakai jumlah dan nilai persediaan yang sama dengan kartu stok. Jasa tidak mengubah stok. {role === "owner" ? "Pilih tempo hanya jika pelanggan dan tanggal jatuh tempo sudah diketahui." : "Pengelola hanya dapat menyelesaikan penjualan yang langsung dibayar."}</p></section><section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Setelah penjualan</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Lihat penerimaan di <Link href="/transactions" className="font-semibold text-primary underline">Kas & bank</Link>{role === "owner" && <>, tagihan di <Link href="/accounting/credit" className="font-semibold text-primary underline">Tagihan tempo</Link>, dan mutasi barang di <Link href="/accounting/inventory" className="font-semibold text-primary underline">Produk & stok</Link></>}.</p></section></aside>
    </div>
  </>;
}
