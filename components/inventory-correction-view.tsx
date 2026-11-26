"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { correctCashInventoryEvent } from "@/app/actions/inventory";
import type { Account } from "@/lib/accounting";
import { parseQuantity } from "@/lib/inventory";
import type { InventoryMovement, InventoryProduct } from "@/lib/supabase/inventory";

const field = "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function InventoryCorrectionView({ product, latest, accounts, today }: {
  product: InventoryProduct | undefined; latest: InventoryMovement | undefined;
  accounts: Account[]; today: string;
}) {
  const router = useRouter();
  const correctionId = useRef<string | null>(null);
  const replacementId = useRef<string | null>(null);
  const [date, setDate] = useState(latest?.event_date ?? today);
  const [qty, setQty] = useState(latest ? String((latest.event_kind === "opname"
    ? latest.qty_after_milli : Math.abs(latest.qty_delta_milli)) / 1000) : "");
  const [amount, setAmount] = useState(latest?.event_kind === "purchase" ? String(latest.value_delta) : "");
  const [cash, setCash] = useState("");
  const [expense, setExpense] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canCorrect = product?.kind === "stock" && latest &&
    ["purchase", "sale", "opname"].includes(latest.event_kind) && !latest.credit_document_id;
  const kind = latest?.event_kind;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCorrect || !product || !latest || busy || !kind || kind === "opening" || kind === "correction_reversal") return;
    const quantity = parseQuantity(qty);
    const numericAmount = Number(amount || 0);
    if (quantity === null || (kind !== "opname" && quantity <= 0)
      || !Number.isSafeInteger(numericAmount) || numericAmount < 0
      || (kind !== "opname" && numericAmount <= 0)
      || date < latest.event_date || date > today
      || date.slice(0, 7) !== latest.event_date.slice(0, 7)
      || reason.trim().length < 10) {
      setError("Periksa jumlah, nominal, tanggal dalam bulan transaksi, dan alasan minimal 10 karakter.");
      return;
    }
    correctionId.current ??= crypto.randomUUID();
    replacementId.current ??= crypto.randomUUID();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await correctCashInventoryEvent({ correctionId: correctionId.current,
        originalMovementId: latest.id, replacementEventId: replacementId.current,
        productId: product.id, kind, date, qty, amount: numericAmount,
        cashAccountCode: cash, expenseAccountCode: expense, reason });
      if (!result.ok) setError(result.message);
      else { correctionId.current = null; replacementId.current = null;
        setNotice("Stok dan jurnal terkoreksi. Kartu stok memuat transaksi asal, pembalik, dan pengganti.");
        router.refresh(); }
    } catch { setError("Hasil koreksi belum diketahui. Muat ulang kartu stok sebelum mencoba lagi."); }
    finally { setBusy(false); }
  }

  return <section className="mt-5 rounded-xl border border-border bg-card p-5 sm:p-6">
    <h2 className="text-lg font-semibold">Koreksi stok terakhir</h2>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">Koreksi hanya tersedia untuk mutasi tunai atau opname yang paling baru pada produk terpilih, sebelum ada mutasi berikutnya dan selama bulannya belum ditutup. Transaksi tempo memerlukan koreksi dokumen dan HPP bersama.</p>
    {!canCorrect ? <p className="mt-4 text-sm text-muted-foreground">Pilih produk dengan mutasi tunai atau opname terakhir yang dapat dikoreksi.</p> : <form onSubmit={submit} className="mt-4 space-y-4">
      <p className="rounded-lg bg-secondary p-3 text-sm">{product.name} · {kind === "purchase" ? "Pembelian" : kind === "sale" ? "Penjualan" : "Opname"} · {latest.event_date}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">Tanggal koreksi<input type="date" required min={latest.event_date} max={today} value={date} onChange={(event) => setDate(event.target.value)} className={field} /></label>
        <label className="text-sm font-medium">{kind === "opname" ? "Jumlah fisik baru" : "Jumlah transaksi baru"} ({product.unit})<input required value={qty} onChange={(event) => setQty(event.target.value)} inputMode="decimal" className={field} /></label>
        <label className="text-sm font-medium">{kind === "opname" ? "Nilai jika stok awal nol" : "Nominal transaksi baru"} (Rp)<input type="number" required={kind !== "opname"} min={kind === "opname" ? 0 : 1} max={Number.MAX_SAFE_INTEGER} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className={field} /></label>
      </div>
      <label className="block text-sm font-medium">{kind === "opname" ? "Akun beban selisih stok" : "Akun kas/bank"}<select required value={kind === "opname" ? expense : cash} onChange={(event) => kind === "opname" ? setExpense(event.target.value) : setCash(event.target.value)} className={field}><option value="">Pilih akun</option>{accounts.filter((account) => account.active && account.role === (kind === "opname" ? "expense" : "cash")).map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select></label>
      <label className="block text-sm font-medium">Alasan koreksi<textarea required minLength={10} maxLength={500} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-background p-3" /></label>
      <button disabled={busy} type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Membukukan…" : "Bukukan koreksi stok"}</button>
    </form>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-[#e7f3e8] p-3 text-sm text-[#356548]">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#fff0ed] p-3 text-sm text-[#812e22]">{error}</p>}
  </section>;
}
