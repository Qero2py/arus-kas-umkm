import type { ReactNode } from "react";
import Link from "next/link";

const links = [
  { href: "/accounting/accounts", label: "Daftar akun" },
  { href: "/accounting/opening", label: "Saldo pembuka" },
  { href: "/accounting/entries", label: "Catat transaksi" },
  { href: "/accounting/contacts", label: "Kontak" },
  { href: "/accounting/credit", label: "Penjualan & pembelian tempo" },
  { href: "/accounting/inventory", label: "Produk & stok" },
  { href: "/accounting/assets", label: "Aset tetap" },
  { href: "/accounting/reports", label: "Buku besar & neraca saldo" },
  { href: "/accounting/statements", label: "Laba rugi & posisi keuangan" },
  { href: "/accounting/controls", label: "Tutup buku & koreksi" },
];

export default function AccountingLayout({ children }: { children: ReactNode }) {
  return <>
    <nav aria-label="Modul akuntansi" className="mb-7 flex flex-wrap gap-2 border-b border-border pb-4">
      {links.map((link) => <Link key={link.href} href={link.href}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:border-primary hover:text-primary">
        {link.label}
      </Link>)}
    </nav>
    {children}
  </>;
}
