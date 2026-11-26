import type { AccountClass, AccountRole } from "@/lib/accounting";

export type StatementBalance = {
  code: string; name: string; class: AccountClass; role: AccountRole;
  totalDebit: number; totalCredit: number;
};

export type StatementSnapshots = {
  current: readonly StatementBalance[];
  prior: readonly StatementBalance[];
  currentYearOpening: readonly StatementBalance[];
  priorYearOpening: readonly StatementBalance[];
};

type Pair = { current: number; prior: number };
export type StatementLine = Pair & { code: string; name: string; role: AccountRole };

function safe(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Jumlah laporan melebihi batas Rupiah yang aman.");
  return value === 0 ? 0 : value;
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => safe(total + value), 0);
}

function snapshot(rows: readonly StatementBalance[]) {
  const result = new Map<string, StatementBalance>();
  for (const row of rows) {
    if (!row.code || result.has(row.code) || !Number.isSafeInteger(row.totalDebit)
      || !Number.isSafeInteger(row.totalCredit) || row.totalDebit < 0 || row.totalCredit < 0)
      throw new Error("Neraca saldo berisi akun atau nominal yang tidak valid.");
    result.set(row.code, row);
  }
  if (sum(rows.map((row) => row.totalDebit)) !== sum(rows.map((row) => row.totalCredit)))
    throw new Error("Jurnal pada salah satu tanggal pembanding tidak seimbang.");
  return result;
}

export function buildFinancialStatements(input: StatementSnapshots) {
  const current = snapshot(input.current);
  const prior = snapshot(input.prior);
  const currentOpening = snapshot(input.currentYearOpening);
  const priorOpening = snapshot(input.priorYearOpening);
  const accounts = [...current.values()].sort((a, b) => a.code.localeCompare(b.code));
  for (const [code, row] of current) {
    for (const other of [prior, currentOpening, priorOpening]) {
      const comparison = other.get(code);
      if (!comparison || comparison.class !== row.class || comparison.role !== row.role)
        throw new Error("Daftar akun pada tanggal pembanding tidak cocok.");
    }
  }
  const net = (rows: Map<string, StatementBalance>, code: string) => {
    const row = rows.get(code);
    if (!row) throw new Error("Akun pembanding tidak ditemukan.");
    return safe(row.totalDebit - row.totalCredit);
  };
  const period = (code: string, side: "debit" | "credit"): Pair => {
    const currentValue = safe(net(current, code) - net(currentOpening, code));
    const priorValue = safe(net(prior, code) - net(priorOpening, code));
    return { current: side === "credit" ? safe(-currentValue) : currentValue,
      prior: side === "credit" ? safe(-priorValue) : priorValue };
  };
  const point = (code: string, side: "debit" | "credit"): Pair => ({
    current: side === "credit" ? safe(-net(current, code)) : net(current, code),
    prior: side === "credit" ? safe(-net(prior, code)) : net(prior, code),
  });
  const lines = (filter: (row: StatementBalance) => boolean, mode: "period" | "point",
    side: "debit" | "credit") => accounts.filter(filter).map((row) => ({
    code: row.code, name: row.name, role: row.role,
    ...(mode === "period" ? period(row.code, side) : point(row.code, side)),
  }));
  const total = (rows: readonly Pair[]): Pair => ({
    current: sum(rows.map((row) => row.current)), prior: sum(rows.map((row) => row.prior)),
  });
  const subtract = (left: Pair, right: Pair): Pair => ({
    current: safe(left.current - right.current), prior: safe(left.prior - right.prior),
  });

  const revenue = lines((row) => row.class === "revenue", "period", "credit");
  const cogs = lines((row) => row.role === "cogs", "period", "debit");
  const expenses = lines((row) => row.class === "expense" && row.role !== "cogs", "period", "debit");
  const totalRevenue = total(revenue);
  const totalCogs = total(cogs);
  const grossProfit = subtract(totalRevenue, totalCogs);
  const totalExpenses = total(expenses);
  const netProfit = subtract(grossProfit, totalExpenses);

  const assets = lines((row) => row.class === "asset", "point", "debit");
  const liabilities = lines((row) => row.class === "liability", "point", "credit");
  const equityAccounts = lines((row) => row.class === "equity", "point", "credit");
  const totalAssets = total(assets);
  const totalLiabilities = total(liabilities);
  const cumulativeResult = (rows: Map<string, StatementBalance>) => safe(
    sum(accounts.filter((row) => row.class === "revenue").map((row) => -net(rows, row.code)))
    - sum(accounts.filter((row) => row.class === "expense").map((row) => net(rows, row.code))),
  );
  const priorYearsResult: Pair = {
    current: safe(cumulativeResult(current) - netProfit.current),
    prior: safe(cumulativeResult(prior) - netProfit.prior),
  };
  const totalEquity = total([...equityAccounts, priorYearsResult, netProfit]);
  const totalLiabilitiesAndEquity = total([totalLiabilities, totalEquity]);
  if (totalAssets.current !== totalLiabilitiesAndEquity.current
    || totalAssets.prior !== totalLiabilitiesAndEquity.prior)
    throw new Error("Laporan posisi keuangan tidak seimbang dengan neraca saldo.");

  return {
    income: { revenue, cogs, expenses, totalRevenue, totalCogs, grossProfit, totalExpenses, netProfit },
    position: { assets, liabilities, equityAccounts, priorYearsResult, currentResult: netProfit,
      totalAssets, totalLiabilities, totalEquity, totalLiabilitiesAndEquity },
  };
}
