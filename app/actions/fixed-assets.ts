"use server";

import { revalidatePath } from "next/cache";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

type Category = "land" | "building" | "equipment" | "vehicle" | "other";
type SourceKind = "opening" | "cash" | "credit";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const code = /^[0-9A-Z._-]{2,20}$/;
const documentNo = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function refresh() {
  for (const path of ["/accounting/assets", "/accounting/reports", "/accounting/credit", "/accounting/controls"])
    revalidatePath(path);
}
async function owner() {
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat mengelola aset tetap." };
  return { ok: true as const, context };
}

export async function registerFixedAsset(input: {
  id: string; sourceKind: SourceKind; category: Category; assetCode: string; name: string;
  acquiredOn: string; readyOn: string; cost: number; initialAccumulated: number;
  lifeMonths: number; assetAccountCode: string; accumulatedAccountCode: string;
  expenseAccountCode: string; cashAccountCode: string; contactId: string;
  documentNo: string; dueDate: string; payableAccountCode: string;
}) {
  const assetCode = typeof input?.assetCode === "string" ? input.assetCode.trim().toUpperCase() : "";
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const number = typeof input?.documentNo === "string" ? input.documentNo.trim().toUpperCase() : "";
  const invalidSource = input?.sourceKind === "cash" ? !code.test(input?.cashAccountCode ?? "")
    : input?.sourceKind === "credit" && (!uuid.test(input?.contactId ?? "")
      || !documentNo.test(number) || !validDate(input?.dueDate ?? "")
      || input.dueDate < input.acquiredOn || !code.test(input?.payableAccountCode ?? ""));
  if (!uuid.test(input?.id ?? "") || !["opening", "cash", "credit"].includes(input?.sourceKind)
    || !["land", "building", "equipment", "vehicle", "other"].includes(input?.category)
    || !documentNo.test(assetCode) || !name || name.length > 100
    || !validDate(input?.acquiredOn ?? "") || input.acquiredOn > todayInJakarta()
    || !validDate(input?.readyOn ?? "") || input.readyOn < input.acquiredOn
    || !Number.isSafeInteger(input?.cost) || input.cost < 1
    || !Number.isSafeInteger(input?.initialAccumulated) || input.initialAccumulated < 0
    || input.initialAccumulated > input.cost
    || (input.sourceKind !== "opening" && input.initialAccumulated !== 0)
    || !code.test(input?.assetAccountCode ?? "")
    || (input.category === "land" ? input.lifeMonths !== 0 || input.initialAccumulated !== 0
      : !Number.isSafeInteger(input?.lifeMonths) || input.lifeMonths < 1 || input.lifeMonths > 600
        || !code.test(input?.accumulatedAccountCode ?? "") || !code.test(input?.expenseAccountCode ?? ""))
    || invalidSource)
    return { ok: false as const, message: "Periksa identitas, tanggal, nilai, umur manfaat, sumber pembelian, dan akun aset." };
  const user = await owner();
  if (!user.ok) return user;
  const { error } = await user.context.supabase.rpc("register_fixed_asset", {
    p_business_id: user.context.business.id, p_asset_id: input.id,
    p_payload: { sourceKind: input.sourceKind, category: input.category,
      assetCode, name, acquiredOn: input.acquiredOn, readyOn: input.readyOn,
      cost: String(input.cost), initialAccumulated: String(input.initialAccumulated),
      lifeMonths: String(input.lifeMonths), assetAccountCode: input.assetAccountCode,
      accumulatedAccountCode: input.accumulatedAccountCode,
      expenseAccountCode: input.expenseAccountCode, cashAccountCode: input.cashAccountCode,
      contactId: input.contactId, documentNo: number, dueDate: input.dueDate,
      payableAccountCode: input.payableAccountCode },
  });
  if (error) return { ok: false as const, message: error.code === "23505"
    ? "Kode aset atau nomor dokumen sudah digunakan. Periksa daftar sebelum mengulang."
    : error.code === "23514" ? "Aset ditolak. Periksa tanggal perolehan, status pembukuan, akun, kontak, dan saldo awal."
      : "Aset belum tersimpan. Periksa data dan koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function activateFixedAssets() {
  const user = await owner();
  if (!user.ok) return user;
  const { error } = await user.context.supabase.rpc("activate_fixed_assets", {
    p_business_id: user.context.business.id,
  });
  if (error) return { ok: false as const, message: error.code === "23514"
    ? "Biaya perolehan dan akumulasi penyusutan seluruh aset harus sama dengan saldo akun di buku besar."
    : "Register aset belum aktif. Periksa data dan koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function runFixedAssetDepreciation(month: string) {
  const first = typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : "";
  if (!validDate(first) || first > todayInJakarta().slice(0, 7) + "-01")
    return { ok: false as const, message: "Bulan penyusutan tidak valid." };
  const user = await owner();
  if (!user.ok) return user;
  const { data, error } = await user.context.supabase.rpc("run_fixed_asset_depreciation", {
    p_business_id: user.context.business.id, p_month: first,
  });
  if (error) return { ok: false as const, message: error.code === "23514"
    ? "Jalankan penyusutan sesuai urutan bulan sejak register aktif. Periksa akun aset yang masih aktif."
    : "Penyusutan belum dibukukan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const, posted: Number(data) };
}

export async function correctCashFixedAsset(input: {
  correctionId: string; assetId: string; correctionDate: string; reason: string;
  name: string; cost: number; readyOn: string; lifeMonths: number; cashAccountCode: string;
}) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!uuid.test(input?.correctionId ?? "") || !uuid.test(input?.assetId ?? "")
    || !validDate(input?.correctionDate ?? "") || input.correctionDate > todayInJakarta()
    || !validDate(input?.readyOn ?? "") || !name || name.length > 100
    || !Number.isSafeInteger(input?.cost) || input.cost < 1
    || !Number.isInteger(input?.lifeMonths) || input.lifeMonths < 0 || input.lifeMonths > 600
    || !code.test(input?.cashAccountCode ?? "")
    || reason.length < 10 || reason.length > 500)
    return { ok: false as const, message: "Periksa tanggal, aset, nilai, umur manfaat, akun kas, dan alasan koreksi." };
  const user = await owner();
  if (!user.ok) return user;
  const { error } = await user.context.supabase.rpc("correct_cash_fixed_asset", {
    p_business_id: user.context.business.id, p_correction_id: input.correctionId,
    p_asset_id: input.assetId, p_correction_date: input.correctionDate,
    p_reason: reason, p_name: name, p_cost: input.cost,
    p_ready_on: input.readyOn, p_life_months: input.lifeMonths,
    p_cash_account_code: input.cashAccountCode,
  });
  if (error) return { ok: false as const, message: error.code === "23514" || error.code === "22023"
    ? "Koreksi ditolak. Aset harus dibeli tunai, belum disusutkan, dan berada pada bulan terbuka; periksa tanggal serta akun."
    : error.code === "23505" ? "Nomor koreksi sudah digunakan. Muat ulang daftar aset."
      : "Koreksi aset belum tersimpan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}
