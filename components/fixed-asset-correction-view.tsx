"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { correctCashFixedAsset } from "@/app/actions/fixed-assets";
import type { Account } from "@/lib/accounting";
import type { FixedAsset } from "@/lib/supabase/fixed-assets";

const field = "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function FixedAssetCorrectionView({ assets, accounts, today }: {
  assets: FixedAsset[]; accounts: Account[]; today: string;
}) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [assetId, setAssetId] = useState("");
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [readyOn, setReadyOn] = useState("");
  const [lifeMonths, setLifeMonths] = useState("");
  const [cash, setCash] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = assets.find((item) => item.id === assetId);

  function choose(id: string) {
    const row = assets.find((item) => item.id === id);
    setAssetId(id); setDate(row?.acquired_on ?? ""); setName(row?.name ?? "");
    setCost(row ? String(row.cost) : ""); setReadyOn(row?.ready_on ?? "");
    setLifeMonths(row?.life_months === null || row?.life_months === undefined ? "0" : String(row.life_months));
    setCash(""); setReason(""); setError(""); setNotice(""); requestId.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    const numericCost = Number(cost);
    const numericLife = Number(lifeMonths);
    if (!Number.isSafeInteger(numericCost) || numericCost < 1
      || !Number.isInteger(numericLife) || (selected.category === "land" ? numericLife !== 0 : numericLife < 1 || numericLife > 600)
      || date < selected.acquired_on || date > today
      || date.slice(0, 7) !== selected.acquired_on.slice(0, 7)
      || readyOn < selected.acquired_on || reason.trim().length < 10 || !cash) {
      setError("Periksa tanggal pada bulan perolehan, nilai, umur manfaat, akun kas, dan alasan minimal 10 karakter.");
      return;
    }
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await correctCashFixedAsset({ correctionId: requestId.current,
        assetId, correctionDate: date, reason, name, cost: numericCost,
        readyOn, lifeMonths: numericLife, cashAccountCode: cash });
      if (!result.ok) setError(result.message);
      else { requestId.current = null; setAssetId("");
        setNotice("Aset dan jurnal terkoreksi. Riwayat pembalik dan pengganti tersedia di buku besar."); router.refresh(); }
    } catch { setError("Hasil koreksi belum diketahui. Muat ulang daftar sebelum mencoba lagi."); }
    finally { setBusy(false); }
  }

  return <section className="mt-5 rounded-xl border border-border bg-card p-5 sm:p-6">
    <h2 className="text-lg font-semibold">Koreksi aset yang belum disusutkan</h2>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">Perbaiki aset yang dibeli tunai sebelum penyusutan pertama dan sebelum bulan perolehannya ditutup. Harga, tanggal siap pakai, umur manfaat, nama, dan akun kas dapat diperbaiki; kode serta kategori aset tetap.</p>
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="block text-sm font-medium">Aset<select required value={assetId} onChange={(event) => choose(event.target.value)} className={field}><option value="">Pilih aset tunai tanpa penyusutan</option>{assets.filter((item) => item.source_kind === "cash" && item.accumulated === 0).map((item) => <option key={item.id} value={item.id}>{item.asset_code} · {item.name}</option>)}</select></label>
      {selected && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">Tanggal koreksi<input type="date" required min={selected.acquired_on} max={today} value={date} onChange={(event) => setDate(event.target.value)} className={field} /></label>
          <label className="text-sm font-medium">Harga perolehan baru (Rp)<input type="number" required min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={cost} onChange={(event) => setCost(event.target.value)} className={field} /></label>
          <label className="text-sm font-medium">Tanggal siap pakai<input type="date" required min={selected.acquired_on} value={readyOn} onChange={(event) => setReadyOn(event.target.value)} className={field} /></label>
          <label className="text-sm font-medium">Umur manfaat (bulan)<input type="number" required min={selected.category === "land" ? 0 : 1} max={selected.category === "land" ? 0 : 600} step="1" value={lifeMonths} onChange={(event) => setLifeMonths(event.target.value)} className={field} /></label>
          <label className="text-sm font-medium sm:col-span-2">Nama aset<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className={field} /></label>
        </div>
        <label className="block text-sm font-medium">Akun kas/bank pengganti<select required value={cash} onChange={(event) => setCash(event.target.value)} className={field}><option value="">Pilih akun</option>{accounts.filter((account) => account.active && account.role === "cash").map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select></label>
        <label className="block text-sm font-medium">Alasan koreksi<textarea required minLength={10} maxLength={500} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-background p-3" /></label>
        <button disabled={busy} type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Membukukan…" : "Bukukan koreksi aset"}</button>
      </>}
    </form>
    {notice && <p role="status" className="mt-4 rounded-lg bg-[#e7f3e8] p-3 text-sm text-[#356548]">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#fff0ed] p-3 text-sm text-[#812e22]">{error}</p>}
  </section>;
}
