# Panduan demo produksi

Buka [www.arus-kas.online](https://www.arus-kas.online), pilih **Masuk**, lalu gunakan akun pemilik `arus.demo.c03ae169@example.org` dan kata sandi yang sudah dibagikan kepada pemilik proyek. Akun ini memiliki akses ke **Kedai Contoh Arus (Data Demo)**. Nama kedai hanya contoh; fitur akuntansi dirancang untuk beragam jenis UMKM.

Data pembuka akuntansi bertanggal 30 Oktober 2026. Buku kas lama tetap tersedia sebagai riwayat terpisah. Saldo pembuka akuntansi Rp6.802.000 kas/bank, Rp60.000 piutang, Rp400.000 utang, dan Rp6.462.000 modal. Setelah transaksi contoh hingga November, saldo yang diverifikasi pada 26 November 2026 adalah kas/bank Rp6.792.000, piutang Rp196.000, utang Rp580.000, persediaan Rp130.200, dan aset tetap bruto Rp360.000. Angka akan berubah bila akun demo dipakai untuk mencatat transaksi baru.

## Alur uji

1. **Dashboard, Buku kas, Utang & piutang, Proyeksi:** periksa riwayat kas dan kewajiban lama. Ini adalah modul kas sebelum perluasan akuntansi.
2. **Akuntansi → Daftar akun:** periksa 15 akun awal dan pengelompokan aset, kewajiban, modal, pendapatan, HPP, dan beban.
3. **Saldo pembuka:** lihat jurnal pembuka serta rincian tagihan pelanggan dan pemasok. Jurnal pembuka hanya dapat dibuat sekali, sehingga pada akun ini form sudah terkunci sesuai aturan.
4. **Catat transaksi:** coba penjualan tunai, biaya, setoran modal, prive, dan transfer kas/bank pada tanggal di bulan yang masih terbuka. Untuk menguji koreksi, pilih jurnal yang memenuhi syarat lalu isi alasan dan nilai pengganti.
5. **Kontak dan Penjualan & pembelian tempo:** periksa pelanggan/pemasok, invoice/tagihan, piutang/utang, jatuh tempo, dan pembayaran sebagian. Buat dokumen atau pembayaran baru bila perlu.
6. **Produk & stok:** periksa produk `Beras Premium Demo`, layanan `Jasa Pesanan Demo`, kartu stok, pembelian, penjualan, HPP rata-rata bergerak, dan penyesuaian stok. Coba koreksi pada mutasi tunai terbaru yang memenuhi syarat.
7. **Aset tetap:** periksa dua aset contoh, nilai perolehan, umur manfaat, dan perhitungan penyusutan. November 2026 belum disusutkan agar tombol proses bulan tersebut dapat diuji.
8. **Buku besar & neraca saldo:** pilih tanggal 26 November 2026 dan cocokkan total debit dengan kredit. Lihat jurnal dan mutasi per akun.
9. **Laba rugi & posisi keuangan:** buka laporan draf per 26 November 2026, lalu unduh PDF dan Excel. Laporan ini belum diklaim sebagai laporan SAK EMKM final.
10. **Tutup buku & koreksi:** Oktober 2026 sengaja dibiarkan terbuka agar aturan penutupan dapat diuji. Menutup bulan akan mengunci transaksi bulan itu; lakukan setelah semua percobaan koreksi Oktober selesai. November belum dapat ditutup sebelum bulan berakhir.
11. **Pengaturan & Akses:** periksa profil usaha dan undangan pengelola. Membuat akun pengelola baru memerlukan alamat email lain dan prosedur undangan.

Akun demo adalah data bersama. Transaksi, koreksi, dan penutupan yang dibuat melalui aplikasi tersimpan di produksi. Jangan memasukkan data usaha pribadi atau informasi rahasia.
