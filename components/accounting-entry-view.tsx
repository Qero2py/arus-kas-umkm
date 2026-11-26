"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { postBasicAccountingEvent } from "@/app/actions/accounting";
import { PageHeading } from "@/components/page-heading";
import type { Account, BasicAccountingEvent } from "@/lib/accounting";

type EventType = BasicAccountingEvent["type"];

const events: { type: EventType; label: string; explanation: string }[] = [
  { type: "cash_sale", label: "Pendapatan tunai", explanation: "Kas bertambah dan pendapatan diakui." },
  { type: "cash_expense", label: "Beban dibayar tunai", explanation: "Beban diakui dan kas berkurang." },
  { type: "capital_contribution", label: "Setoran modal", explanation: "Kas dan modal pemilik bertambah." },
  { type: "owner_draw", label: "Prive pemilik", explanation: "Kas berkurang dan pengambilan pemilik dicatat di ekuitas." },
  { type: "cash_transfer", label: "Transfer kas/bank", explanation: "Saldo berpindah antarakun kas tanpa mengubah total kas." },
];

function AccountSelect({ label, role, value, onChange, accounts }: {
  label: string; role: Account["role"]; value: string; onChange: (code: string) => void; accounts: Account[];
}) {
  const options = accounts.filter((account) => account.active && account.role === role);
  return <label className="block text-sm font-medium">{label}
    <select value={value} onChange={(event) => onChange(event.target.value)} required
      className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
      <option value="">Pilih akun</option>
      {options.map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}
    </select>
  </label>;
}

export function AccountingEntryView({ accounts, today, role }: { accounts: Account[]; today: string; role: "owner" | "manager" }) {
  const active = (role: Account["role"]) => accounts.find((account) => account.active && account.role === role)?.code ?? "";
  const [type, setType] = useState<EventType>(role === "owner" ? "cash_expense" : "cash_sale");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [cash, setCash] = useState(active("cash"));
  const [toCash, setToCash] = useState(accounts.filter((account) => account.active && account.role === "cash")[1]?.code ?? "");
  const [revenue, setRevenue] = useState(active("revenue"));
  const [expense, setExpense] = useState(active("expense"));
  const [capital, setCapital] = useState(active("capital"));
  const [drawings, setDrawings] = useState(active("drawings"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastSaleJournalId, setLastSaleJournalId] = useState("");
  const sourceId = useRef<string | null>(null);
  const selected = events.find((event) => event.type === type) ?? events[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError("Nominal harus Rupiah bulat lebih dari nol.");
      return;
    }
    if (type === "cash_transfer" && cash === toCash) {
      setError("Akun asal dan tujuan transfer harus berbeda.");
      return;
    }
    sourceId.current ??= crypto.randomUUID();
    const base = { date, description: description.trim(), amount: numericAmount, sourceId: sourceId.current };
    let input: BasicAccountingEvent;
    switch (type) {
      case "cash_sale": input = { ...base, type, cash, revenue }; break;
      case "cash_expense": input = { ...base, type, cash, expense }; break;
      case "capital_contribution": input = { ...base, type, cash, capital }; break;
      case "owner_draw": input = { ...base, type, cash, drawings }; break;
      case "cash_transfer": input = { ...base, type, fromCash: cash, toCash }; break;
    }
    setSaving(true);
    setError("");
    setMessage("");
    setLastSaleJournalId("");
    try {
      const result = await postBasicAccountingEvent(input);
      if (!result.ok) setError(result.message);
      else {
        sourceId.current = null;
        setDescription("");
        setAmount("");
        setMessage("Transaksi berhasil dibukukan. Lihat mutasinya pada buku besar.");
        if (type === "cash_sale" && result.journalId) setLastSaleJournalId(result.journalId);
      }
    } catch {
      setError("Transaksi belum dibukukan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHeading eyebrow="Kegiatan usaha · Input harian" title={role === "owner" ? "Catat transaksi" : "Catat penjualan tunai"}
      description={role === "owner" ? "Catat biaya, modal, prive, dan transfer di sini. Penjualan pelanggan dicatat melalui Kasir agar produk, stok, dan bukti transaksi tersambung." : "Catat penjualan tunai dan cetak struk. Pemilik mengelola produk, stok, dan penjualan tempo."} />
    {role === "owner" && <p className="mb-5 rounded-xl border border-[#e7dfca] bg-[#f8f3e8] p-4 text-sm">Melayani pelanggan? <Link href="/cashier" className="font-semibold text-primary underline">Buka Kasir</Link> untuk penjualan tunai atau tempo.</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]">
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6">
        <label className="block text-sm font-medium">Jenis transaksi
          <select value={type} onChange={(event) => { setType(event.target.value as EventType); sourceId.current = null; setError(""); setLastSaleJournalId(""); }}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
            {events.filter((item) => role === "owner" ? item.type !== "cash_sale" : item.type === "cash_sale").map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Tanggal transaksi
            <input type="date" value={date} max={today} required onChange={(event) => setDate(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </label>
          <label className="block text-sm font-medium">Nominal (Rp)
            <input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" inputMode="numeric" value={amount}
              onChange={(event) => setAmount(event.target.value)} required placeholder="0"
              className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm tabular-nums" />
          </label>
        </div>
        <label className="block text-sm font-medium">Keterangan
          <input value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={250}
            placeholder="Contoh: penjualan hari ini" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <AccountSelect accounts={accounts} role="cash" value={cash} onChange={setCash}
            label={type === "cash_transfer" ? "Akun kas asal (kredit)" : "Akun kas/bank"} />
          {type === "cash_sale" && <AccountSelect accounts={accounts} role="revenue" value={revenue} onChange={setRevenue} label="Akun pendapatan" />}
          {type === "cash_expense" && <AccountSelect accounts={accounts} role="expense" value={expense} onChange={setExpense} label="Akun beban" />}
          {type === "capital_contribution" && <AccountSelect accounts={accounts} role="capital" value={capital} onChange={setCapital} label="Akun modal" />}
          {type === "owner_draw" && <AccountSelect accounts={accounts} role="drawings" value={drawings} onChange={setDrawings} label="Akun prive" />}
          {type === "cash_transfer" && <AccountSelect accounts={accounts} role="cash" value={toCash} onChange={setToCash} label="Akun kas tujuan (debit)" />}
        </div>
        <button disabled={saving} type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Membukukan…" : "Bukukan transaksi"}</button>
        {message && <p role="status" className="text-sm text-[#356548]">{message} {lastSaleJournalId && <Link className="font-semibold underline" href={`/accounting/entries/${lastSaleJournalId}/receipt`}>Cetak struk</Link>} {role === "owner" && <Link className="font-semibold underline" href="/accounting/reports">Buka laporan</Link>}</p>}
        {error && <p role="alert" className="text-sm text-[#812e22]">{error}</p>}
      </form>
      <aside className="h-fit space-y-4">
        <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Jurnal otomatis</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.explanation}</p>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Nomor sumber dibuat otomatis dan digunakan untuk mencegah pembukuan ganda saat permintaan diulang.</p>
        </section>
        <section className="rounded-xl border border-[#e7dfca] bg-[#f8f3e8] p-5 text-xs leading-5 text-[#594c35]">
          {role === "owner" ? <>Jika usaha sudah memiliki aset, utang, atau modal, isi <Link className="font-semibold underline" href="/accounting/opening">saldo pembuka</Link> sebelum transaksi pertama.</> : "Pengelola hanya dapat membukukan penjualan tunai. Pemilik mengatur akun, stok, dan laporan keuangan."} Transaksi yang dibukukan langsung muncul pada buku kas dan proyeksi.
        </section>
      </aside>
    </div>
  </>;
}
