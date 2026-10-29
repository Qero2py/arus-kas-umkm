export type CashEntry = {
  id: string;
  date: string;
  dateLabel: string;
  title: string;
  category: string;
  type: "in" | "out";
  amount: number;
  method: string;
  linkedObligationId?: string;
};

export type Obligation = {
  id: string;
  kind: "utang" | "piutang";
  party: string;
  description: string;
  date: string;
  dueDate: string;
  dueLabel: string;
  dueInDays: number;
  amount: number;
  settled: number;
};

export const demoBusiness = {
  name: "Kedai Pagi",
  owner: "Nadia Putri",
  initials: "NP",
  threshold: 5_000_000,
  horizon: 30,
};

export const DEMO_DATE = "2026-10-27";

export const demoTransactions: CashEntry[] = [
  { id: "TX-1027", date: "2026-10-27", dateLabel: "27 Okt 2026", title: "Penjualan pagi", category: "Penjualan", type: "in", amount: 1_285_000, method: "Tunai" },
  { id: "TX-1026", date: "2026-10-26", dateLabel: "26 Okt 2026", title: "Belanja bahan baku", category: "Bahan baku", type: "out", amount: 735_000, method: "Transfer" },
  { id: "TX-1025", date: "2026-10-26", dateLabel: "26 Okt 2026", title: "Pesanan rapat kantor", category: "Pesanan", type: "in", amount: 2_450_000, method: "Transfer" },
  { id: "TX-1024", date: "2026-10-25", dateLabel: "25 Okt 2026", title: "Tagihan listrik", category: "Operasional", type: "out", amount: 485_000, method: "Transfer" },
  { id: "TX-1023", date: "2026-10-25", dateLabel: "25 Okt 2026", title: "Penjualan akhir pekan", category: "Penjualan", type: "in", amount: 1_735_000, method: "Tunai" },
  { id: "TX-1022", date: "2026-10-24", dateLabel: "24 Okt 2026", title: "Upah kru harian", category: "Tim", type: "out", amount: 900_000, method: "Tunai" },
  { id: "TX-1021", date: "2026-10-24", dateLabel: "24 Okt 2026", title: "Pembayaran katering", category: "Pesanan", type: "in", amount: 1_250_000, method: "Transfer" },
  { id: "TX-OB02", date: "2026-10-24", dateLabel: "24 Okt 2026", title: "Penerimaan dari Kantor Arunika", category: "Penerimaan piutang", type: "in", amount: 600_000, method: "Transfer", linkedObligationId: "OB-02" },
  { id: "TX-1020", date: "2026-10-23", dateLabel: "23 Okt 2026", title: "Biji kopi & susu", category: "Bahan baku", type: "out", amount: 612_000, method: "Transfer" },
  { id: "TX-OB05", date: "2026-10-23", dateLabel: "23 Okt 2026", title: "Pembayaran ke CV Segar Selalu", category: "Pembayaran utang", type: "out", amount: 500_000, method: "Transfer", linkedObligationId: "OB-05" },
  { id: "TX-1019", date: "2026-10-21", dateLabel: "21 Okt 2026", title: "Belanja stok", category: "Bahan baku", type: "out", amount: 1_300_000, method: "Transfer" },
  { id: "TX-1018", date: "2026-10-21", dateLabel: "21 Okt 2026", title: "Penjualan pekan ketiga", category: "Penjualan", type: "in", amount: 250_000, method: "Tunai" },
  { id: "TX-1017", date: "2026-10-17", dateLabel: "17 Okt 2026", title: "Biaya operasional", category: "Operasional", type: "out", amount: 1_300_000, method: "Transfer" },
  { id: "TX-1016", date: "2026-10-17", dateLabel: "17 Okt 2026", title: "Penjualan akhir pekan", category: "Penjualan", type: "in", amount: 320_000, method: "Tunai" },
  { id: "TX-1015", date: "2026-10-13", dateLabel: "13 Okt 2026", title: "Belanja stok", category: "Bahan baku", type: "out", amount: 1_200_000, method: "Transfer" },
  { id: "TX-1014", date: "2026-10-13", dateLabel: "13 Okt 2026", title: "Penjualan pekan kedua", category: "Penjualan", type: "in", amount: 280_000, method: "Tunai" },
  { id: "TX-1013", date: "2026-10-09", dateLabel: "9 Okt 2026", title: "Sewa tempat", category: "Operasional", type: "out", amount: 1_400_000, method: "Transfer" },
  { id: "TX-1012", date: "2026-10-09", dateLabel: "9 Okt 2026", title: "Penjualan pesanan", category: "Penjualan", type: "in", amount: 260_000, method: "Tunai" },
  { id: "TX-1011", date: "2026-10-05", dateLabel: "5 Okt 2026", title: "Upah kru", category: "Tim", type: "out", amount: 1_250_000, method: "Tunai" },
  { id: "TX-1010", date: "2026-10-05", dateLabel: "5 Okt 2026", title: "Penjualan pekan pertama", category: "Penjualan", type: "in", amount: 310_000, method: "Tunai" },
  { id: "TX-1009", date: "2026-09-28", dateLabel: "28 Sep 2026", title: "Belanja bahan awal bulan", category: "Bahan baku", type: "out", amount: 1_350_000, method: "Transfer" },
  { id: "TX-1008", date: "2026-09-28", dateLabel: "28 Sep 2026", title: "Penjualan akhir September", category: "Penjualan", type: "in", amount: 380_000, method: "Tunai" },
];

export const demoObligations: Obligation[] = [
  { id: "OB-01", kind: "utang", party: "Koperasi Pangan Jaya", description: "Bahan baku mingguan", date: "2026-10-25", dueDate: "2026-10-29", dueLabel: "29 Okt 2026", dueInDays: 2, amount: 2_450_000, settled: 0 },
  { id: "OB-02", kind: "piutang", party: "Kantor Arunika", description: "Pesanan konsumsi 24 Okt", date: "2026-10-24", dueDate: "2026-10-30", dueLabel: "30 Okt 2026", dueInDays: 3, amount: 1_800_000, settled: 600_000 },
  { id: "OB-03", kind: "utang", party: "Ruko Melati", description: "Sewa tempat - November", date: "2026-10-27", dueDate: "2026-11-01", dueLabel: "1 Nov 2026", dueInDays: 5, amount: 3_500_000, settled: 0 },
  { id: "OB-04", kind: "piutang", party: "Komunitas Lari Minggu", description: "Pesanan acara komunitas", date: "2026-10-26", dueDate: "2026-11-03", dueLabel: "3 Nov 2026", dueInDays: 7, amount: 950_000, settled: 0 },
  { id: "OB-05", kind: "utang", party: "CV Segar Selalu", description: "Susu dan sirup", date: "2026-10-22", dueDate: "2026-11-08", dueLabel: "8 Nov 2026", dueInDays: 12, amount: 1_250_000, settled: 500_000 },
];

export type ProjectionPoint = {
  label: string;
  day: number;
  scheduled: number;
  cautious: number;
};
