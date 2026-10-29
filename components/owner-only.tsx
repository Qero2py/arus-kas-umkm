import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ownerContext } from "@/lib/supabase/workspace";

export async function OwnerOnly({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return children;
  await connection();
  const context = await ownerContext();
  if (context.status === "unauthorized") redirect("/login");
  if (context.status === "onboarding") redirect("/onboarding");
  if (context.status !== "ok" || context.role !== "owner") redirect("/dashboard");
  return children;
}
