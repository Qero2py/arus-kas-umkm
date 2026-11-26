"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addAccountingAccount } from "@/app/actions/accounting";
import { PageHeading } from "@/components/page-heading";
import { ACCOUNT_ROLE_DEFAULTS, type Account, type AccountRole } from "@/lib/accounting";

const classes = [
  { key: "asset", label: "Aset" },
  { key: "liability", label: "Liabilitas" },
  { key: "equity", label: "Ekuitas" },
  { key: "revenue", label: "Pendapatan" },
  { key: "expense", label: "Beban" },
] as const;

const roleNames: Record<AccountRole, string> = {
  cash: "Kas, bank, atau dompet digital", receivable: "Piutang", inventory: "Persediaan",
  fixed_asset: "Aset tetap", accumulated_depreciation: "Akumulasi penyusutan",
  payable: "Utang", capital: "Modal", drawings: "Prive", revenue: "Pendapatan",
  cogs: "Harga pokok penjualan", expense: "Beban operasional", depreciation_expense: "Beban penyusutan",
};

export function AccountingAccountsView({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AccountRole>("cash");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await addAccountingAccount({ code, name, role });
      if (!result.ok) setError(result.message);
      else {
        setCode("");
        setName("");
        setMessage("Akun baru tersimpan.");
        router.refresh();
      }
    } catch {
      setError("Akun belum tersimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHeading eyebrow="Akuntansi · Pengaturan awal" title="Daftar akun usaha" description="Kelompokkan kas, piutang, persediaan, utang, modal, pendapatan, dan beban sebelum membukukan transaksi." />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]">
      <div className="space-y-4">
        {classes.map((group) => {
          const items = accounts.filter((account) => account.class === group.key);
          return <section key={group.key} className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">{group.label} <span className="ml-1 font-normal text-muted-foreground">({items.length})</span></h2>
            <div className="mt-3 divide-y divide-border/70">
              {items.map((account) => <div key={account.code} className="flex items-center gap-3 py-3 text-sm">
                <span className="w-14 shrink-0 font-mono text-xs font-semibold tabular-nums text-primary">{account.code}</span>
                <span className="min-w-0 flex-1 font-medium">{account.name}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">{roleNames[account.role]}</span></span>
                <span className="text-xs text-muted-foreground">{account.active ? "Aktif" : "Nonaktif"}</span>
              </div>)}
            </div>
          </section>;
        })}
      </div>
      <aside className="h-fit rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Tambah akun</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Gunakan akun baru untuk rekening atau jenis transaksi yang perlu dipisahkan. Kode akun harus unik.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">Kode akun<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required pattern="[0-9A-Z._-]{2,20}" maxLength={20} placeholder="1040" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary" /></label>
          <label className="block text-sm font-medium">Nama akun<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="Rekening usaha" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
          <label className="block text-sm font-medium">Jenis akun<select value={role} onChange={(event) => setRole(event.target.value as AccountRole)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary">
            {Object.keys(ACCOUNT_ROLE_DEFAULTS).map((key) => <option key={key} value={key}>{roleNames[key as AccountRole]}</option>)}
          </select></label>
          <p className="text-xs leading-5 text-muted-foreground">Klasifikasi debit/kredit ditentukan otomatis dari jenis akun.</p>
          <button disabled={saving} type="submit" className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Menyimpan…" : "Simpan akun"}</button>
          {message && <p role="status" className="text-sm text-[#356548]">{message}</p>}
          {error && <p role="alert" className="text-sm text-[#812e22]">{error}</p>}
        </form>
      </aside>
    </div>
  </>;
}
