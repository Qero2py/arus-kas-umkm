import { ACCOUNTING_NOTE_POLICIES, type buildAccountingNotes } from "./accounting-notes";
import type { buildFinancialStatements, StatementLine } from "./financial-statements";

type Pair = { current: number; prior: number };
type FinancialStatements = ReturnType<typeof buildFinancialStatements>;
type AccountingNotes = ReturnType<typeof buildAccountingNotes>;

export type ExportSnapshot = {
  businessName: string;
  dates: { asOf: string; priorAsOf: string; currentStart: string; priorStart: string };
  statements: FinancialStatements;
  notes: AccountingNotes;
  assetRegister: {
    status: string;
    assets: readonly { asset_code: string; name: string; ready_on: string;
      cost: number; accumulated: number }[];
  };
};

export type ExportRow =
  | { kind: "section"; label: string }
  | { kind: "text"; label: string }
  | { kind: "money"; label: string; current: number; prior: number; strong?: boolean };

export type ExportSheet = {
  name: string; title: string; currentLabel: string; priorLabel: string;
  rows: ExportRow[];
};

function lines(rows: readonly StatementLine[]): ExportRow[] {
  return rows.filter((row) => row.current !== 0 || row.prior !== 0)
    .map((row) => ({ kind: "money" as const, label: `${row.code} - ${row.name}`,
      current: row.current, prior: row.prior }));
}

function money(label: string, value: Pair, strong = false): ExportRow {
  return { kind: "money", label, current: value.current, prior: value.prior, strong };
}

function section(label: string): ExportRow { return { kind: "section", label }; }
function text(label: string): ExportRow { return { kind: "text", label }; }

export function createReportExport(snapshot: ExportSnapshot, generatedAt: Date) {
  const { dates, statements, notes, assetRegister } = snapshot;
  const income = statements.income;
  const position = statements.position;
  const sheets: ExportSheet[] = [
    {
      name: "Laba Rugi", title: "Laporan laba rugi",
      currentLabel: `${dates.currentStart} s.d. ${dates.asOf}`,
      priorLabel: `${dates.priorStart} s.d. ${dates.priorAsOf}`,
      rows: [section("Pendapatan"), ...lines(income.revenue),
        money("Jumlah pendapatan", income.totalRevenue, true),
        section("Harga pokok penjualan"), ...lines(income.cogs),
        money("Jumlah HPP", income.totalCogs, true),
        money("Laba kotor", income.grossProfit, true),
        section("Beban usaha"), ...lines(income.expenses),
        money("Jumlah beban usaha", income.totalExpenses, true),
        money("Laba (rugi) periode", income.netProfit, true)],
    },
    {
      name: "Posisi Keuangan", title: "Laporan posisi keuangan",
      currentLabel: dates.asOf, priorLabel: dates.priorAsOf,
      rows: [section("Aset termasuk akun kontra"), ...lines(position.assets),
        money("Jumlah aset", position.totalAssets, true),
        section("Liabilitas"), ...lines(position.liabilities),
        money("Jumlah liabilitas", position.totalLiabilities, true),
        section("Ekuitas dan prive"), ...lines(position.equityAccounts),
        money("Hasil usaha sebelum tahun berjalan", position.priorYearsResult),
        money("Laba (rugi) tahun berjalan", position.currentResult),
        money("Jumlah ekuitas", position.totalEquity, true),
        money("Jumlah liabilitas dan ekuitas", position.totalLiabilitiesAndEquity, true)],
    },
    {
      name: "CaLK", title: "Catatan atas laporan keuangan - draf",
      currentLabel: dates.asOf, priorLabel: dates.priorAsOf,
      rows: [
        section("1. Identitas dan dasar angka"),
        text(`Usaha: ${snapshot.businessName}. Satuan: Rupiah. Angka berasal dari jurnal yang telah dibukukan.`),
        text(`Laba rugi: ${dates.currentStart} s.d. ${dates.asOf}; pembanding: ${dates.priorStart} s.d. ${dates.priorAsOf}.`),
        text("Laporan masih draf dan belum dinyatakan sesuai SAK EMKM."),
        section("2. Kebijakan yang digunakan aplikasi"),
        ...ACCOUNTING_NOTE_POLICIES.map((policy) => text(policy)),
        section("3. Kas, bank, dan dompet digital"), ...lines(notes.cash),
        money("Jumlah kas, bank, dan dompet digital", notes.cashTotal, true),
        section("4. Piutang usaha"), ...lines(notes.receivables),
        money("Jumlah piutang", notes.receivablesTotal, true),
        section("5. Persediaan"), ...lines(notes.inventory),
        money("Jumlah persediaan", notes.inventoryTotal, true),
        section("6. Aset tetap - biaya perolehan"), ...lines(notes.fixedCost),
        money("Jumlah biaya perolehan", notes.fixedCostTotal, true),
        section("6. Aset tetap - akumulasi penyusutan (pengurang)"),
        ...lines(notes.accumulatedDepreciation),
        money("Jumlah akumulasi penyusutan", notes.accumulatedTotal, true),
        money("Nilai buku aset tetap", notes.netFixedAssets, true),
        section("7. Utang usaha"), ...lines(notes.payables),
        money("Jumlah utang", notes.payablesTotal, true),
        section("Batas data"),
        text("Rincian piutang/utang historis belum tersedia per pihak. Catatan kas lama belum digabungkan otomatis."),
        text("Pajak, retur, potongan, dan transaksi material lain yang belum dimodelkan perlu ditinjau terpisah."),
      ],
    },
  ];
  if (assetRegister.status === "ready") {
    sheets[2].rows.push(section(`Daftar aset tetap pada ${dates.asOf}`));
    for (const asset of assetRegister.assets) {
      sheets[2].rows.push(text(`${asset.asset_code} - ${asset.name}; siap ${asset.ready_on}; biaya Rp ${asset.cost.toLocaleString("id-ID")}; akumulasi Rp ${asset.accumulated.toLocaleString("id-ID")}; nilai buku Rp ${(asset.cost - asset.accumulated).toLocaleString("id-ID")}.`));
    }
  } else {
    sheets[2].rows.push(text(assetRegister.status === "historical"
      ? "Daftar aset saat ini tidak digunakan untuk merinci tanggal historis."
      : assetRegister.status === "unreconciled"
        ? "Daftar aset tidak ditampilkan karena total register belum cocok dengan buku besar."
        : "Daftar aset rinci tidak tersedia; saldo per akun tetap disajikan."));
  }
  return { businessName: snapshot.businessName, asOf: dates.asOf,
    generatedAt: new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short",
      timeZone: "Asia/Jakarta" }).format(generatedAt),
    status: "DRAF" as const, currency: "Rupiah" as const, sheets };
}
