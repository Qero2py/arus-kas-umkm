"use client";

import { useState, type FormEvent } from "react";
import { Check, CircleHelp, Info, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { useDemoSettings } from "@/components/demo-settings-provider";
import { useDemoLedger } from "@/components/demo-ledger-provider";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";

const surface = "rounded-xl border border-border/80 bg-card";

export function SettingsView() {
  const { ready } = useDemoSettings();
  return <SettingsForm key={ready ? "loaded" : "loading"} />;
}

function SettingsForm() {
  const { settings, saveSettings } = useDemoSettings();
  const { asOf, live } = useDemoLedger();
  const [openingBalance, setOpeningBalance] = useState(String(settings.openingBalance));
  const [threshold, setThreshold] = useState(String(settings.threshold));
  const [horizon, setHorizon] = useState<7 | 14 | 30>(settings.horizon);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextOpening = Number(openingBalance);
    const nextThreshold = Number(threshold);
    if (!Number.isSafeInteger(nextOpening) || nextOpening < 0 || !Number.isSafeInteger(nextThreshold) || nextThreshold < 0) {
      setSaved(false);
      setFormError("Masukkan nominal rupiah berupa angka bulat 0 atau lebih.");
      return;
    }
    setSaving(true);
    let persisted = false;
    try { persisted = await saveSettings({ openingBalance: nextOpening, threshold: nextThreshold, horizon }); } catch { persisted = false; }
    setSaving(false);
    if (!persisted) {
      setSaved(false);
      setFormError(live ? "Pengaturan belum tersimpan. Periksa koneksi lalu coba lagi." : "Pengaturan belum tersimpan. Periksa ruang penyimpanan browser lalu coba lagi.");
      return;
    }
    setFormError("");
    setSaved(true);
  }

  return (
    <>
      <PageHeading eyebrow={`Pengaturan · ${live ? "Per" : "Data contoh per"} ${formatDemoDate(asOf)}`} title="Atur dasar pemantauan." description="Saldo awal mengubah saldo kas dan proyeksi. Batas aman menentukan kapan peringatan muncul." />
      <form onSubmit={submit} onInvalidCapture={() => setFormError("Periksa kembali kolom yang wajib diisi dan pastikan nominalnya tidak negatif.")} className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
        <div className="space-y-4">
          <section className={`${surface} p-5 sm:p-6`}>
            <div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-secondary text-primary"><SlidersHorizontal size={17} /></div><div><h2 className="text-[14px] font-semibold">Saldo dan batas aman</h2><p className="mt-1 text-xs text-muted-foreground">Gunakan angka yang mewakili kondisi usaha saat ini.</p></div></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Saldo awal usaha (Rp)<input value={openingBalance} onChange={(event) => { setOpeningBalance(event.target.value); setSaved(false); setFormError(""); }} type="number" required min="0" step="1" inputMode="numeric" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium tabular-nums outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" /><span className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground">Saldo sebelum semua transaksi dalam buku kas {live ? "usaha" : "demo"}.</span></label>
              <label className="block text-sm font-semibold">Batas aman saldo (Rp)<input value={threshold} onChange={(event) => { setThreshold(event.target.value); setSaved(false); setFormError(""); }} type="number" required min="0" step="1" inputMode="numeric" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium tabular-nums outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" /><span className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground">Peringatan muncul jika proyeksi lebih rendah dari batas ini.</span></label>
            </div>
          </section>

          <section className={`${surface} p-5 sm:p-6`}>
            <div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[#f7efde] text-[#95733a]"><CircleHelp size={17} /></div><div><h2 className="text-[14px] font-semibold">Rentang pandangan ke depan</h2><p className="mt-1 text-xs text-muted-foreground">Pilih berapa hari yang tampil saat membuka proyeksi kas.</p></div></div>
            <div className="mt-5 grid grid-cols-3 gap-2">{([7, 14, 30] as const).map((value) => <button key={value} type="button" aria-pressed={horizon === value} onClick={() => { setHorizon(value); setSaved(false); }} className={`flex min-h-[72px] flex-col items-start justify-center rounded-xl border px-3 text-left transition-colors ${horizon === value ? "border-primary bg-[#eef3ed] text-primary ring-1 ring-primary/15" : "border-border bg-background text-foreground hover:bg-secondary/60"}`}><span className="text-[17px] font-semibold tracking-tight">{value} <span className="text-xs font-medium">hari</span></span><span className="mt-1 text-xs text-muted-foreground">{value === 7 ? "Minggu ini" : value === 14 ? "Dua minggu" : "Satu bulan"}</span></button>)}</div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"><Save size={14} /> {saving ? "Menyimpan…" : "Simpan pengaturan"}</button>
            {saved && <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#356548]"><Check size={13} /> {live ? "Tersimpan pada akun usaha" : "Tersimpan di browser ini"}</span>}
          </div>
          {formError && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] px-4 py-3 text-sm font-medium text-[#812e22]">{formError}</p>}
        </div>

        <aside className="space-y-4">
          <section className={`${surface} p-5 sm:p-6`}>
            <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /><h2 className="text-sm font-semibold">Ringkasan pengaturan</h2></div>
            <dl className="mt-4 divide-y divide-border/70 text-xs">
              <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">Saldo awal</dt><dd className="font-semibold tabular-nums">{formatRupiah(Number(openingBalance) || 0)}</dd></div>
              <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">Batas aman</dt><dd className="font-semibold tabular-nums">{formatRupiah(Number(threshold) || 0)}</dd></div>
              <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">Horizon utama</dt><dd className="font-semibold">{horizon} hari</dd></div>
              <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">Data</dt><dd><StatusPill tone={live ? "green" : "amber"}>{live ? "Akun usaha" : "Simulasi lokal"}</StatusPill></dd></div>
            </dl>
          </section>
          <section className="rounded-xl border border-[#e7dfca] bg-[#f8f3e8] p-4 text-sm leading-6 text-[#594c35]"><div className="flex gap-2"><Info size={17} className="mt-0.5 shrink-0" /><p>{live ? "Data tersimpan pada usaha yang terhubung ke akun Anda. Periksa saldo awal sebelum meninjau proyeksi." : "Data contoh disimpan di browser ini. Jangan masukkan data keuangan usaha yang sebenarnya ke dalam pratinjau."}</p></div></section>
        </aside>
      </form>
    </>
  );
}
