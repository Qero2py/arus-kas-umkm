"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { searchAccountingContacts } from "@/app/actions/accounting-credit";
import { activateInventory, createInventoryProduct, postInventoryEvent } from "@/app/actions/inventory";
import { PageHeading } from "@/components/page-heading";
import type { Account } from "@/lib/accounting";
import { formatRupiah } from "@/lib/format";
import { formatQuantity, parseQuantity } from "@/lib/inventory";
import type { InventoryMovement, InventoryProduct } from "@/lib/supabase/inventory";

const field = "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const actionButton = "min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60";
type EventKind = "purchase" | "sale" | "opname";

function AccountSelect({ label, roles, accounts, value, onChange }: {
  label: string; roles: Account["role"][]; accounts: Account[]; value: string; onChange: (value: string) => void;
}) {
  return <label className="block text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} required className={field}>
    <option value="">Pilih akun</option>
    {accounts.filter((account) => account.active && roles.includes(account.role)).map((account) =>
      <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}
  </select></label>;
}

export function InventoryView({ businessName, products, openings, bookDate, accounts, movements,
  selectedId, today, page }: {
  businessName: string; products: InventoryProduct[]; openings: InventoryProduct[]; bookDate: string | null;
  accounts: Account[]; movements: InventoryMovement[]; selectedId: string; today: string; page: number;
}) {
  const router = useRouter();
  const [productKind, setProductKind] = useState<"stock" | "service">("stock");
  const [sku, setSku] = useState(""); const [name, setName] = useState(""); const [unit, setUnit] = useState("pcs");
  const [purchasePrice, setPurchasePrice] = useState(""); const [salePrice, setSalePrice] = useState("");
  const [minQty, setMinQty] = useState("0");
  const [inventoryAccount, setInventoryAccount] = useState("");
  const [cogsAccount, setCogsAccount] = useState("");
  const [revenueAccount, setRevenueAccount] = useState("");
  const [productBusy, setProductBusy] = useState(false); const [productError, setProductError] = useState("");
  const [productMessage, setProductMessage] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false); const [openingError, setOpeningError] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");

  const stockProducts = products.filter((item) => item.kind === "stock");
  const [eventProductId, setEventProductId] = useState(stockProducts[0]?.id ?? "");
  const [eventKind, setEventKind] = useState<EventKind>("purchase");
  const [eventDate, setEventDate] = useState(today);
  const [qty, setQty] = useState(""); const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<"cash" | "credit">("cash");
  const [cashAccount, setCashAccount] = useState("");
  const [controlAccount, setControlAccount] = useState("");
  const [expenseAccount, setExpenseAccount] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [contactId, setContactId] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [eventBusy, setEventBusy] = useState(false); const [eventError, setEventError] = useState("");
  const [eventMessage, setEventMessage] = useState("");
  const eventId = useRef<string | null>(null);
  const selectedProduct = stockProducts.find((item) => item.id === eventProductId) ?? stockProducts[0];
  const cardProduct = products.find((item) => item.id === selectedId);

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (productBusy) return;
    setProductBusy(true); setProductError(""); setProductMessage("");
    try {
      const result = await createInventoryProduct({ kind: productKind, sku, name, unit,
        purchasePrice: Number(purchasePrice || 0), salePrice: Number(salePrice || 0),
        minQty: productKind === "stock" ? minQty : "0",
        inventoryAccountCode: inventoryAccount, cogsAccountCode: cogsAccount,
        revenueAccountCode: revenueAccount });
      if (!result.ok) setProductError(result.message);
      else { setSku(""); setName(""); setPurchasePrice(""); setSalePrice(""); setMinQty("0");
        setProductMessage("Produk tersimpan."); router.refresh(); }
    } catch { setProductError("Produk belum tersimpan. Periksa koneksi lalu coba lagi."); }
    finally { setProductBusy(false); }
  }

  async function submitOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (openingBusy) return;
    const data = new FormData(event.currentTarget);
    const items = openings.map((item) => ({ productId: item.id,
      qty: String(data.get(`qty:${item.id}`) ?? "0"), value: Number(data.get(`value:${item.id}`) ?? 0) }));
    setOpeningBusy(true); setOpeningError(""); setOpeningMessage("");
    try {
      const result = await activateInventory(items);
      if (!result.ok) setOpeningError(result.message);
      else { setOpeningMessage("Stok awal cocok dengan buku besar dan sudah diaktifkan."); router.refresh(); }
    } catch { setOpeningError("Stok awal belum aktif. Periksa koneksi lalu coba lagi."); }
    finally { setOpeningBusy(false); }
  }

  async function findContacts() {
    setEventError(""); setContacts([]); setContactId("");
    try {
      const result = await searchAccountingContacts(contactQuery, eventKind === "sale" ? "sale" : "purchase");
      if (!result.ok) setEventError(result.message);
      else { setContacts(result.contacts); if (!result.contacts.length) setEventError("Kontak tidak ditemukan. Tambahkan di halaman Kontak."); }
    } catch { setEventError("Kontak belum dapat dicari."); }
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (eventBusy) return;
    const quantity = parseQuantity(qty);
    const numericAmount = Number(amount || 0);
    if (!selectedProduct || quantity === null || (eventKind !== "opname" && quantity <= 0)
      || !Number.isSafeInteger(numericAmount) || numericAmount < 0
      || (eventKind !== "opname" && numericAmount === 0)) {
      setEventError("Pilih produk dan isi kuantitas serta nominal yang valid."); return;
    }
    eventId.current ??= crypto.randomUUID();
    setEventBusy(true); setEventError(""); setEventMessage("");
    try {
      const result = await postInventoryEvent({ id: eventId.current, kind: eventKind,
        productId: selectedProduct.id, date: eventDate, qty, amount: numericAmount,
        payment, cashAccountCode: cashAccount, controlAccountCode: controlAccount,
        expenseAccountCode: expenseAccount, contactId, documentNo, dueDate });
      if (!result.ok) setEventError(result.message);
      else { eventId.current = null; setQty(""); setAmount(""); setDocumentNo("");
        setEventMessage("Kartu stok dan jurnal berhasil dibukukan."); router.refresh(); }
    } catch { setEventError("Hasil transaksi belum diketahui. Periksa kartu stok sebelum mengulang."); }
    finally { setEventBusy(false); }
  }

  return <>
    <PageHeading eyebrow={`Akuntansi · ${businessName}`} title="Produk, stok & HPP"
      description="Produk stok memiliki kuantitas dan nilai persediaan. Saat dijual, HPP dihitung dari rata-rata bergerak; produk jasa tidak memerlukan stok." />
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Tambah produk atau jasa</h2>
        <form onSubmit={submitProduct} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">Jenis<select value={productKind} onChange={(event) => setProductKind(event.target.value as "stock" | "service")} className={field}>
            <option value="stock">Barang dengan stok</option><option value="service">Jasa tanpa stok</option>
          </select></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">SKU / kode<input value={sku} onChange={(event) => setSku(event.target.value.toUpperCase())} required maxLength={40} pattern="[A-Z0-9][A-Z0-9._/-]{0,39}" className={field} /></label>
            <label className="block text-sm font-medium">Nama<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} className={field} /></label>
            <label className="block text-sm font-medium">Satuan<input value={unit} onChange={(event) => setUnit(event.target.value)} required maxLength={20} placeholder="pcs, kg, layanan" className={field} /></label>
            {productKind === "stock" && <label className="block text-sm font-medium">Batas stok minimum<input value={minQty} onChange={(event) => setMinQty(event.target.value)} required inputMode="decimal" placeholder="0" className={field} /></label>}
            <label className="block text-sm font-medium">Harga beli acuan (Rp/unit)<input type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} className={field} /></label>
            <label className="block text-sm font-medium">Harga jual acuan (Rp/unit)<input type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} className={field} /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {productKind === "stock" && <><AccountSelect label="Akun persediaan" roles={["inventory"]} accounts={accounts} value={inventoryAccount} onChange={setInventoryAccount} />
              <AccountSelect label="Akun HPP" roles={["cogs"]} accounts={accounts} value={cogsAccount} onChange={setCogsAccount} /></>}
            <AccountSelect label="Akun pendapatan" roles={["revenue"]} accounts={accounts} value={revenueAccount} onChange={setRevenueAccount} />
          </div>
          <button disabled={productBusy} type="submit" className={actionButton}>{productBusy ? "Menyimpan…" : "Simpan produk"}</button>
          {productMessage && <p role="status" className="text-sm text-[#356548]">{productMessage}</p>}
          {productError && <p role="alert" className="text-sm text-[#812e22]">{productError}</p>}
        </form>
      </section>

      {!bookDate ? <section className="h-fit rounded-xl border border-[#e7dfca] bg-[#f8f3e8] p-5 sm:p-6">
        <h2 className="text-base font-semibold">Aktifkan stok awal</h2>
        <p className="mt-2 text-sm leading-6">Masukkan kuantitas dan nilai seluruh produk stok pada hari ini. Jumlah nilainya harus sama dengan saldo akun Persediaan pada <Link href="/accounting/reports" className="font-semibold underline">buku besar</Link>. Produk yang belum punya stok diisi nol.</p>
        <form onSubmit={submitOpening} className="mt-5 space-y-4">
          {openings.map((item) => <div key={item.id} className="rounded-lg border border-[#e7dfca] bg-card p-3">
            <p className="text-sm font-semibold">{item.sku} · {item.name}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium">Jumlah ({item.unit})<input name={`qty:${item.id}`} defaultValue="0" inputMode="decimal" required className={field} /></label>
              <label className="text-xs font-medium">Nilai total (Rp)<input type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" name={`value:${item.id}`} defaultValue="0" required className={field} /></label>
            </div>
          </div>)}
          {!openings.length && <p className="text-xs">Belum ada barang stok. Anda dapat menambah barang dahulu, atau aktifkan saldo nol lalu tambah barang.</p>}
          <button disabled={openingBusy} type="submit" className={actionButton}>{openingBusy ? "Memeriksa…" : "Cocokkan & aktifkan stok"}</button>
          {openingMessage && <p role="status" className="text-sm text-[#356548]">{openingMessage}</p>}
          {openingError && <p role="alert" className="text-sm text-[#812e22]">{openingError}</p>}
        </form>
      </section> : <section className="h-fit rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Catat pergerakan stok</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Stok aktif sejak {bookDate}. Tanggal per produk harus berurutan. Nominal beli/jual adalah total transaksi, bukan harga per unit.</p>
        <form onSubmit={submitEvent} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">Jenis transaksi<select value={eventKind} onChange={(event) => {
            setEventKind(event.target.value as EventKind); setContacts([]); setContactId(""); eventId.current = null;
          }} className={field}>
            <option value="purchase">Pembelian stok</option><option value="sale">Penjualan stok</option><option value="opname">Stok opname</option>
          </select></label>
          <label className="block text-sm font-medium">Produk stok pada halaman ini<select value={selectedProduct?.id ?? ""} onChange={(event) => {
            setEventProductId(event.target.value); eventId.current = null;
          }} required className={field}>
            <option value="">Pilih produk</option>{stockProducts.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} · {formatQuantity(item.qty_milli)} {item.unit}</option>)}
          </select></label>
          {selectedProduct && <p className="rounded-lg bg-secondary p-3 text-xs">Tersedia: {formatQuantity(selectedProduct.qty_milli)} {selectedProduct.unit} · nilai {formatRupiah(selectedProduct.stock_value)}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Tanggal<input type="date" min={bookDate} max={today} value={eventDate} onChange={(event) => setEventDate(event.target.value)} required className={field} /></label>
            <label className="block text-sm font-medium">{eventKind === "opname" ? "Jumlah fisik" : "Jumlah transaksi"} ({selectedProduct?.unit ?? "unit"})<input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="decimal" required placeholder="Contoh: 2,5 ditulis 2.5" className={field} /></label>
          </div>
          <label className="block text-sm font-medium">{eventKind === "opname" ? "Nilai perolehan jika stok sebelumnya nol (Rp)" : "Nominal total (Rp)"}<input type="number" min={eventKind === "opname" ? "0" : "1"} max={Number.MAX_SAFE_INTEGER} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required={eventKind !== "opname"} placeholder="0" className={field} /></label>
          {eventKind !== "opname" ? <>
            <label className="block text-sm font-medium">Pembayaran<select value={payment} onChange={(event) => {
              setPayment(event.target.value as "cash" | "credit"); setContacts([]); setContactId(""); eventId.current = null;
            }} className={field}><option value="cash">Tunai / bank</option><option value="credit">Tempo</option></select></label>
            {payment === "cash" ? <AccountSelect label="Akun kas / bank" roles={["cash"]} accounts={accounts} value={cashAccount} onChange={setCashAccount} /> : <>
              <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-sm font-medium">Cari {eventKind === "sale" ? "pelanggan" : "pemasok"}<input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} minLength={2} maxLength={80} placeholder="Ketik sedikitnya dua huruf" className={field} /></label>
                <button type="button" onClick={findContacts} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-primary">Cari</button></div>
              <label className="block text-sm font-medium">Kontak<select value={contactId} onChange={(event) => setContactId(event.target.value)} required className={field}><option value="">Pilih kontak</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Nomor dokumen<input value={documentNo} onChange={(event) => setDocumentNo(event.target.value.toUpperCase())} required maxLength={40} pattern="[A-Z0-9][A-Z0-9._/-]{0,39}" className={field} /></label>
                <label className="block text-sm font-medium">Jatuh tempo<input type="date" min={eventDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} required className={field} /></label></div>
              <AccountSelect label={eventKind === "sale" ? "Akun piutang" : "Akun utang"} roles={eventKind === "sale" ? ["receivable"] : ["payable"]} accounts={accounts} value={controlAccount} onChange={setControlAccount} />
            </>}
          </> : <AccountSelect label="Akun beban selisih stok" roles={["expense"]} accounts={accounts} value={expenseAccount} onChange={setExpenseAccount} />}
          <button disabled={eventBusy || !selectedProduct} type="submit" className={actionButton}>{eventBusy ? "Membukukan…" : "Bukukan stok & jurnal"}</button>
          {eventMessage && <p role="status" className="text-sm text-[#356548]">{eventMessage}</p>}
          {eventError && <p role="alert" className="text-sm text-[#812e22]">{eventError}</p>}
        </form>
      </section>}
    </div>

    <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5"><h2 className="text-base font-semibold">Daftar produk</h2><p className="mt-1 text-xs text-muted-foreground">{products.length} produk pada halaman ini · harga adalah acuan, nilai persediaan berasal dari transaksi</p></div>
      {products.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-secondary/70 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Produk</th><th className="px-5 py-3">Jenis</th><th className="px-5 py-3 text-right">Jumlah</th><th className="px-5 py-3 text-right">Nilai stok</th><th className="px-5 py-3">Kartu</th></tr></thead>
        <tbody className="divide-y divide-border/70">{products.map((item) => <tr key={item.id}><td className="px-5 py-3"><span className="font-semibold">{item.name}</span><span className="mt-1 block font-mono text-xs text-muted-foreground">{item.sku}</span></td><td className="px-5 py-3">{item.kind === "stock" ? "Barang" : "Jasa"}</td><td className="px-5 py-3 text-right tabular-nums">{item.kind === "stock" ? `${formatQuantity(item.qty_milli)} ${item.unit}` : "—"}{item.kind === "stock" && item.qty_milli <= item.min_qty_milli && <span className="block text-xs text-[#812e22]">Batas minimum</span>}</td><td className="px-5 py-3 text-right tabular-nums">{item.kind === "stock" ? formatRupiah(item.stock_value) : "—"}</td><td className="px-5 py-3">{item.kind === "stock" && <Link className="font-semibold text-primary underline" href={`/accounting/inventory?page=${page}&product=${item.id}`}>Lihat</Link>}</td></tr>)}</tbody>
      </table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada produk. Tambahkan barang atau jasa di atas.</p>}
    </section>
    {cardProduct?.kind === "stock" && <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5"><h2 className="text-base font-semibold">Kartu stok: {cardProduct.name}</h2><p className="mt-1 text-xs text-muted-foreground">50 mutasi terakhir · jumlah memakai satuan {cardProduct.unit}</p></div>
      {movements.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-secondary/70 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Jenis</th><th className="px-5 py-3 text-right">Perubahan jumlah</th><th className="px-5 py-3 text-right">Perubahan nilai</th><th className="px-5 py-3 text-right">Sisa jumlah</th><th className="px-5 py-3 text-right">Sisa nilai</th></tr></thead>
        <tbody className="divide-y divide-border/70">{movements.map((item) => <tr key={item.id}><td className="px-5 py-3">{item.event_date}</td><td className="px-5 py-3">{{ opening: "Stok awal", purchase: "Pembelian", sale: "Penjualan", opname: "Opname", correction_reversal: "Pembalik koreksi" }[item.event_kind]}</td><td className="px-5 py-3 text-right tabular-nums">{item.qty_delta_milli > 0 ? "+" : "−"}{formatQuantity(Math.abs(item.qty_delta_milli))}</td><td className="px-5 py-3 text-right tabular-nums">{item.value_delta > 0 ? "+" : "−"}{formatRupiah(Math.abs(item.value_delta))}</td><td className="px-5 py-3 text-right tabular-nums">{formatQuantity(item.qty_after_milli)}</td><td className="px-5 py-3 text-right tabular-nums">{formatRupiah(item.value_after)}</td></tr>)}</tbody>
      </table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada mutasi stok untuk produk ini.</p>}
    </section>}
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Barang dan HPP sudah terhubung ke jurnal akuntansi. Produk jasa dicatat tanpa stok; penjualannya dapat memakai form transaksi biasa atau dokumen tempo. Buku kas dan proyeksi lama masih menunggu rekonsiliasi sebelum cutover.</p>
  </>;
}
