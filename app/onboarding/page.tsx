import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { OnboardingView } from "@/components/onboarding-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ownerContext } from "@/lib/supabase/workspace";

async function OnboardingContent() {
  await connection();
  const context = await ownerContext();
  if (context.status === "unauthorized") redirect("/login");
  if (context.status === "ok") redirect("/dashboard");
  if (context.status === "error") return <p role="alert" className="p-6">Akses usaha belum bisa diperiksa. Muat ulang halaman.</p>;
  return <OnboardingView />;
}

export default function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard");
  return <Suspense fallback={<p role="status" className="p-6">Memeriksa akun…</p>}><OnboardingContent /></Suspense>;
}
