import { cashFlowLabel, type buildCashFlow } from "./cash-flow";
import type { ExportSheet } from "./report-export";

export function createCashFlowExport(input: {
  businessName: string; start: string; end: string;
  report: ReturnType<typeof buildCashFlow>;
}, generatedAt: Date) {
  const { report, start, end } = input;
  const sheets: ExportSheet[] = [{
    name: "Arus Kas", title: "Laporan arus kas aktual",
    currentLabel: "Saldo / masuk", priorLabel: "Keluar",
    rows: [
      { kind: "text", label: `Periode ${start} sampai ${end}. Sumber: jurnal usaha yang telah dibukukan.` },
      { kind: "money", label: "Saldo awal periode", current: report.opening, prior: 0, strong: true },
      { kind: "section", label: "Mutasi kas menurut sumber" },
      ...report.groups.map((group) => ({
        kind: "money" as const, label: cashFlowLabel(group.source),
        current: group.incoming, prior: group.outgoing,
      })),
      { kind: "money", label: "Jumlah uang masuk / keluar", current: report.incoming, prior: report.outgoing, strong: true },
      { kind: "money", label: "Perubahan kas bersih", current: report.net, prior: 0, strong: true },
      { kind: "money", label: "Saldo akhir periode", current: report.closing, prior: 0, strong: true },
      { kind: "text", label: `Transfer antarakun sendiri Rp ${report.transfers.toLocaleString("id-ID")} tidak termasuk uang masuk atau keluar usaha. Saldo akhir telah dicocokkan dengan neraca saldo.` },
    ],
  }];
  return {
    businessName: input.businessName, asOf: end,
    generatedAt: new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(generatedAt),
    status: "DRAF" as const, currency: "Rupiah" as const, sheets,
  };
}
