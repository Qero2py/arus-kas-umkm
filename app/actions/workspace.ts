"use server";

import { createHash, randomBytes } from "node:crypto";
import { isValidIsoDate } from "@/lib/demo-calculations";
import { createClient } from "@/lib/supabase/server";
import { loadWorkspace, ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

type EntryInput = { date: string; title: string; category: string; type: "in" | "out"; amount: number; method: string };
type ObligationInput = { kind: "utang" | "piutang"; party: string; description: string; date: string; dueDate: string; amount: number };

function positiveAmount(amount: number) { return Number.isSafeInteger(amount) && amount > 0; }
function nonnegativeAmount(amount: number) { return Number.isSafeInteger(amount) && amount >= 0; }
function validText(value: string, max: number) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
function validEntry(input: EntryInput) {
  return isValidIsoDate(input.date) && input.date <= todayInJakarta()
    && validText(input.title, 80) && validText(input.category, 80) && validText(input.method, 40)
    && (input.type === "in" || input.type === "out") && positiveAmount(input.amount);
}

export async function loadLiveWorkspace() { return loadWorkspace(); }

async function updatedWorkspace() {
  const result = await loadWorkspace();
  return result.status === "ok" ? { ok: true as const, workspace: result.workspace } : { ok: false as const };
}

export async function createBusiness(input: { name: string; openingBalance: number; threshold: number; horizon: 7 | 14 | 30 }) {
  if (!validText(input.name, 100) || !nonnegativeAmount(input.openingBalance) || !nonnegativeAmount(input.threshold)
    || ![7, 14, 30].includes(input.horizon)) return { ok: false as const, message: "Periksa nama usaha dan nominalnya." };
  const context = await ownerContext();
  if (context.status !== "onboarding") return { ok: false as const, message: "Akun ini sudah memiliki usaha atau sesi telah berakhir." };
  const { error } = await context.supabase.from("businesses").insert({
    owner_id: context.ownerId, name: input.name.trim(), opening_balance: input.openingBalance,
    cash_threshold: input.threshold, projection_horizon: input.horizon,
  });
  return error ? { ok: false as const, message: "Usaha belum tersimpan. Coba lagi." } : { ok: true as const };
}

export async function saveLiveSettings(input: { openingBalance: number; threshold: number; horizon: 7 | 14 | 30 }) {
  if (!nonnegativeAmount(input.openingBalance) || !nonnegativeAmount(input.threshold) || ![7, 14, 30].includes(input.horizon)) return { ok: false as const };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner") return { ok: false as const };
  const { error } = await context.supabase.from("businesses").update({
    opening_balance: input.openingBalance, cash_threshold: input.threshold, projection_horizon: input.horizon,
  }).eq("id", context.business.id);
  return error ? { ok: false as const } : updatedWorkspace();
}

export async function listBusinessAccess() {
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner") return { ok: false as const, message: "Hanya pemilik yang dapat mengatur akses." };
  const [members, invites] = await Promise.all([
    context.supabase.from("business_members").select("user_id, member_email, joined_at")
      .eq("business_id", context.business.id).order("joined_at", { ascending: false }),
    context.supabase.from("business_invites").select("id, created_at, expires_at, used_at, revoked_at")
      .eq("business_id", context.business.id).order("created_at", { ascending: false }),
  ]);
  if (members.error || invites.error) return { ok: false as const, message: "Daftar akses belum bisa dimuat." };
  return { ok: true as const, members: members.data ?? [], invites: invites.data ?? [] };
}

export async function createManagerInvite() {
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner") return { ok: false as const, message: "Hanya pemilik yang dapat mengundang pengelola." };
  const code = randomBytes(16).toString("hex").toUpperCase();
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error } = await context.supabase.from("business_invites").insert({
    business_id: context.business.id, code_hash: codeHash, expires_at: expiresAt,
  });
  if (error) return { ok: false as const, message: "Kode undangan belum bisa dibuat." };
  return { ok: true as const, code, expiresAt };
}

export async function redeemManagerInvite(code: string) {
  const normalized = code.trim().replaceAll("-", "").toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(normalized)) return { ok: false as const, message: "Kode undangan harus terdiri dari 32 karakter." };
  const context = await ownerContext();
  if (context.status !== "onboarding") return { ok: false as const, message: "Akun ini sudah terhubung ke usaha atau sesi telah berakhir." };
  const codeHash = createHash("sha256").update(normalized).digest("hex");
  const { data, error } = await context.supabase.rpc("redeem_business_invite", { p_code_hash: codeHash });
  if (error || !data) return { ok: false as const, message: "Kode tidak berlaku, sudah digunakan, atau kedaluwarsa." };
  return { ok: true as const };
}

export async function revokeManagerInvite(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false as const };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner") return { ok: false as const };
  const { data, error } = await context.supabase.from("business_invites")
    .update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("business_id", context.business.id)
    .is("used_at", null).is("revoked_at", null).select("id").maybeSingle();
  return { ok: !error && Boolean(data) };
}

export async function removeBusinessManager(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false as const };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner") return { ok: false as const };
  const { data, error } = await context.supabase.from("business_members")
    .delete().eq("business_id", context.business.id).eq("user_id", userId).select("user_id").maybeSingle();
  return { ok: !error && Boolean(data) };
}

export async function addLiveEntry(input: EntryInput) {
  if (!validEntry(input)) return { ok: false as const };
  const context = await ownerContext();
  if (context.status !== "ok") return { ok: false as const };
  const { error } = await context.supabase.from("transactions").insert({
    business_id: context.business.id, entry_date: input.date, title: input.title.trim(),
    category: input.category.trim(), type: input.type, amount: input.amount, method: input.method.trim(),
  });
  return error ? { ok: false as const } : updatedWorkspace();
}

export async function updateLiveEntry(id: string, input: EntryInput) {
  if (!validEntry(input)) return { ok: false as const };
  const context = await ownerContext();
  if (context.status !== "ok") return { ok: false as const };
  const { data: existing, error: readError } = await context.supabase.from("transactions")
    .select("id, obligation_id, type").eq("id", id).eq("business_id", context.business.id).maybeSingle();
  if (readError || !existing) return { ok: false as const };
  if (existing.obligation_id && existing.type !== input.type) return { ok: false as const };
  const correction = existing.obligation_id
    ? { entry_date: input.date, amount: input.amount, method: input.method.trim() }
    : { entry_date: input.date, title: input.title.trim(), category: input.category.trim(), type: input.type, amount: input.amount, method: input.method.trim() };
  const { error } = await context.supabase.from("transactions").update(correction).eq("id", id).eq("business_id", context.business.id);
  return error ? { ok: false as const } : updatedWorkspace();
}

export async function addLiveObligation(input: ObligationInput) {
  if (!validText(input.party, 80) || !validText(input.description, 100) || !isValidIsoDate(input.date)
    || input.date > todayInJakarta() || !isValidIsoDate(input.dueDate)
    || !positiveAmount(input.amount) || (input.kind !== "utang" && input.kind !== "piutang")) return { ok: false as const };
  const context = await ownerContext();
  if (context.status !== "ok") return { ok: false as const };
  const { error } = await context.supabase.from("obligations").insert({
    business_id: context.business.id, kind: input.kind, party: input.party.trim(),
    description: input.description.trim(), obligation_date: input.date, due_date: input.dueDate, amount: input.amount,
  });
  return error ? { ok: false as const } : updatedWorkspace();
}

export async function updateLiveObligation(id: string, input: Omit<ObligationInput, "kind">) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !validText(input.party, 80) || !validText(input.description, 100)
    || !isValidIsoDate(input.date) || input.date > todayInJakarta()
    || !isValidIsoDate(input.dueDate) || !positiveAmount(input.amount)) return { ok: false as const };
  const context = await ownerContext();
  if (context.status !== "ok") return { ok: false as const };
  const { data, error } = await context.supabase.from("obligations")
    .update({ party: input.party.trim(), description: input.description.trim(), obligation_date: input.date,
      due_date: input.dueDate, amount: input.amount })
    .eq("id", id).eq("business_id", context.business.id).select("id").maybeSingle();
  return error || !data ? { ok: false as const } : updatedWorkspace();
}

export async function recordLivePayment(id: string, amount: number, method: string) {
  if (!positiveAmount(amount) || !validText(method, 40)) return { ok: false as const };
  const context = await ownerContext();
  if (context.status !== "ok") return { ok: false as const };
  const { data: item, error: readError } = await context.supabase.from("obligations")
    .select("id, kind, party").eq("id", id).eq("business_id", context.business.id).maybeSingle();
  if (readError || !item) return { ok: false as const };
  const { error } = await context.supabase.from("transactions").insert({
    business_id: context.business.id, obligation_id: id, entry_date: todayInJakarta(),
    title: `${item.kind === "utang" ? "Pembayaran ke" : "Penerimaan dari"} ${item.party}`.slice(0, 80),
    category: item.kind === "utang" ? "Pembayaran utang" : "Penerimaan piutang",
    type: item.kind === "utang" ? "out" : "in", amount, method: method.trim(),
  });
  return error ? { ok: false as const } : updatedWorkspace();
}

export async function signInWithPassword(email: string, password: string) {
  if (!validText(email, 254) || !password) return { ok: false as const, message: "Isi email dan kata sandi." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (!error) return { ok: true as const };
  if (error.code === "email_not_confirmed") return { ok: false as const, message: "Konfirmasi email Anda terlebih dahulu, lalu coba masuk lagi." };
  if (error.code === "invalid_credentials") return { ok: false as const, message: "Email atau kata sandi tidak cocok. Periksa akun pemilik yang dibuat di Supabase." };
  return { ok: false as const, message: `Belum bisa masuk (${error.code || "auth_error"}). Coba lagi.` };
}

export async function signUpWithPassword(email: string, password: string) {
  const address = email.trim();
  if (!validText(address, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    return { ok: false as const, message: "Masukkan alamat email yang valid." };
  if (password.length < 8)
    return { ok: false as const, message: "Kata sandi harus terdiri dari minimal 8 karakter." };

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email: address,
    password,
    options: { emailRedirectTo: new URL("/auth/callback", siteUrl).toString() },
  });
  if (!error) return { ok: true as const, signedIn: Boolean(data.session) };
  if (error.code === "signup_disabled")
    return { ok: false as const, message: "Pendaftaran belum diaktifkan. Hubungi pengelola aplikasi." };
  if (error.code === "over_email_send_rate_limit" || error.code === "email_address_not_authorized")
    return { ok: false as const, message: "Email konfirmasi belum dapat dikirim. Coba lagi nanti atau hubungi pengelola aplikasi." };
  if (error.code === "weak_password")
    return { ok: false as const, message: "Kata sandi terlalu lemah. Gunakan kata sandi yang lebih kuat." };
  return { ok: false as const, message: "Akun belum dapat dibuat. Coba lagi sebentar lagi." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { ok: true as const };
}
