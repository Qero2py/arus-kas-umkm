import type { Account, JournalLine } from "./accounting";

export type OpeningCreditDetail = {
  kind: "sale" | "purchase";
  contactId: string;
  documentNo: string;
  issueDate: string;
  dueDate: string;
  description: string;
  amount: number;
  controlAccountCode: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const documentNo = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateOpeningCreditDetails(
  date: string, lines: readonly JournalLine[], accounts: readonly Account[],
  details: readonly OpeningCreditDetail[],
) {
  if (!Array.isArray(details) || details.length > 200) throw new Error("Maksimal 200 rincian tagihan pembuka.");
  const catalog = new Map(accounts.map((account) => [account.code, account]));
  const expected = new Map<string, number>();
  const actual = new Map<string, number>();
  const seen = new Set<string>();
  for (const line of lines) {
    const role = catalog.get(line.accountCode)?.role;
    if (role !== "receivable" && role !== "payable") continue;
    const amount = role === "receivable" ? line.debit - line.credit : line.credit - line.debit;
    const total = (expected.get(line.accountCode) ?? 0) + amount;
    if (!Number.isSafeInteger(total)) throw new Error("Saldo piutang atau utang terlalu besar.");
    expected.set(line.accountCode, total);
  }
  for (const detail of details) {
    if (!detail || !["sale", "purchase"].includes(detail.kind)
      || typeof detail.contactId !== "string" || !uuid.test(detail.contactId)
      || typeof detail.documentNo !== "string" || !documentNo.test(detail.documentNo)
      || typeof detail.issueDate !== "string" || !validDate(detail.issueDate) || detail.issueDate > date
      || typeof detail.dueDate !== "string" || !validDate(detail.dueDate) || detail.dueDate < detail.issueDate
      || typeof detail.description !== "string" || !detail.description.trim() || detail.description.trim().length > 250
      || !Number.isSafeInteger(detail.amount) || detail.amount <= 0)
      throw new Error("Periksa kontak, nomor, tanggal, keterangan, dan nominal rincian tagihan pembuka.");
    const role = catalog.get(detail.controlAccountCode)?.role;
    if (role !== (detail.kind === "sale" ? "receivable" : "payable"))
      throw new Error("Akun rincian tagihan pembuka tidak sesuai jenisnya.");
    const key = `${detail.kind}:${detail.documentNo}`;
    if (seen.has(key)) throw new Error("Nomor tagihan pembuka ganda.");
    seen.add(key);
    const total = (actual.get(detail.controlAccountCode) ?? 0) + detail.amount;
    if (!Number.isSafeInteger(total)) throw new Error("Rincian tagihan pembuka terlalu besar.");
    actual.set(detail.controlAccountCode, total);
  }
  for (const code of new Set([...expected.keys(), ...actual.keys()])) {
    if ((expected.get(code) ?? 0) !== (actual.get(code) ?? 0))
      throw new Error(`Jumlah rincian tagihan harus sama dengan saldo akun ${code}.`);
  }
  return { receivable: details.filter((item) => item.kind === "sale").reduce((sum, item) => sum + item.amount, 0),
    payable: details.filter((item) => item.kind === "purchase").reduce((sum, item) => sum + item.amount, 0) };
}
