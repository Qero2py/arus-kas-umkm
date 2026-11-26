export function parseQuantity(value: string): number | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,11})(\.\d{1,3})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(milli) && milli <= 1_000_000_000_000 ? milli : null;
}

export function formatQuantity(milli: number): string {
  if (!Number.isSafeInteger(milli)) return "—";
  return (milli / 1000).toLocaleString("id-ID", { maximumFractionDigits: 3 });
}
