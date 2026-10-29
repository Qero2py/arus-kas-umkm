"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "@/app/actions/workspace";
import { useDemoSettings } from "@/components/demo-settings-provider";
import { useDemoLedger } from "@/components/demo-ledger-provider";

const navItems = [
  { href: "/dashboard", label: "Dashboard", ownerOnly: false },
  { href: "/transactions", label: "Buku kas", ownerOnly: false },
  { href: "/obligations", label: "Utang & piutang", ownerOnly: false },
  { href: "/projection", label: "Proyeksi", ownerOnly: true },
  { href: "/settings", label: "Pengaturan", ownerOnly: true },
  { href: "/access", label: "Akses", ownerOnly: true, liveOnly: true },
];

const sectionNames: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/transactions": "Buku kas",
  "/obligations": "Utang & piutang",
  "/projection": "Proyeksi kas",
  "/settings": "Pengaturan",
  "/access": "Akses usaha",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentSection = sectionNames[pathname] ?? "Dashboard";
  const { ready: settingsReady, storageError: settingsError, resetDemo: resetSettings } = useDemoSettings();
  const { ready: ledgerReady, storageError: ledgerError, resetDemo: resetLedger, live, businessName, ownerEmail, role } = useDemoLedger();
  const visibleNav = navItems.filter((item) => (!item.liveOnly || live) && (!item.ownerOnly || !live || role === "owner"));
  const [resetFailed, setResetFailed] = useState(false);
  const storageUnavailable = settingsError === "unavailable" || ledgerError === "unavailable";
  const storageInvalid = settingsError === "invalid" || ledgerError === "invalid";
  const remoteError = settingsError === "remote" || ledgerError === "remote";
  const dataReady = settingsReady && ledgerReady;
  const dataError = storageUnavailable || storageInvalid || remoteError;
  const ownerLabel = live ? (ownerEmail.split("@")[0] || "Akun") : "Nadia";

  function restoreInvalidDemoData() {
    if (!window.confirm("Data demo yang rusak akan diganti dengan data contoh awal. Perubahan pada bagian itu akan hilang. Lanjutkan?")) return;
    const settingsRestored = settingsError === "invalid" ? resetSettings() : true;
    const ledgerRestored = ledgerError === "invalid" ? resetLedger() : true;
    setResetFailed(!settingsRestored || !ledgerRestored);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/80 bg-background">
        <div className="mx-auto flex min-h-[72px] max-w-[1280px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-12">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5" aria-label="Arus, ke dashboard">
            <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-[15px] font-semibold text-primary-foreground">a.</span>
            <span className="text-[17px] font-semibold tracking-[-0.05em]">arus<span className="text-primary">.</span></span>
          </Link>
          <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex" aria-label="Navigasi utama">
            {visibleNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-secondary font-semibold text-foreground ring-1 ring-border" : "font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{item.label}</Link>;
            })}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!live && <span className="hidden items-center gap-1.5 text-xs font-medium text-foreground sm:inline-flex"><span className="size-2 rounded-full bg-[#aa884c]" />Pratinjau</span>}
            <span className="hidden h-5 w-px bg-border sm:block" />
            <span className="max-w-28 truncate text-right sm:max-w-40"><span className="block truncate text-sm font-medium">{live && !dataReady ? "Memuat…" : ownerLabel}</span><span className="block truncate text-xs text-muted-foreground">{live && !dataReady ? "Usaha" : `${businessName}${live ? ` · ${role === "owner" ? "Pemilik" : "Pengelola"}` : ""}`}</span></span>
            {live && dataReady ? <button type="button" onClick={async () => { await signOut(); router.replace("/login"); router.refresh(); }} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-primary underline underline-offset-4">Keluar</button> : <span className="grid size-8 place-items-center rounded-full bg-[#e8dfca] text-xs font-semibold text-[#594c35]">NP</span>}
          </div>
        </div>
        <div className="border-t border-border/60 md:hidden">
          <nav className="mx-auto grid max-w-[1280px] grid-cols-3 gap-1 px-4 py-2 sm:px-7" aria-label="Navigasi utama">
            {visibleNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center justify-center rounded-md px-1 py-2 text-center text-xs sm:text-sm ${active ? "bg-primary font-semibold text-primary-foreground" : "font-medium text-foreground hover:bg-secondary"}`}>{item.label}</Link>;
            })}
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1280px] items-center gap-2 px-5 pt-5 text-xs text-muted-foreground sm:px-8 lg:px-12">
        <span>Usaha</span><span aria-hidden="true">/</span><span className="text-foreground">{currentSection}</span>
      </div>
      <main className="mx-auto w-full max-w-[1280px] px-5 pb-12 pt-5 sm:px-8 sm:pt-7 lg:px-12">
        {!dataReady ? <div role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">{live ? "Memuat data usaha…" : "Memuat data contoh…"}</div>
          : dataError ? <section role="alert" className="max-w-xl rounded-xl border border-[#dba99f] bg-[#fff3f0] p-5 text-[#812e22] sm:p-6">
            <h1 className="text-lg font-semibold">{remoteError ? "Data usaha belum bisa dimuat" : "Data demo belum bisa dibuka"}</h1>
            <p className="mt-2 text-sm leading-6">{remoteError ? "Periksa koneksi, lalu muat ulang halaman. Jika masalah berlanjut, pastikan tabel dan kebijakan database sudah diterapkan." : storageUnavailable ? "Penyimpanan browser tidak tersedia. Periksa pengaturan penyimpanan situs, lalu muat ulang halaman." : "Sebagian data demo tersimpan tidak dapat dibaca. Anda dapat mencoba memuat ulang atau memulihkan bagian yang bermasalah dengan data contoh awal."}</p>
            {resetFailed && <p className="mt-3 text-sm font-semibold">Pemulihan gagal karena browser belum dapat menyimpan data. Periksa pengaturan penyimpanan situs.</p>}
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border border-[#a65245] px-4 text-sm font-semibold">Muat ulang</button>{storageInvalid && !storageUnavailable && <button type="button" onClick={restoreInvalidDemoData} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Pulihkan data contoh</button>}</div>
          </section> : null}
        <div hidden={!dataReady || dataError}>{children}</div>
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-4 text-xs text-muted-foreground">
          <span>arus. · Catatan kas {live && !dataReady ? "usaha" : businessName}</span>
          <span>{live ? "Data usaha" : "Pratinjau produk · Data simulasi"}</span>
        </footer>
      </main>
    </div>
  );
}
