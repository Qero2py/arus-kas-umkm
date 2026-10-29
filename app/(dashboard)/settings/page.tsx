import { Suspense } from "react";
import { OwnerOnly } from "@/components/owner-only";
import { SettingsView } from "@/components/settings-view";

export default function SettingsPage() {
  return <Suspense fallback={<p role="status">Memeriksa akses…</p>}><OwnerOnly><SettingsView /></OwnerOnly></Suspense>;
}
