/** Domain rules for posted journals. No database or browser dependency. */

export type AccountClass = "asset" | "liability" | "equity" | "revenue" | "expense";
export type AccountRole =
  | "cash" | "receivable" | "inventory" | "fixed_asset" | "accumulated_depreciation"
  | "payable" | "capital" | "drawings" | "revenue" | "cogs" | "expense" | "depreciation_expense";

export const ACCOUNT_ROLE_DEFAULTS: Record<AccountRole, { class: AccountClass; normal: "debit" | "credit" }> = {
  cash: { class: "asset", normal: "debit" },
  receivable: { class: "asset", normal: "debit" },
  inventory: { class: "asset", normal: "debit" },
  fixed_asset: { class: "asset", normal: "debit" },
  accumulated_depreciation: { class: "asset", normal: "credit" },
  payable: { class: "liability", normal: "credit" },
  capital: { class: "equity", normal: "credit" },
  drawings: { class: "equity", normal: "debit" },
  revenue: { class: "revenue", normal: "credit" },
  cogs: { class: "expense", normal: "debit" },
  expense: { class: "expense", normal: "debit" },
  depreciation_expense: { class: "expense", normal: "debit" },
};

export type Account = {
  code: string;
  name: string;
  class: AccountClass;
  role: AccountRole;
  normal: "debit" | "credit";
  active: boolean;
};

// Codes are a starter template, not codes prescribed by SAK EMKM. Businesses may add accounts.
export const DEFAULT_ACCOUNTS: readonly Account[] = [
  { code: "1010", name: "Kas", class: "asset", role: "cash", normal: "debit", active: true },
  { code: "1020", name: "Bank", class: "asset", role: "cash", normal: "debit", active: true },
  { code: "1030", name: "Dompet digital", class: "asset", role: "cash", normal: "debit", active: true },
  { code: "1100", name: "Piutang usaha", class: "asset", role: "receivable", normal: "debit", active: true },
  { code: "1200", name: "Persediaan", class: "asset", role: "inventory", normal: "debit", active: true },
  { code: "1500", name: "Aset tetap", class: "asset", role: "fixed_asset", normal: "debit", active: true },
  { code: "1590", name: "Akumulasi penyusutan", class: "asset", role: "accumulated_depreciation", normal: "credit", active: true },
  { code: "2100", name: "Utang usaha", class: "liability", role: "payable", normal: "credit", active: true },
  { code: "3100", name: "Modal pemilik", class: "equity", role: "capital", normal: "credit", active: true },
  { code: "3200", name: "Prive pemilik", class: "equity", role: "drawings", normal: "debit", active: true },
  { code: "4100", name: "Pendapatan penjualan", class: "revenue", role: "revenue", normal: "credit", active: true },
  { code: "4200", name: "Pendapatan jasa", class: "revenue", role: "revenue", normal: "credit", active: true },
  { code: "5100", name: "Harga pokok penjualan", class: "expense", role: "cogs", normal: "debit", active: true },
  { code: "6100", name: "Beban operasional", class: "expense", role: "expense", normal: "debit", active: true },
  { code: "6200", name: "Beban penyusutan", class: "expense", role: "depreciation_expense", normal: "debit", active: true },
];

export type JournalLine = { accountCode: string; debit: number; credit: number };
export type Journal = {
  date: string;
  sourceType: string;
  sourceId: string;
  description: string;
  lines: JournalLine[];
};

function amount(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Nominal harus bilangan Rupiah positif yang aman.");
  return value;
}

function safeSum(values: number[]) {
  const result = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(result)) throw new Error("Jumlah Rupiah melebihi batas bilangan aman.");
  return result;
}

export function periodicCogs(openingInventory: number, purchases: number, endingInventory: number) {
  for (const value of [openingInventory, purchases, endingInventory]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Nilai persediaan harus Rupiah bulat nonnegatif.");
  }
  const available = safeSum([openingInventory, purchases]);
  if (endingInventory > available) throw new Error("Persediaan akhir melebihi nilai yang tersedia.");
  return available - endingInventory;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function accountMap(accounts: readonly Account[]) {
  const result = new Map<string, Account>();
  for (const item of accounts) {
    if (!item.code.trim() || result.has(item.code)) throw new Error("Kode akun kosong atau ganda.");
    const expected = ACCOUNT_ROLE_DEFAULTS[item.role];
    if (!expected || item.class !== expected.class || item.normal !== expected.normal)
      throw new Error(`Klasifikasi akun ${item.code} tidak valid.`);
    result.set(item.code, item);
  }
  return result;
}

export function createJournal(journal: Journal, accounts: readonly Account[]): Journal {
  if (!validDate(journal.date)) throw new Error("Tanggal jurnal tidak valid.");
  if (!journal.sourceType.trim() || journal.sourceType.trim().length > 40
    || !journal.sourceId.trim() || journal.sourceId.trim().length > 100
    || !journal.description.trim() || journal.description.trim().length > 250)
    throw new Error("Sumber dan keterangan jurnal wajib diisi.");
  if (journal.lines.length < 2 || journal.lines.length > 200) throw new Error("Jurnal memerlukan 2 sampai 200 baris.");
  const catalog = accountMap(accounts);
  for (const line of journal.lines) {
    const account = catalog.get(line.accountCode);
    if (!account || !account.active) throw new Error(`Akun ${line.accountCode} tidak tersedia atau tidak aktif.`);
    if (!Number.isSafeInteger(line.debit) || !Number.isSafeInteger(line.credit)
      || (line.debit <= 0 && line.credit <= 0) || (line.debit > 0 && line.credit > 0)
      || line.debit < 0 || line.credit < 0) throw new Error("Setiap baris harus debit atau kredit positif.");
  }
  const debit = safeSum(journal.lines.map((line) => line.debit));
  const credit = safeSum(journal.lines.map((line) => line.credit));
  if (debit !== credit) throw new Error("Total debit dan kredit tidak seimbang.");
  return { ...journal, lines: journal.lines.map((line) => ({ ...line })) };
}

export function openingJournal(date: string, lines: JournalLine[], accounts: readonly Account[]): Journal {
  const catalog = accountMap(accounts);
  for (const line of lines) {
    const account = catalog.get(line.accountCode);
    if (!account || !["asset", "liability", "equity"].includes(account.class) || account.role === "drawings")
      throw new Error(`Akun ${line.accountCode} tidak dapat digunakan untuk saldo pembuka.`);
  }
  return createJournal({ date, sourceType: "opening_balance", sourceId: "initial", description: "Saldo pembuka", lines }, accounts);
}

type EventBase = { date: string; sourceId: string; description: string; amount: number };
export type AccountingEvent =
  | (EventBase & { type: "cash_sale"; cash: string; revenue: string })
  | (EventBase & { type: "credit_sale"; receivable: string; revenue: string })
  | (EventBase & { type: "receivable_receipt"; cash: string; receivable: string })
  | (EventBase & { type: "cash_inventory_purchase"; inventory: string; cash: string })
  | (EventBase & { type: "credit_inventory_purchase"; inventory: string; payable: string })
  | (EventBase & { type: "payable_payment"; payable: string; cash: string })
  | (EventBase & { type: "cash_expense"; expense: string; cash: string })
  | (EventBase & { type: "capital_contribution"; cash: string; capital: string })
  | (EventBase & { type: "owner_draw"; drawings: string; cash: string })
  | (EventBase & { type: "cash_transfer"; fromCash: string; toCash: string })
  | (EventBase & { type: "periodic_cogs"; cogs: string; inventory: string })
  | (EventBase & { type: "depreciation"; expense: string; accumulatedDepreciation: string })
  | (EventBase & { type: "fixed_asset_cash_purchase"; fixedAsset: string; cash: string });

export type BasicAccountingEvent = Extract<AccountingEvent, { type:
  "cash_sale" | "cash_expense" | "capital_contribution" | "owner_draw" | "cash_transfer"
}>;

export const BASIC_ACCOUNTING_EVENT_TYPES = [
  "cash_sale", "cash_expense", "capital_contribution", "owner_draw", "cash_transfer",
] as const;

export function journalForEvent(event: AccountingEvent, accounts: readonly Account[]): Journal {
  const catalog = accountMap(accounts);
  const check = (code: string, role: AccountRole) => {
    const account = catalog.get(code);
    if (!account || !account.active || account.role !== role)
      throw new Error(`Akun ${code} tidak cocok untuk ${role}.`);
    return code;
  };
  const debit = (accountCode: string): JournalLine => ({ accountCode, debit: amount(event.amount), credit: 0 });
  const credit = (accountCode: string): JournalLine => ({ accountCode, debit: 0, credit: amount(event.amount) });
  let lines: JournalLine[];
  switch (event.type) {
    case "cash_sale": lines = [debit(check(event.cash, "cash")), credit(check(event.revenue, "revenue"))]; break;
    case "credit_sale": lines = [debit(check(event.receivable, "receivable")), credit(check(event.revenue, "revenue"))]; break;
    case "receivable_receipt": lines = [debit(check(event.cash, "cash")), credit(check(event.receivable, "receivable"))]; break;
    case "cash_inventory_purchase": lines = [debit(check(event.inventory, "inventory")), credit(check(event.cash, "cash"))]; break;
    case "credit_inventory_purchase": lines = [debit(check(event.inventory, "inventory")), credit(check(event.payable, "payable"))]; break;
    case "payable_payment": lines = [debit(check(event.payable, "payable")), credit(check(event.cash, "cash"))]; break;
    case "cash_expense": lines = [debit(check(event.expense, "expense")), credit(check(event.cash, "cash"))]; break;
    case "capital_contribution": lines = [debit(check(event.cash, "cash")), credit(check(event.capital, "capital"))]; break;
    case "owner_draw": lines = [debit(check(event.drawings, "drawings")), credit(check(event.cash, "cash"))]; break;
    case "cash_transfer":
      if (event.fromCash === event.toCash) throw new Error("Akun asal dan tujuan transfer harus berbeda.");
      lines = [debit(check(event.toCash, "cash")), credit(check(event.fromCash, "cash"))];
      break;
    case "periodic_cogs": lines = [debit(check(event.cogs, "cogs")), credit(check(event.inventory, "inventory"))]; break;
    case "depreciation": lines = [debit(check(event.expense, "depreciation_expense")), credit(check(event.accumulatedDepreciation, "accumulated_depreciation"))]; break;
    case "fixed_asset_cash_purchase": lines = [debit(check(event.fixedAsset, "fixed_asset")), credit(check(event.cash, "cash"))]; break;
  }
  return createJournal({ date: event.date, sourceType: event.type, sourceId: event.sourceId, description: event.description, lines }, accounts);
}

export type AccountBalance = Account & {
  debit: number;
  credit: number;
  endingDebit: number;
  endingCredit: number;
  balance: number;
};

export function trialBalance(journals: readonly Journal[], accounts: readonly Account[]): AccountBalance[] {
  const catalog = accountMap(accounts);
  const seen = new Set<string>();
  const movements = new Map<string, { debit: number; credit: number }>();
  for (const candidate of journals) {
    const journal = createJournal(candidate, accounts);
    const key = `${journal.sourceType}:${journal.sourceId}`;
    if (seen.has(key)) throw new Error(`Dokumen ${key} dibukukan dua kali.`);
    seen.add(key);
    for (const line of journal.lines) {
      const previous = movements.get(line.accountCode) ?? { debit: 0, credit: 0 };
      movements.set(line.accountCode, {
        debit: safeSum([previous.debit, line.debit]), credit: safeSum([previous.credit, line.credit]),
      });
    }
  }
  return [...catalog.values()].map((account) => {
    const movement = movements.get(account.code) ?? { debit: 0, credit: 0 };
    const net = movement.debit - movement.credit;
    return { ...account, ...movement, endingDebit: Math.max(net, 0), endingCredit: Math.max(-net, 0),
      balance: account.normal === "debit" ? net : -net };
  });
}

export function incomeStatement(balances: readonly AccountBalance[]) {
  const revenue = safeSum(balances.filter((row) => row.class === "revenue").map((row) => row.balance));
  const cogs = safeSum(balances.filter((row) => row.role === "cogs").map((row) => row.balance));
  const otherExpenses = safeSum(balances.filter((row) => row.class === "expense" && row.role !== "cogs").map((row) => row.balance));
  return { revenue, cogs, otherExpenses, profit: revenue - cogs - otherExpenses };
}

export function financialPosition(balances: readonly AccountBalance[]) {
  const signed = (row: AccountBalance) => row.normal === "debit" ? row.balance : -row.balance;
  const assets = safeSum(balances.filter((row) => row.class === "asset").map(signed));
  const liabilities = safeSum(balances.filter((row) => row.class === "liability").map((row) => -signed(row)));
  const contributedEquity = safeSum(balances.filter((row) => row.class === "equity").map((row) => -signed(row)));
  const equity = safeSum([contributedEquity, incomeStatement(balances).profit]);
  return { assets, liabilities, equity, balanced: assets === liabilities + equity };
}
