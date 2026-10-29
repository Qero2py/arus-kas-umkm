"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LoginError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Login page failed to render", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <section role="alert" className="w-full max-w-md border-l-4 border-[#a14432] bg-[#fff8f6] p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-[#812e22]">Halaman masuk belum bisa dibuka</h1>
        <p className="mt-2 text-sm leading-6 text-foreground">Coba muat ulang halaman. Anda juga bisa kembali ke pratinjau dashboard.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" onClick={retry} className="h-11">Coba lagi</Button>
          <Link href="/dashboard" className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-secondary">Buka dashboard demo</Link>
        </div>
      </section>
    </main>
  );
}
