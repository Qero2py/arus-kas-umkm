# Kasus acuan pembukuan — data uji rumah makan

Contoh ini menguji mesin akuntansi yang juga berlaku untuk perdagangan dan jasa. Semua nominal Rupiah adalah data uji. Tanggal contoh: 1–31 Oktober 2026. Persediaan dinilai Rp700.000 pada stok opname akhir periode.

| No. | Peristiwa | Debit | Kredit |
|---:|---|---|---|
| 0 | Saldo pembuka | Kas laci 1.000.000; Bank 4.000.000; Persediaan 600.000; Peralatan 3.000.000 | Utang usaha 500.000; Modal pemilik 8.100.000 |
| 1 | Penjualan tunai 200.000 | Kas laci 200.000 | Pendapatan 200.000 |
| 2 | Penjualan tempo 150.000 | Piutang 150.000 | Pendapatan 150.000 |
| 3 | Pelanggan membayar sebagian 100.000 | Bank 100.000 | Piutang 100.000 |
| 4 | Pembelian bahan tempo 300.000 | Persediaan 300.000 | Utang usaha 300.000 |
| 5 | Bayar utang pemasok 400.000 | Utang usaha 400.000 | Bank 400.000 |
| 6 | Biaya operasional tunai 80.000 | Beban operasional 80.000 | Kas laci 80.000 |
| 7 | Setoran modal ke bank 500.000 | Bank 500.000 | Modal pemilik 500.000 |
| 8 | Prive tunai 120.000 | Prive pemilik 120.000 | Kas laci 120.000 |
| 9 | Pindah kas laci ke bank 300.000 | Bank 300.000 | Kas laci 300.000 |
| 10 | HPP akhir periode: 600.000 + 300.000 − 700.000 | HPP 200.000 | Persediaan 200.000 |
| 11 | Penyusutan peralatan 50.000 | Beban penyusutan 50.000 | Akumulasi penyusutan 50.000 |

**Hasil yang harus sama pada aplikasi:**

- Kas laci Rp700.000; Bank Rp4.500.000; total kas/bank Rp5.200.000.
- Piutang Rp50.000; persediaan Rp700.000; peralatan neto Rp2.950.000; **aset Rp8.900.000**.
- Utang usaha Rp400.000. Modal setelah setoran Rp8.600.000; prive Rp120.000; laba periode Rp20.000; **ekuitas akhir Rp8.500.000**.
- Laba rugi: pendapatan Rp350.000 − HPP Rp200.000 − beban operasional Rp80.000 − penyusutan Rp50.000 = **Rp20.000**.
- Posisi keuangan: **aset Rp8.900.000 = liabilitas Rp400.000 + ekuitas Rp8.500.000**.
- Kas/bank naik dari Rp5.000.000 menjadi Rp5.200.000. Transfer Rp300.000 tidak mengubah total kas/bank.

Kasus negatif: nominal nol/pecahan ditolak; akun tidak aktif ditolak; satu dokumen tidak boleh dibukukan dua kali; pembayaran melebihi sisa utang/piutang ditolak; stok negatif atau stok opname yang tidak direkonsiliasi ditahan; koreksi pada periode tertutup ditolak; petugas tidak boleh membaca laporan pemilik; data usaha lain tidak boleh terlihat.

Kasus ini belum memasukkan pajak, potongan penjualan, retur, selisih QRIS, maupun resep per menu. Aturan untuk transaksi tersebut harus disepakati sebelum form terkait dibuat.
