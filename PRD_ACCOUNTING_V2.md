# PRD v2 — Arus: Sistem Akuntansi UMKM

| Field | Detail |
|---|---|
| Status | Rancangan implementasi; belum menyatakan aplikasi memenuhi SAK EMKM |
| Tanggal | 24 November 2026 |
| Produk sebelumnya | [PRD v1](prd.md): pemantauan dan proyeksi arus kas |
| Sasaran | UMKM perdagangan, kuliner, dan jasa; satu usaha per akun pada tahap awal |
| Contoh uji pertama | Rumah makan satu cabang, memakai data contoh, tanpa klaim observasi lapangan |

## 1. Tujuan dan batas produk

Arus mempertahankan buku kas, ringkasan, kewajiban, proyeksi, dan peringatan. Fondasi baru mencatat peristiwa ekonomi dengan jurnal berpasangan agar pengguna dapat melihat posisi keuangan dan laba rugi, bukan hanya perubahan kas. Pengguna utama tetap pemilik usaha; pengelola dapat mengerjakan tugas yang diberikan pemilik. Bahasa UI harus sederhana dan menjelaskan istilah akuntansi.

Produk tidak dibatasi untuk rumah makan. Jenis usaha menentukan modul yang dipakai: perdagangan/kuliner memerlukan persediaan dan HPP; jasa dapat menggunakan pendapatan, biaya, piutang, utang, serta aset tanpa stok. Template akun boleh disesuaikan per usaha, tetapi akun sistem yang dipakai jurnal otomatis tidak boleh dihapus saat sudah memiliki transaksi.

Rancangan awal belum berasal dari wawancara atau observasi mitra. Semua contoh nominal dan catatan di pengembangan adalah data uji. Tidak ada dasar untuk menyatakan kebutuhan semua UMKM telah tervalidasi.

## 2. Dasar pelaporan

Target pelaporan mengacu pada SAK Indonesia untuk EMKM. Paket minimum: laporan posisi keuangan, laporan laba rugi, dan catatan atas laporan keuangan (CaLK), disertai informasi komparatif periode sebelumnya. CaLK memuat kebijakan akuntansi dan rincian pos material. Ringkasan/arus kas dan proyeksi Arus adalah laporan tambahan. Kesesuaian final perlu diperiksa atas transaksi, kebijakan, angka, dan pengungkapan; keberadaan tiga halaman laporan saja tidak cukup.

- [IAI: SAK EMKM dan ruang lingkup](https://web.iaiglobal.or.id/SAK-IAI/Tentang%20SAK%20EMKM)
- [IAI: komponen minimum dan komparatif](https://www.iaiglobal.or.id/v03/files/file_sak/emkm/files/basic-html/page20.html)
- [IAI: isi CaLK](https://www.iaiglobal.or.id/v03/files/file_sak/emkm/files/basic-html/page25.html)
- [IAI: persediaan dan metode biaya](https://www.iaiglobal.or.id/v03/files/file_sak/emkm/files/basic-html/page33.html)

## 3. Cakupan fungsional menurut urutan implementasi

| ID | Kebutuhan | Tahap | Kriteria penerimaan utama |
|---|---|---:|---|
| A01 | Template daftar akun (aset, liabilitas, ekuitas, pendapatan, HPP, beban) | 1 | Akun punya kode unik per usaha, jenis, saldo normal, status aktif; akun terpakai tidak dapat dihapus. |
| A02 | Beberapa kas/bank/dompet pembayaran dan saldo pembuka | 1 | Tiap dompet terkait satu akun buku besar; total kas cocok dengan akun-akun tersebut. |
| A03 | Jurnal otomatis dan sumber transaksi | 1–2 | Setiap dokumen yang dibukukan memiliki minimal dua baris; debit = kredit; penulisan dokumen dan jurnal atomik. |
| A04 | Buku besar dan neraca saldo | 1 | Mutasi akun berasal dari baris jurnal; total debit dan kredit neraca saldo seimbang. |
| A05 | Kontak pelanggan/pemasok | 2 | Piutang/utang dapat ditelusuri ke kontak dan dokumen asal. |
| A06 | Penjualan tunai/tempo, biaya, pembelian, pembayaran, transfer, modal, prive | 2 | Setiap jenis transaksi menghasilkan jurnal sesuai contoh acuan; pelunasan tidak mengakui pendapatan/beban kedua kali. |
| A07 | Produk/jasa, SKU, satuan, harga, stok minimum; stok opsional | 3 | Jasa tidak wajib punya stok; produk stok memiliki kartu mutasi dan saldo kuantitas. |
| A08 | Pembelian persediaan, stok opname, barang rusak, dan HPP | 3 | Nilai persediaan dan HPP cocok dengan kartu stok serta jurnal. Metode biaya dipilih dan konsisten. |
| A09 | Aset tetap dan penyusutan | 4 | Nilai tercatat = biaya perolehan − akumulasi penyusutan; tanah tidak disusutkan. |
| A10 | Tutup buku dan koreksi | 4 | Periode tertutup menolak posting/perubahan; koreksi periode terbuka memakai pembalik dan jurnal pengganti, dengan jejak audit. |
| A11 | Laba rugi, posisi keuangan, CaLK dan komparatif | 5 | Laporan direkonsiliasi dengan buku besar; aset = liabilitas + ekuitas; kebijakan dan pos material dijelaskan. |
| A12 | Filter periode, ekspor PDF/Excel; arus kas tambahan | 5 | Ekspor mencantumkan usaha, periode, satuan Rupiah, waktu pembuatan, dan status draft/final. |
| A13 | Umur utang/piutang dan analitik penjualan | 6 | Jumlah rincian cocok dengan akun pengendali dan dokumen asal. |
| A14 | Struk 58/80 mm dan berbagi invoice melalui WhatsApp | 6 | Pratinjau sesuai dokumen; pengiriman hanya atas tindakan pengguna. |
| A15 | Hak akses pemilik dan petugas | Lintas tahap | Pemilik melihat laporan dan pengaturan; petugas hanya fungsi yang diberikan; server dan RLS menolak akses tanpa izin. |

## 4. Aturan akuntansi dan data

1. Semua Rupiah adalah bilangan bulat aman; setiap jurnal harus seimbang dan mengacu pada satu usaha, tanggal, sumber, serta identitas pembuat. Pembukuan ditolak jika akun tidak aktif, periode tertutup, atau dokumen sudah dibukukan.
2. Penjualan tempo: debit piutang, kredit pendapatan. Penerimaannya kemudian: debit kas/bank, kredit piutang. Pembelian tempo: debit persediaan/beban/aset sesuai barang, kredit utang. Pembayarannya: debit utang, kredit kas/bank.
3. Setoran pemilik menambah ekuitas; prive menguranginya dan bukan beban operasional. Transfer antardompet tidak mengubah total kas atau laba.
4. Persediaan dapat menggunakan MPKP/FIFO atau rata-rata tertimbang sesuai kebijakan usaha; implementasi pertama memilih rata-rata tertimbang. Untuk contoh rumah makan awal, HPP per periode dihitung dari persediaan awal + pembelian − persediaan akhir hasil stok opname. Resep per menu dan konsumsi bahan otomatis menjadi tahap lanjutan.
5. Penyusutan dimulai saat aset siap digunakan. Metode awal garis lurus, kebijakan umur manfaat dicatat. Tanggal, kebijakan, dan jurnal penyesuaian harus dapat ditelusuri.
6. Saldo laporan harus berasal dari jurnal yang dibukukan. Proyeksi kas tetap memakai catatan kas dan kewajiban, namun perlu disesuaikan agar transaksi nonkas tidak mengubah saldo kas.
7. Perubahan transaksi yang sudah dibukukan memakai pembalik dan pengganti; penghapusan langsung dilarang. Jejak audit menyimpan siapa, kapan, dan alasan koreksi.

## 5. Model data sasaran

Pertahankan autentikasi, usaha, anggota, dan data kas lama selama transisi. Entitas baru: `accounts`, `cash_wallets`, `contacts`, `journal_entries`, `journal_lines`, `sales`, `sale_lines`, `purchases`, `purchase_lines`, `products`, `inventory_movements`, `stock_counts`, `fixed_assets`, `fiscal_periods`, dan `audit_events`. Setiap entitas usaha memiliki `business_id`; izin baca/tulis dibatasi di server dan RLS. `journal_entries` memiliki identitas sumber unik agar permintaan ulang tidak membukukan transaksi dua kali.

Pemotongan data lama dilakukan pada tanggal mulai pembukuan baru. Saldo pembuka kas/bank, persediaan, piutang, utang, aset, dan ekuitas harus dimasukkan dan disetujui bersama. Kategori transaksi lama tidak cukup untuk menebak akun; data lama tetap dapat dilihat sebagai arsip sampai rekonsiliasi selesai.

## 6. Pengujian penerimaan

Kasus hitung acuan ada di [ACCOUNTING_EXAMPLES.md](ACCOUNTING_EXAMPLES.md). Gerbang utama: jurnal seimbang; penjualan tempo dan pelunasan tidak menggandakan pendapatan; transfer tidak mengubah total kas; prive tidak masuk biaya; HPP dan stok cocok; neraca seimbang; periode tertutup menolak perubahan; akses lintas usaha/peran ditolak; ekspor cocok dengan layar; serta tampilan ponsel dan desktop dapat digunakan. Laporan belum diberi label sesuai SAK EMKM sebelum aturan dan pengungkapan yang relevan diverifikasi.

## 7. Urutan kerja

1. Bekukan contoh transaksi dan hasil hitung independen; bangun modul domain jurnal murni.
2. Rancang migrasi database dan RLS, lalu buat alur saldo pembuka dan master akun.
3. Hubungkan form operasional dengan posting atomik; pertahankan layar kas lama selama transisi.
4. Tambahkan persediaan, aset, penyesuaian, dan tutup buku.
5. Bentuk laporan dari buku besar, ekspor, lalu lakukan uji rekonsiliasi dan hak akses.
6. Tambahkan analitik, struk, dan WhatsApp setelah angka akuntansi stabil.
