import { parseQuantity } from "./inventory";

export function calculateSaleTotal(quantityText: string, unitPrice: number): number | null {
  const quantityMilli = parseQuantity(quantityText);
  if (quantityMilli === null || quantityMilli <= 0 || !Number.isSafeInteger(unitPrice) || unitPrice <= 0)
    return null;
  const total = (BigInt(quantityMilli) * BigInt(unitPrice) + BigInt(500)) / BigInt(1000);
  return total > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(total);
}
