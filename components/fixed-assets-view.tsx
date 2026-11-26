"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ContactPicker } from "@/components/contact-picker";
import { activateFixedAssets, registerFixedAsset, runFixedAssetDepreciation } from "@/app/actions/fixed-assets";
import { PageHeading } from "@/components/page-heading";
import type { Account } from "@/lib/accounting";
import { formatRupiah } from "@/lib/format";
import type { FixedAsset } from "@/lib/supabase/fixed-assets";

const field = "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const primaryButton = "min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const categoryLabels = { land: "Tanah", building: "Bangunan", equipment: "Peralatan", vehicle: "Kendaraan", other: "Lainnya" };
function nextMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function AccountSelect({ label, role, accounts, value, onChange }: {
  label: string; role: Account["role"]; accounts: Account[]; value: string; onChange: (code: string) => void;
}) {
  return <label className="block text-sm font-medium">{label}<select className={field} value={value} onChange={(event) => onChange(event.target.value)} required>
    {!value && <option value="" disabled hidden>Pilih akun</option>}
    {accounts.filter((item) => item.active && item.role === role).map((item) =>
      <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
  </select></label>;
}

export function FixedAssetsView({ businessName, assets, book, accounts, depreciations, today }: {
  businessName: string; assets: FixedAsset[];
  book: { started_month: string; last_depreciated_month: string | null } | null;
  accounts: Account[]; depreciations: {
    id: string; period_month: string; amount: number; posted_on: string; asset_id: string;
  }[]; today: string;
}) {
  const router = useRouter();
  const minAcquired = book?.last_depreciated_month
    ? (book.last_depreciated_month.slice(0, 7) === today.slice(0, 7)
      ? book.last_depreciated_month
      : nextMonth(book.last_depreciated_month))
    : book?.started_month;
  const [sourceKind, setSourceKind] = useState<"opening" | "cash" | "credit">(book ? "cash" : "opening");
  const effectiveSource = book ? (sourceKind === "opening" ? "cash" : sourceKind) : "opening";
  const [category, setCategory] = useState<FixedAsset["category"]>("equipment");
  const [assetCode, setAssetCode] = useState(""); const [name, setName] = useState("");
  const [acquiredOn, setAcquiredOn] = useState(today); const [readyOn, setReadyOn] = useState(today);
  const [cost, setCost] = useState(""); const [initialAccumulated, setInitialAccumulated] = useState("0");
  const [lifeMonths, setLifeMonths] = useState("36");
  const [assetAccount, setAssetAccount] = useState("");
  const [accumulatedAccount, setAccumulatedAccount] = useState("");
  const [expenseAccount, setExpenseAccount] = useState("");
  const [cashAccount, setCashAccount] = useState("");
  const [payableAccount, setPayableAccount] = useState("");
  const [contactId, setContactId] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [month, setMonth] = useState(book?.started_month.slice(0, 7) ?? today.slice(0, 7));
  const [saving, setSaving] = useState(false); const [activating, setActivating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [bookError, setBookError] = useState(""); const [bookMessage, setBookMessage] = useState("");
  const id = useRef<string | null>(null);

  async function submitAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    const numericCost = Number(cost);
    const numericAccumulated = category === "land" || effectiveSource !== "opening" ? 0 : Number(initialAccumulated);
    if (!Number.isSafeInteger(numericCost) || numericCost <= 0
      || !Number.isSafeInteger(numericAccumulated) || numericAccumulated < 0) {
      setError("Biaya perolehan dan akumulasi penyusutan harus Rupiah bulat yang valid."); return;
    }
    id.current ??= crypto.randomUUID();
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await registerFixedAsset({ id: id.current, sourceKind: effectiveSource,
        category, assetCode, name, acquiredOn, readyOn, cost: numericCost,
        initialAccumulated: numericAccumulated,
        lifeMonths: category === "land" ? 0 : Number(lifeMonths),
        assetAccountCode: assetAccount, accumulatedAccountCode: accumulatedAccount,
        expenseAccountCode: expenseAccount, cashAccountCode: cashAccount,
        contactId, documentNo, dueDate, payableAccountCode: payableAccount });
      if (!result.ok) setError(result.message);
      else { id.current = null; setAssetCode(""); setName(""); setCost("");
        setInitialAccumulated("0"); setDocumentNo(""); setMessage("Aset tersimpan dan jurnal pembeliannya dibukukan bila ada.");
        router.refresh(); }
    } catch { setError("Hasil penyimpanan belum diketahui. Periksa daftar aset sebelum mengulang."); }
    finally { setSaving(false); }
  }

  async function activate() {
    if (activating) return;
    setActivating(true); setBookError(""); setBookMessage("");
    try {
      const result = await activateFixedAssets();
      if (!result.ok) setBookError(result.message);
      else { setBookMessage("Register aset cocok dengan buku besar dan sudah aktif."); router.refresh(); }
    } catch { setBookError("Register aset belum aktif. Periksa koneksi lalu coba lagi."); }
    finally { setActivating(false); }
  }

  async function depreciate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (running) return;
    setRunning(true); setBookError(""); setBookMessage("");
    try {
      const result = await runFixedAssetDepreciation(month);
      if (!result.ok) setBookError(result.message);
      else { setBookMessage(result.posted ? `${result.posted} aset disusutkan dan jurnalnya dibukukan.`
        : "Tidak ada penyusutan baru pada bulan ini."); router.refresh(); }
    } catch { setBookError("Penyusutan belum dibukukan. Periksa koneksi lalu coba lagi."); }
    finally { setRunning(false); }
  }

  return <>
    <PageHeading eyebrow={`Akuntansi · ${businessName}`} title="Aset tetap & penyusutan"
      description="Rinci aset pada biaya perolehan. Perhitungan garis lurus mengalokasikan nilai aset selama umur manfaatnya; tanah tidak disusutkan." />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.8fr)]">
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">{book ? "Beli aset tetap" : "Rinci aset yang sudah dimiliki"}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{book
          ? "Biaya perolehan mencakup harga beli dan biaya langsung hingga aset siap digunakan. Tanggal pembelian tidak boleh masuk ke bulan penyusutan yang sudah selesai."
          : "Masukkan semua aset yang saldonya sudah ada di buku besar. Aset pembuka tidak membuat jurnal baru."}</p>
        <form onSubmit={submitAsset} className="mt-5 space-y-4">
          {book && <label className="block text-sm font-medium">Cara bayar<select value={effectiveSource} onChange={(event) => {
            setSourceKind(event.target.value as "cash" | "credit"); setContactId(""); id.current = null;
          }} className={field}><option value="cash">Tunai / bank</option><option value="credit">Tempo ke pemasok</option></select></label>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Kode aset<input value={assetCode} onChange={(event) => setAssetCode(event.target.value.toUpperCase())} required maxLength={40} pattern="[A-Z0-9][A-Z0-9._/-]{0,39}" className={field} /></label>
            <label className="block text-sm font-medium">Nama aset<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} className={field} /></label>
            <label className="block text-sm font-medium">Jenis aset<select value={category} onChange={(event) => {
              setCategory(event.target.value as FixedAsset["category"]); id.current = null;
            }} className={field}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="block text-sm font-medium">Biaya perolehan (Rp)<input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={cost} onChange={(event) => setCost(event.target.value)} required className={field} /></label>
            <label className="block text-sm font-medium">Tanggal perolehan<input type="date" min={minAcquired} max={today} value={acquiredOn} onChange={(event) => setAcquiredOn(event.target.value)} required className={field} /></label>
            <label className="block text-sm font-medium">Siap digunakan sejak<input type="date" min={acquiredOn} value={readyOn} onChange={(event) => setReadyOn(event.target.value)} required className={field} /></label>
            {category !== "land" && <><label className="block text-sm font-medium">Umur manfaat (bulan)<input type="number" min="1" max="600" step="1" value={lifeMonths} onChange={(event) => setLifeMonths(event.target.value)} required className={field} /></label>
              {!book && <label className="block text-sm font-medium">Akumulasi penyusutan pembuka (Rp)<input type="number" min="0" max={cost || Number.MAX_SAFE_INTEGER} step="1" value={initialAccumulated} onChange={(event) => setInitialAccumulated(event.target.value)} required className={field} /></label>}</>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2"><AccountSelect label="Akun aset tetap" role="fixed_asset" accounts={accounts} value={assetAccount} onChange={setAssetAccount} />
            {category !== "land" && <><AccountSelect label="Akun akumulasi penyusutan" role="accumulated_depreciation" accounts={accounts} value={accumulatedAccount} onChange={setAccumulatedAccount} />
              <AccountSelect label="Akun beban penyusutan" role="depreciation_expense" accounts={accounts} value={expenseAccount} onChange={setExpenseAccount} /></>}</div>
          {book && (effectiveSource === "cash" ? <AccountSelect label="Akun kas / bank" role="cash" accounts={accounts} value={cashAccount} onChange={setCashAccount} /> : <>
            <ContactPicker kind="purchase" value={contactId} onChange={setContactId} />
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Nomor dokumen<input value={documentNo} onChange={(event) => setDocumentNo(event.target.value.toUpperCase())} required maxLength={40} pattern="[A-Z0-9][A-Z0-9._/-]{0,39}" className={field} /></label><label className="block text-sm font-medium">Jatuh tempo<input type="date" min={acquiredOn} value={dueDate} onChange={(event) => setDueDate(event.target.value)} required className={field} /></label></div>
            <AccountSelect label="Akun utang" role="payable" accounts={accounts} value={payableAccount} onChange={setPayableAccount} />
          </>)}
          <button disabled={saving} type="submit" className={primaryButton}>{saving ? "Menyimpan…" : book ? "Bukukan pembelian aset" : "Simpan rincian aset"}</button>
          {message && <p role="status" className="text-sm text-[#356548]">{message}</p>}
          {error && <p role="alert" className="text-sm text-[#812e22]">{error}</p>}
        </form>
      </section>

      <aside className="h-fit space-y-5">
        {!book ? <section className="rounded-xl border border-[#e7dfca] bg-[#f8f3e8] p-5">
          <h2 className="text-base font-semibold">Aktifkan register aset</h2>
          <p className="mt-2 text-sm leading-6">Jumlah biaya perolehan dan akumulasi penyusutan semua aset harus sama dengan saldo akun terkait pada <Link href="/accounting/reports" className="font-semibold underline">buku besar</Link>. Register dimulai bulan ini; saldo pembuka tidak dijurnal ulang.</p>
          <button type="button" onClick={activate} disabled={activating} className={`mt-4 ${primaryButton}`}>{activating ? "Memeriksa…" : "Cocokkan & aktifkan"}</button>
          {bookMessage && <p role="status" className="mt-3 text-sm text-[#356548]">{bookMessage}</p>}
          {bookError && <p role="alert" className="mt-3 text-sm text-[#812e22]">{bookError}</p>}
        </section> : <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Penyusutan bulanan</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Register aktif sejak {book.started_month.slice(0, 7)}. Bulan terakhir dibukukan: {book.last_depreciated_month?.slice(0, 7) ?? "belum ada"}. Sistem menghitung nominal setiap aset dan mencegah jurnal ganda.</p>
          <form onSubmit={depreciate} className="mt-4 space-y-4"><label className="block text-sm font-medium">Bulan<input type="month" min={book.started_month.slice(0, 7)} max={today.slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)} required className={field} /></label>
            <button disabled={running} type="submit" className={primaryButton}>{running ? "Menghitung…" : "Hitung & bukukan"}</button></form>
          {bookMessage && <p role="status" className="mt-3 text-sm text-[#356548]">{bookMessage}</p>}
          {bookError && <p role="alert" className="mt-3 text-sm text-[#812e22]">{bookError}</p>}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Bulan berjalan dapat dibukukan sebelum akhir bulan. Jika ada aset baru yang siap digunakan pada bulan yang sama, jalankan bulan itu lagi; aset yang sudah dibukukan tidak dihitung ulang.</p>
        </section>}
        <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Kebijakan perhitungan</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Metode garis lurus, tanpa nilai residu. Umur manfaat dicatat per aset dalam bulan. Untuk aset pembuka, sisa nilai dialokasikan selama sisa umur manfaat. Tanah tidak disusutkan. Pembukuan bulan dipicu pemilik dari halaman ini.</p></section>
      </aside>
    </div>

    <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5"><h2 className="text-base font-semibold">Register aset</h2><p className="mt-1 text-xs text-muted-foreground">{assets.length} aset pada halaman ini · nilai tercatat = biaya perolehan − akumulasi penyusutan</p></div>
      {assets.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-secondary/70 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Aset</th><th className="px-5 py-3">Jenis / siap</th><th className="px-5 py-3 text-right">Biaya</th><th className="px-5 py-3 text-right">Penyusutan</th><th className="px-5 py-3 text-right">Nilai tercatat</th></tr></thead>
        <tbody className="divide-y divide-border/70">{assets.map((item) => <tr key={item.id}><td className="px-5 py-3"><span className="font-semibold">{item.name}</span><span className="mt-1 block font-mono text-xs text-muted-foreground">{item.asset_code}</span></td><td className="px-5 py-3">{categoryLabels[item.category]}<span className="mt-1 block text-xs text-muted-foreground">{item.ready_on}{item.life_months ? ` · ${item.life_months} bulan` : ""}</span></td><td className="px-5 py-3 text-right tabular-nums">{formatRupiah(item.cost)}</td><td className="px-5 py-3 text-right tabular-nums">{formatRupiah(item.accumulated)}</td><td className="px-5 py-3 text-right font-semibold tabular-nums">{formatRupiah(item.cost - item.accumulated)}</td></tr>)}</tbody>
      </table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada aset. Rinci aset pembuka atau beli aset baru setelah register aktif.</p>}
    </section>
    <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border p-5"><h2 className="text-base font-semibold">Riwayat penyusutan</h2><p className="mt-1 text-xs text-muted-foreground">50 jurnal terakhir</p></div>
      {depreciations.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-secondary/70 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Bulan</th><th className="px-5 py-3">Aset</th><th className="px-5 py-3">Tanggal jurnal</th><th className="px-5 py-3 text-right">Beban</th></tr></thead><tbody className="divide-y divide-border/70">{depreciations.map((entry) => <tr key={entry.id}><td className="px-5 py-3">{entry.period_month.slice(0, 7)}</td><td className="px-5 py-3">{assets.find((asset) => asset.id === entry.asset_id)?.name ?? entry.asset_id.slice(0, 8)}</td><td className="px-5 py-3">{entry.posted_on}</td><td className="px-5 py-3 text-right tabular-nums">{formatRupiah(entry.amount)}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-muted-foreground">Belum ada jurnal penyusutan.</p>}
    </section>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Register ini belum menangani pelepasan atau penjualan aset dan penggantian komponen. Koreksi aset tunai tersedia sebelum penyusutan pertama; setelah itu perubahan umur manfaat memerlukan penyesuaian tersendiri.</p>
  </>;
}
