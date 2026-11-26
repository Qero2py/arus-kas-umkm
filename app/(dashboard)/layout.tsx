import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { DemoSettingsProvider } from "@/components/demo-settings-provider";
import { DemoLedgerProvider } from "@/components/demo-ledger-provider";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const live = isSupabaseConfigured();
  return <Suspense fallback={<p role="status" className="p-6 text-sm">Memuat ruang kerja…</p>}>
    <DemoSettingsProvider live={live}><DemoLedgerProvider live={live}><AppShell>{children}</AppShell></DemoLedgerProvider></DemoSettingsProvider>
  </Suspense>;
}
