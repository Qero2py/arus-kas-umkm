"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBusiness, redeemManagerInvite } from "@/app/actions/workspace";

export function OnboardingView() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"owner" | "manager">("owner");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await createBusiness({
        name: String(form.get("name") ?? "").trim(),
        openingBalance: Number(form.get("openingBalance")),
        threshold: Number(form.get("threshold")), horizon: 30,
      });
      if (!result.ok) setError(result.message);
      else { router.push("/dashboard"); router.refresh(); }
    } catch {
      setError("Usaha belum tersimpan. Coba lagi sebentar lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await redeemManagerInvite(String(form.get("code") ?? ""));
      if (!result.ok) setError(result.message);
      else { router.push("/dashboard"); router.refresh(); }
    } catch {
      setError("Belum bisa bergabung. Coba lagi sebentar lagi.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-background px-5 py-10"><div className="w-full max-w-[440px]">
    <p className="text-lg font-semibold text-primary">arus.</p>
    <h1 className="mt-8 font-serif text-[34px] leading-tight">{mode === "owner" ? "Siapkan usaha Anda" : "Gabung ke usaha"}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === "owner" ? "Mulai dari nama usaha dan saldo sebelum transaksi pertama yang akan dicatat. Anda bisa mengubah batas aman nanti." : "Masukkan kode yang diberikan pemilik usaha. Akun Anda akan menjadi pengelola usaha tersebut."}</p>
    <div className="mt-6 flex gap-2" aria-label="Pilih cara memulai">
      <button type="button" onClick={() => { setMode("owner"); setError(""); }} aria-pressed={mode === "owner"} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${mode === "owner" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>Buat usaha</button>
      <button type="button" onClick={() => { setMode("manager"); setError(""); }} aria-pressed={mode === "manager"} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${mode === "manager" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>Punya kode undangan</button>
    </div>
    {mode === "owner" ? <form onSubmit={submit} className="mt-7 space-y-4">
      {error && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] p-3 text-sm text-[#812e22]">{error}</p>}
      <label className="block text-sm font-semibold">Nama usaha<input name="name" required maxLength={100} placeholder="Contoh: Kedai Pagi" className="mt-1.5 h-12 w-full rounded-lg border border-border bg-card px-3 font-normal" /></label>
      <label className="block text-sm font-semibold">Saldo awal (Rp)<input name="openingBalance" required type="number" min="0" step="1" inputMode="numeric" defaultValue="0" className="mt-1.5 h-12 w-full rounded-lg border border-border bg-card px-3 font-normal" /></label>
      <label className="block text-sm font-semibold">Batas aman saldo (Rp)<input name="threshold" required type="number" min="0" step="1" inputMode="numeric" defaultValue="0" className="mt-1.5 h-12 w-full rounded-lg border border-border bg-card px-3 font-normal" /></label>
      <button type="submit" disabled={busy} className="h-12 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Menyimpan…" : "Mulai mencatat"}</button>
    </form> : <form onSubmit={join} className="mt-7 space-y-4">
      {error && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] p-3 text-sm text-[#812e22]">{error}</p>}
      <label className="block text-sm font-semibold">Kode undangan<input name="code" required maxLength={40} autoComplete="off" spellCheck={false} placeholder="Tempel kode dari pemilik" className="mt-1.5 h-12 w-full rounded-lg border border-border bg-card px-3 font-normal uppercase" /></label>
      <p className="text-sm leading-6 text-muted-foreground">Kode berlaku satu kali selama tujuh hari.</p>
      <button type="submit" disabled={busy} className="h-12 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Memproses…" : "Gabung ke usaha"}</button>
    </form>}
  </div></main>;
}
