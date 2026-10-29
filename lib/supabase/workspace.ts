import "server-only";
import { createClient } from "@/lib/supabase/server";
import { daysBetweenDates, formatDemoDate } from "@/lib/demo-calculations";
import type { CashEntry, Obligation } from "@/lib/demo-data";

export type LiveSettings = { openingBalance: number; threshold: number; horizon: 7 | 14 | 30 };
export type LiveLedger = { entries: CashEntry[]; obligations: Obligation[] };
export type LiveWorkspace = {
  businessId: string;
  businessName: string;
  ownerEmail: string;
  role: "owner" | "manager";
  asOf: string;
  settings: LiveSettings;
  ledger: LiveLedger;
};

type BusinessRow = { id: string; owner_id: string; name: string; opening_balance: number; cash_threshold: number; projection_horizon: 7 | 14 | 30 };
type TransactionRow = { id: string; business_id: string; obligation_id: string | null; entry_date: string; title: string; category: string; type: "in" | "out"; amount: number; method: string };
type ObligationRow = { id: string; business_id: string; kind: "utang" | "piutang"; party: string; description: string; obligation_date: string; due_date: string; amount: number };

export function todayInJakarta() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function ownerContext() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (authError || !claims?.sub) return { status: "unauthorized" as const };
  const { data: businessData, error } = await supabase.from("businesses")
    .select("id, owner_id, name, opening_balance, cash_threshold, projection_horizon")
    .eq("owner_id", claims.sub).maybeSingle();
  if (error) return { status: "error" as const };
  if (businessData) return { status: "ok" as const, role: "owner" as const, supabase, ownerId: claims.sub, email: String(claims.email ?? ""), business: businessData as BusinessRow };

  const { data: membership, error: membershipError } = await supabase.from("business_members")
    .select("business_id").eq("user_id", claims.sub).maybeSingle();
  if (membershipError) return { status: "error" as const };
  if (!membership) return { status: "onboarding" as const, supabase, ownerId: claims.sub, email: String(claims.email ?? "") };
  const { data: joinedBusiness, error: businessError } = await supabase.from("businesses")
    .select("id, owner_id, name, opening_balance, cash_threshold, projection_horizon")
    .eq("id", membership.business_id).maybeSingle();
  if (businessError || !joinedBusiness) return { status: "error" as const };
  return { status: "ok" as const, role: "manager" as const, supabase, ownerId: claims.sub, email: String(claims.email ?? ""), business: joinedBusiness as BusinessRow };
}

export async function loadWorkspace(): Promise<{ status: "ok"; workspace: LiveWorkspace } | { status: "unauthorized" | "onboarding" | "error" }> {
  const context = await ownerContext();
  if (context.status !== "ok") return { status: context.status };
  const { supabase, business, email, role } = context;
  const [transactionResult, obligationResult] = await Promise.all([
    supabase.from("transactions").select("id, business_id, obligation_id, entry_date, title, category, type, amount, method").eq("business_id", business.id).order("entry_date", { ascending: false }),
    supabase.from("obligations").select("id, business_id, kind, party, description, obligation_date, due_date, amount").eq("business_id", business.id).order("due_date", { ascending: true }),
  ]);
  if (transactionResult.error || obligationResult.error) return { status: "error" };
  const transactionRows = (transactionResult.data ?? []) as TransactionRow[];
  const obligationRows = (obligationResult.data ?? []) as ObligationRow[];
  const asOf = todayInJakarta();
  const settled = new Map<string, number>();
  for (const row of transactionRows) {
    if (row.obligation_id) settled.set(row.obligation_id, (settled.get(row.obligation_id) ?? 0) + Number(row.amount));
  }
  const entries: CashEntry[] = transactionRows.map((row) => ({
    id: row.id, date: row.entry_date, dateLabel: formatDemoDate(row.entry_date), title: row.title,
    category: row.category, type: row.type, amount: Number(row.amount), method: row.method,
    linkedObligationId: row.obligation_id ?? undefined,
  }));
  const obligations: Obligation[] = obligationRows.map((row) => ({
    id: row.id, kind: row.kind, party: row.party, description: row.description, date: row.obligation_date,
    dueDate: row.due_date, dueLabel: formatDemoDate(row.due_date), dueInDays: daysBetweenDates(asOf, row.due_date),
    amount: Number(row.amount), settled: settled.get(row.id) ?? 0,
  }));
  return { status: "ok", workspace: {
    businessId: business.id, businessName: business.name, ownerEmail: email, role, asOf,
    settings: { openingBalance: Number(business.opening_balance), threshold: Number(business.cash_threshold), horizon: business.projection_horizon },
    ledger: { entries, obligations },
  } };
}
