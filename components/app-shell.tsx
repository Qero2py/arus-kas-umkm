"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight, BarChart3, BookOpenText, Boxes, ChartNoAxesCombined, ChevronRight,
  CircleDollarSign, ClipboardList, ContactRound, FileChartColumn, Landmark,
  LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, WalletCards, X,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/actions/workspace";
import { useDemoSettings } from "@/components/demo-settings-provider";
import { useDemoLedger } from "@/components/demo-ledger-provider";

type NavItem = { href: string; label: string; icon: LucideIcon; ownerOnly?: boolean; liveOnly?: boolean; previewOnly?: boolean };
type NavSection = { title: string; items: NavItem[] };

const sections: NavSection[] = [
  { title: "Ringkasan", items: [
    { href: "/dashboard", label: "Beranda", icon: LayoutDashboard },
    { href: "/projection", label: "Proyeksi kas", icon: ChartNoAxesCombined, ownerOnly: true },
  ] },
  { title: "Kegiatan usaha", items: [
    { href: "/transactions", label: "Kas & bank", icon: ArrowLeftRight },
    { href: "/accounting/credit", label: "Tagihan tempo", icon: CircleDollarSign, liveOnly: true, ownerOnly: true },
    { href: "/accounting/inventory", label: "Produk & stok", icon: Boxes, liveOnly: true, ownerOnly: true },
    { href: "/accounting/assets", label: "Aset tetap", icon: Landmark, liveOnly: true, ownerOnly: true },
    { href: "/obligations", label: "Utang & piutang", icon: CircleDollarSign, previewOnly: true },
  ] },
  { title: "Laporan", items: [
    { href: "/accounting/statements", label: "Laporan keuangan", icon: FileChartColumn, liveOnly: true, ownerOnly: true },
    { href: "/accounting/cash-flow", label: "Arus kas aktual", icon: ChartNoAxesCombined, liveOnly: true, ownerOnly: true },
    { href: "/accounting/sales", label: "Analisis penjualan", icon: BarChart3, liveOnly: true, ownerOnly: true },
    { href: "/accounting/reports", label: "Jurnal & buku besar", icon: BookOpenText, liveOnly: true, ownerOnly: true },
  ] },
  { title: "Data & pengaturan", items: [
    { href: "/accounting/contacts", label: "Pelanggan & pemasok", icon: ContactRound, liveOnly: true, ownerOnly: true },
    { href: "/accounting/accounts", label: "Daftar akun", icon: ClipboardList, liveOnly: true, ownerOnly: true },
    { href: "/accounting/opening", label: "Saldo pembuka", icon: WalletCards, liveOnly: true, ownerOnly: true },
    { href: "/accounting/controls", label: "Tutup buku & koreksi", icon: ShieldCheck, liveOnly: true, ownerOnly: true },
    { href: "/settings", label: "Pengaturan usaha", icon: Settings2, ownerOnly: true },
    { href: "/access", label: "Hak akses", icon: ShieldCheck, liveOnly: true, ownerOnly: true },
  ] },
];

type SidebarProps = {
  pathname: string; live: boolean; role: "owner" | "manager";
  businessName: string; ownerEmail: string; onNavigate?: () => void; onSignOut: () => void;
};

function SidebarContent({ pathname, live, role, businessName, ownerEmail, onNavigate, onSignOut }: SidebarProps) {
  return <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
    <div className="flex min-h-[78px] items-center gap-3 border-b border-sidebar-border px-5">
      <Link href="/dashboard" onClick={onNavigate} className="grid size-11 place-items-center rounded-2xl bg-sidebar-primary text-xl font-black text-sidebar-primary-foreground shadow-lg shadow-black/10" aria-label="Arus, ke beranda">a.</Link>
      <div><p className="text-lg font-bold tracking-[-0.06em]">arus<span className="text-sidebar-primary">.</span></p><p className="text-[11px] text-sidebar-foreground/65">Pembukuan usaha lebih jelas</p></div>
    </div>
    <div className="mx-4 mt-5 rounded-2xl border border-sidebar-border bg-sidebar-accent/75 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-sidebar-foreground/60">Usaha aktif</p>
      <p className="mt-1 truncate text-sm font-semibold" title={businessName}>{businessName}</p>
      <p className="mt-1 text-xs text-sidebar-foreground/70">{live ? (role === "owner" ? "Akun pemilik" : "Akun pengelola") : "Pratinjau produk"}</p>
    </div>
    <nav className="mt-3 flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2" aria-label="Navigasi utama">
      {sections.map((section) => {
        const items = section.items.filter((item) => {
          if (item.liveOnly && !live) return false;
          if (item.previewOnly && live && role !== "manager") return false;
          if (item.ownerOnly && live && role !== "owner") return false;
          return true;
        });
        if (!items.length) return null;
        return <div key={section.title}>
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-sidebar-foreground/55">{section.title}</p>
          <div className="space-y-0.5">{items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              || (item.href === "/transactions" && pathname.startsWith("/accounting/entries"));
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-all duration-200 motion-safe:hover:translate-x-1 ${active ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/78 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
              <Icon size={17} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" /><span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={15} aria-hidden="true" />}
            </Link>;
          })}</div>
        </div>;
      })}
    </nav>
    <div className="border-t border-sidebar-border p-4">
      <p className="truncate px-2 text-xs text-sidebar-foreground/70" title={ownerEmail}>{live ? ownerEmail : "Mode pratinjau"}</p>
      {live && <button type="button" onClick={onSignOut} className="mt-2 flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-sidebar-foreground/85 hover:bg-sidebar-accent"><LogOut size={16} aria-hidden="true" />Keluar akun</button>}
    </div>
  </div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready: settingsReady, storageError: settingsError, resetDemo: resetSettings } = useDemoSettings();
  const { ready: ledgerReady, storageError: ledgerError, resetDemo: resetLedger, live, businessName, ownerEmail, role } = useDemoLedger();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mobileSidebar = useRef<HTMLElement>(null);
  const [resetFailed, setResetFailed] = useState(false);
  const storageUnavailable = settingsError === "unavailable" || ledgerError === "unavailable";
  const storageInvalid = settingsError === "invalid" || ledgerError === "invalid";
  const remoteError = settingsError === "remote" || ledgerError === "remote";
  const dataReady = settingsReady && ledgerReady;
  const dataError = storageUnavailable || storageInvalid || remoteError;
  const currentItem = sections.flatMap((section) => section.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const currentSection = pathname.startsWith("/accounting/entries") ? "Kas & bank" : currentItem?.label ?? "Beranda";

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocusTo = menuButton.current;
    document.body.style.overflow = "hidden";
    mobileSidebar.current?.querySelector<HTMLButtonElement>('button[aria-label="Tutup menu"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileOpen(false); return; }
      if (event.key !== "Tab" || !mobileSidebar.current) return;
      const focusable = [...mobileSidebar.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      returnFocusTo?.focus();
    };
  }, [mobileOpen]);

  function restoreInvalidDemoData() {
    if (!window.confirm("Data demo yang rusak akan diganti dengan data contoh awal. Perubahan pada bagian itu akan hilang. Lanjutkan?")) return;
    const settingsRestored = settingsError === "invalid" ? resetSettings() : true;
    const ledgerRestored = ledgerError === "invalid" ? resetLedger() : true;
    setResetFailed(!settingsRestored || !ledgerRestored);
  }

  async function handleSignOut() {
    setMobileOpen(false);
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  const sidebarProps = { pathname, live, role, businessName, ownerEmail, onSignOut: () => void handleSignOut() };
  return <div className="min-h-screen bg-background lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
    <aside className="sticky top-0 hidden h-screen lg:block"><SidebarContent {...sidebarProps} /></aside>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" className="absolute inset-0 bg-[#122820]/70 backdrop-blur-[2px]" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} />
      <aside ref={mobileSidebar} id="mobile-sidebar" role="dialog" aria-modal="true" aria-label="Menu navigasi" className="sidebar-enter relative h-full w-[min(320px,88vw)] shadow-2xl">
        <SidebarContent {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
        <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 grid size-10 place-items-center rounded-xl text-sidebar-foreground hover:bg-sidebar-accent" aria-label="Tutup menu"><X size={20} /></button>
      </aside>
    </div>}
    <div className="min-w-0">
      <header className="sticky top-0 z-30 flex min-h-[68px] items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
        <button ref={menuButton} type="button" onClick={() => setMobileOpen(true)} className="grid size-11 place-items-center rounded-xl border border-border bg-card text-foreground lg:hidden" aria-label="Buka menu" aria-expanded={mobileOpen} aria-controls="mobile-sidebar"><Menu size={20} /></button>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ruang kerja</p><p className="truncate text-sm font-semibold">{currentSection}</p></div>
        <span className="hidden max-w-56 truncate rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground sm:block">{live && !dataReady ? "Memuat usaha…" : businessName}</span>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-6 sm:px-7 sm:pt-8 lg:px-10">
        {!dataReady ? <div role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">{live ? "Memuat data usaha…" : "Memuat data contoh…"}</div>
          : dataError ? <section role="alert" className="max-w-xl rounded-xl border border-[#dba99f] bg-[#fff3f0] p-5 text-[#812e22] sm:p-6">
            <h1 className="text-lg font-semibold">{remoteError ? "Data usaha belum bisa dimuat" : "Data demo belum bisa dibuka"}</h1>
            <p className="mt-2 text-sm leading-6">{remoteError ? "Periksa koneksi, lalu muat ulang halaman. Jika masalah berlanjut, pastikan tabel dan kebijakan database sudah diterapkan." : storageUnavailable ? "Penyimpanan browser tidak tersedia. Periksa pengaturan penyimpanan situs, lalu muat ulang halaman." : "Sebagian data demo tersimpan tidak dapat dibaca. Anda dapat mencoba memuat ulang atau memulihkan bagian yang bermasalah dengan data contoh awal."}</p>
            {resetFailed && <p className="mt-3 text-sm font-semibold">Pemulihan gagal karena browser belum dapat menyimpan data. Periksa pengaturan penyimpanan situs.</p>}
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border border-[#a65245] px-4 text-sm font-semibold">Muat ulang</button>{storageInvalid && !storageUnavailable && <button type="button" onClick={restoreInvalidDemoData} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Pulihkan data contoh</button>}</div>
          </section> : null}
        <div className="page-enter" hidden={!dataReady || Boolean(dataError)}>{children}</div>
        <footer className="mt-14 flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-5 text-xs text-muted-foreground"><span>arus. · {businessName}</span><span>{live ? "Data usaha tersimpan" : "Pratinjau produk · Data simulasi"}</span></footer>
      </main>
    </div>
  </div>;
}
