# Panduan demo produksi

Buka [www.arus-kas.online](https://www.arus-kas.online), pilih **Masuk**, lalu gunakan akun pemilik `arus.demo.c03ae169@example.org` dan kata sandi yang sudah dibagikan kepada pemilik proyek. Akun ini memiliki akses ke **Kedai Contoh Arus (Data Demo)**. Nama kedai hanya contoh; fitur akuntansi dirancang untuk beragam jenis UMKM.

Data pembuka akuntansi bertanggal 30 Oktober 2026. Catatan kas lama tetap tersedia dalam arsip baca saja. Saldo pembuka akuntansi Rp6.802.000 kas/bank, Rp60.000 piutang, Rp400.000 utang, dan Rp6.462.000 modal. Setelah transaksi contoh hingga November, saldo yang diverifikasi pada 26 November 2026 adalah kas/bank Rp6.792.000, piutang Rp196.000, utang Rp580.000, persediaan Rp130.200, dan aset tetap bruto Rp360.000. Angka akan berubah bila akun demo dipakai untuk mencatat transaksi baru.

## Alur uji

1. **Ringkasan → Beranda dan Proyeksi kas:** periksa saldo yang kini diambil dari jurnal, lalu lihat proyeksi berdasarkan transaksi operasional dan tagihan terbuka.
2. **Kegiatan usaha → Kas & bank:** lihat mutasi semua akun kas/bank. Pilih **Catat transaksi** untuk mencoba penjualan tunai, biaya, setoran modal, prive, atau transfer pada bulan yang masih terbuka. Catatan sebelum pembukuan tersedia melalui tautan **Arsip lama** pada halaman ini.
3. **Kegiatan usaha → Tagihan tempo:** periksa pelanggan/pemasok, invoice/tagihan, pembayaran sebagian, dan ringkasan umur piutang/utang dalam satu alur.
4. **Kegiatan usaha → Produk & stok:** periksa produk `Beras Premium Demo`, layanan `Jasa Pesanan Demo`, kartu stok, pembelian, penjualan, HPP rata-rata bergerak, dan penyesuaian stok. Coba koreksi pada mutasi tunai terbaru yang memenuhi syarat.
5. **Kegiatan usaha → Aset tetap:** periksa dua aset contoh, nilai perolehan, umur manfaat, dan perhitungan penyusutan. November 2026 belum disusutkan agar tombol proses bulan tersebut dapat diuji.
6. **Laporan → Laporan keuangan:** baca laba rugi, posisi keuangan, gambar persamaan neraca, dan CaLK ringkas. Pilih 26 November 2026, lalu unduh PDF atau Excel. Laporan ini masih draf.
7. **Laporan → Arus kas aktual:** pilih rentang tanggal setelah pembukuan dimulai. Uang masuk/keluar berasal dari jurnal dan saldo akhir dicocokkan dengan neraca saldo; transfer internal dipisahkan. Unduh PDF atau Excel dari angka yang sama.
8. **Laporan → Jurnal & buku besar:** pilih 26 November 2026, cocokkan total debit/kredit neraca saldo, lalu telusuri mutasi akun.
9. **Data & pengaturan → Daftar akun dan Saldo pembuka:** periksa 15 akun awal serta rincian saldo awal pelanggan/pemasok. Jurnal pembuka hanya dapat dibuat sekali, sehingga pada akun ini form sudah terkunci.
10. **Data & pengaturan → Tutup buku & koreksi:** Oktober 2026 sengaja dibiarkan terbuka untuk pengujian koreksi. Penutupan akan mengunci transaksi bulan itu; lakukan setelah percobaan koreksi Oktober selesai. November belum dapat ditutup sebelum bulan berakhir.
11. **Data & pengaturan → Pengaturan usaha dan Hak akses:** periksa batas aman proyeksi dan undangan pengelola. Saldo pembuka akuntansi tidak diedit dari pengaturan. Pengelola dapat mencatat penjualan tunai, tetapi laporan keuangan dan pengaturan tetap khusus pemilik.

Akun demo adalah data bersama. Transaksi, koreksi, dan penutupan yang dibuat melalui aplikasi tersimpan di produksi. Jangan memasukkan data usaha pribadi atau informasi rahasia.
