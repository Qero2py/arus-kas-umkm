"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, WalletCards } from "lucide-react";

export function LoginView() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    setNotice("Mode demo aktif. Autentikasi belum terhubung ke Supabase.");
    window.setTimeout(() => router.push("/dashboard"), 450);
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(360px,.9fr)_1.1fr]">
      <section className="relative hidden overflow-hidden bg-[#244f3e] px-10 py-12 text-[#f8f5ec] lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="absolute -right-36 top-20 size-[440px] rounded-full border border-white/10" /><div className="absolute -right-20 top-36 size-[320px] rounded-full border border-white/10" /><div className="absolute -right-4 top-52 size-[200px] rounded-full border border-white/10" />
        <Link href="/dashboard" className="relative inline-flex w-fit items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[#e5cc8e] text-[#244f3e]"><WalletCards size={19} /></span><span><span className="block text-[15px] font-semibold">Arus</span><span className="mt-0.5 block text-xs uppercase tracking-[0.2em] text-white/55">Kas usaha</span></span></Link>
        <div className="relative max-w-lg pb-12"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e5cc8e]">Buku kas yang lebih terang</p><h1 className="mt-4 text-[38px] font-semibold leading-[1.12] tracking-[-0.045em] xl:text-[46px]">Kenali kondisi kas sebelum jadi kejutan.</h1><p className="mt-5 max-w-md text-sm leading-6 text-white/85">Catat uang masuk dan keluar, lihat kewajiban mendatang, lalu tinjau proyeksi dengan asumsi yang terbuka.</p><div className="mt-9 flex items-center gap-3 border-t border-white/30 pt-5 text-sm text-white/85"><span className="grid size-9 place-items-center rounded-full bg-white/10 text-[#e5cc8e]"><LockKeyhole size={16} /></span>Pratinjau ini hanya memakai data contoh.</div></div>
        <p className="relative text-xs text-white/75">Prototipe pemantauan arus kas · Rupiah</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[380px]">
          <Link href="/dashboard" className="mb-10 inline-flex items-center gap-2 lg:hidden"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><WalletCards size={17} /></span><span className="text-sm font-semibold">Arus</span></Link>
          <div className="mb-7 inline-flex items-center gap-1.5 rounded-full border border-[#e7dfca] bg-[#f8f3e8] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.13em] text-[#80652e]"><span className="size-1.5 rounded-full bg-[#b89146]" />Pratinjau antarmuka</div>
          <h2 className="text-[28px] font-semibold tracking-[-0.04em]">Pratinjau Arus</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Lihat data contoh tanpa membuat akun atau memasukkan kata sandi.</p>
          <Link href="/dashboard" className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Buka demo tanpa akun <ArrowRight size={17} /></Link>
          <p className="mt-7 border-t border-border pt-5 text-sm font-semibold">Contoh formulir masuk</p>
          <form onSubmit={submit} onChange={() => { if (formError) setFormError(""); }} onInvalidCapture={() => setFormError("Masukkan alamat email yang valid dan kata sandi untuk membuka demo.")} className="mt-7 space-y-4">
            <label className="block text-sm font-semibold">Email usaha<input type="email" required autoComplete="email" placeholder="nama@usaha.id" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm font-normal outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10" /></label>
            <label className="block text-sm font-semibold">Kata sandi<div className="relative mt-1.5"><input type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Masukkan kata sandi" className="h-11 w-full rounded-lg border border-border bg-card px-3.5 pr-11 text-sm font-normal outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-secondary">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {formError && <p role="alert" className="rounded-xl border border-[#dba99f] bg-[#fff3f0] px-3 py-2.5 text-sm font-medium text-[#812e22]">{formError}</p>}
            {notice && <p role="status" className="rounded-xl border border-[#e7dfca] bg-[#f8f3e8] px-3 py-2.5 text-xs leading-5 text-[#716346]">{notice}</p>}
            <button type="submit" disabled={isSubmitting} className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-75">{isSubmitting ? <><LoaderCircle size={16} className="animate-spin" /> Membuka demo…</> : <>Masuk ke demo <ArrowRight size={14} /></>}</button>
          </form>
          <p className="mt-5 text-center text-sm leading-6 text-muted-foreground">Form ini contoh tampilan. Email dan kata sandi tidak diperiksa. Jangan masukkan kata sandi asli.</p>
        </div>
      </section>
    </main>
  );
}
