"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithPassword, signUpWithPassword } from "@/app/actions/workspace";

export function LiveLoginView() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    try {
      if (mode === "signup") {
        const confirmation = String(form.get("confirmPassword") ?? "");
        if (password !== confirmation) {
          setError("Kata sandi dan konfirmasinya tidak sama.");
          return;
        }
        const result = await signUpWithPassword(email, password);
        if (!result.ok) setError(result.message);
        else if (result.signedIn) { router.push("/onboarding"); router.refresh(); }
        else setNotice("Periksa email Anda untuk mengaktifkan akun, lalu masuk.");
      } else {
        const result = await signInWithPassword(email, password);
        if (!result.ok) setError(result.message);
        else { router.push("/dashboard"); router.refresh(); }
      }
    } catch {
      setError("Belum bisa terhubung. Coba lagi sebentar lagi.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-background px-5 py-10">
    <div className="w-full max-w-[420px]">
      <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold text-primary"><span className="grid size-9 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">a.</span>arus.</Link>
      <p className="mt-10 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Kas usaha</p>
      <h1 className="mt-2 font-serif text-[34px] leading-tight">{mode === "signup" ? "Buat akun Arus" : "Masuk ke Arus"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === "signup" ? "Buat akun pemilik untuk mulai mencatat kas usaha Anda." : "Masuk untuk melihat catatan usaha Anda."}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {error && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] p-3 text-sm text-[#812e22]">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-border bg-secondary p-3 text-sm text-foreground">{notice}</p>}
        <label className="block text-sm font-semibold">Email<input name="email" type="email" required autoComplete="email" className="mt-1.5 h-12 w-full rounded-lg border border-border bg-card px-3 font-normal" /></label>
        <label className="block text-sm font-semibold">Kata sandi<input name="password" type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="mt-1.5 h-12 w-full rounded-lg border border-border bg-card px-3 font-normal" /></label>
        {mode === "signup" && <label className="block text-sm font-semibold">Ulangi kata sandi<input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="mt-1.5 h-12 w-full rounded-lg border border-border bg-card px-3 font-normal" /></label>}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Memproses…" : mode === "signup" ? "Buat akun" : "Masuk"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">{mode === "signup" ? "Sudah punya akun?" : "Belum punya akun?"} <button type="button" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); setNotice(""); }} className="font-semibold text-primary underline underline-offset-4">{mode === "signup" ? "Masuk" : "Buat akun"}</button></p>
    </div>
  </main>;
}
