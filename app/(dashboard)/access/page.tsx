import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OwnerOnly } from "@/components/owner-only";
import { AccessView } from "@/components/access-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function AccessPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard");
  return <Suspense fallback={<p role="status">Memeriksa akses…</p>}><OwnerOnly><AccessView /></OwnerOnly></Suspense>;
}
