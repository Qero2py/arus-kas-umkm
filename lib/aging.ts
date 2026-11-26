import type { Obligation } from "@/lib/demo-data";

export type AgingBucket = "belum_jatuh_tempo" | "lewat_1_30" | "lewat_31_60" | "lewat_61_plus";
export type AgingTotals = Record<AgingBucket, number> & { total: number };

function emptyTotals(): AgingTotals {
  return { belum_jatuh_tempo: 0, lewat_1_30: 0, lewat_31_60: 0, lewat_61_plus: 0, total: 0 };
}

export function agingBucket(dueDate: string, asOf: string): AgingBucket {
  const day = (value: string) => {
    const [year, month, date] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  const overdueDays = Math.round((day(asOf) - day(dueDate)) / 86_400_000);
  if (overdueDays <= 0) return "belum_jatuh_tempo";
  if (overdueDays <= 30) return "lewat_1_30";
  if (overdueDays <= 60) return "lewat_31_60";
  return "lewat_61_plus";
}

export function buildAgingSummary(obligations: readonly Obligation[], asOf: string) {
  const receivables = emptyTotals();
  const payables = emptyTotals();
  for (const item of obligations) {
    const remaining = item.amount - item.settled;
    if (!Number.isSafeInteger(remaining) || remaining < 0) throw new Error("Sisa tagihan tidak valid.");
    const target = item.kind === "piutang" ? receivables : payables;
    const bucket = agingBucket(item.dueDate, asOf);
    target[bucket] += remaining;
    target.total += remaining;
    if (!Number.isSafeInteger(target.total) || !Number.isSafeInteger(target[bucket]))
      throw new Error("Jumlah tagihan melebihi batas aman.");
  }
  return { receivables, payables };
}
