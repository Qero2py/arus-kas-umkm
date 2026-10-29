"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Dashboard page failed to render", error);
  }, [error]);

  return (
    <section role="alert" className="mx-auto max-w-xl border-l-4 border-[#a14432] bg-[#fff8f6] p-6 sm:p-8">
      <p className="text-sm font-semibold text-[#812e22]">Halaman belum bisa dimuat</p>
      <p className="mt-2 text-sm leading-6 text-foreground">Coba muat ulang halaman. Jika masalah berlanjut, periksa koneksi dan coba masuk kembali.</p>
      <Button type="button" onClick={retry} className="mt-5 h-11">Coba lagi</Button>
    </section>
  );
}
