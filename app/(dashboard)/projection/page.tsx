import { Suspense } from "react";
import { OwnerOnly } from "@/components/owner-only";
import { ProjectionView } from "@/components/projection-view";

export default function ProjectionPage() {
  return <Suspense fallback={<p role="status">Memeriksa akses…</p>}><OwnerOnly><ProjectionView /></OwnerOnly></Suspense>;
}
