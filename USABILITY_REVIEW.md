# Uji kegunaan pratinjau Arus

**Status:** panduan siap; sesi dengan peserta belum dilakukan dan ditunda atas keputusan pemilik proyek pada 28 Oktober 2026 karena peserta belum tersedia. Target 4 dari 5 peserta belum dapat dinilai. Semua tugas memakai data contoh per 27 Oktober 2026. Jangan meminta peserta memasukkan data usaha atau kata sandi asli.

**Pemeriksaan internal, 28 Oktober 2026:** halaman login, dashboard, buku kas, utang/piutang, proyeksi, dan pengaturan diperiksa pada viewport emulasi 390 × 844 px. Tidak ada halaman dengan lebar konten melebihi viewport. Ini pemeriksaan tata letak, bukan pengganti sesi bersama pengguna UMKM.

**Pemeriksaan alur internal, 28 Oktober 2026:** pada browser emulasi ponsel, transaksi keluar ditambah dan dikoreksi, pembayaran utang sebagian mengurangi sisa dan muncul di buku kas, piutang baru dibuat, skenario proyeksi diganti, pengaturan disimpan, serta data demo dan pengaturan yang rusak dipulihkan lewat pesan error. Halaman login dan lima halaman aplikasi juga dibuka pada lebar 390 px dan 1280 px tanpa konten melebar. Pemeriksaan ini memakai data buatan dan tidak mengukur kemudahan pemakaian oleh peserta UMKM.

## Peserta dan persiapan

- Undang lima pemilik atau staf UMKM yang biasa mencatat pemasukan dan pengeluaran. Catat tingkat kenyamanan memakai situs, tanpa mencatat nama usaha atau nominal keuangan pribadi.
- Gunakan ponsel peserta atau ukuran layar ponsel. Buka jendela privat baru untuk setiap sesi agar data contoh dimulai dari keadaan yang sama; tutup setelah sesi.
- Sediakan 20–25 menit per peserta. Baca tugas apa adanya dan biarkan peserta memilih langkahnya sendiri. Catat bantuan yang diberikan.
- Sebelum mulai, jelaskan bahwa ini pratinjau dengan data buatan dan tidak ada akun sungguhan. Minta izin untuk mencatat ucapan/observasi tanpa identitas pribadi.

## Skrip pembuka

> “Kami sedang menilai apakah buku kas ini mudah dipahami. Yang diuji adalah tampilannya, bukan kemampuan Anda. Silakan ucapkan apa yang Anda pikirkan saat mencoba. Data di layar adalah contoh. Jika ada yang membingungkan, katakan saja.”

Mulai di `/login`. Minta peserta membuka demo tanpa membuat akun.

## Tugas

| Tugas | Instruksi untuk peserta | Hal yang diamati |
|---|---|---|
| 1. Catat dan koreksi | “Pada 27 Oktober, Kedai Pagi membayar Rp75.000 untuk kemasan secara tunai. Catat pengeluaran itu. Setelah tersimpan, ternyata nominalnya Rp70.000. Perbaiki.” | Menemukan Buku kas, memilih uang keluar, mengisi form, menemukan Koreksi, melihat saldo berubah dua kali. |
| 2. Baca ringkasan | “Di Dashboard, lihat uang masuk dan keluar untuk 7 hari, lalu 30 hari. Ceritakan apa arti ‘selisih kas’ dan periode yang sedang tampil.” | Menemukan pemilih periode, membaca nominal dan label tanpa mengira selisih kas sebagai laba. |
| 3. Bayar sebagian | “Pada data contoh, Kedai Pagi membayar Rp200.000 kepada Koperasi Pangan Jaya melalui transfer. Catat pembayaran itu. Berapa utang yang masih tersisa?” | Menemukan utang, memasukkan sebagian nominal, melihat sisa turun dan transaksi pembayaran muncul di Buku kas. |
| 4. Jelaskan peringatan | “Buka Proyeksi. Pilih 30 hari dan skenario hati-hati. Jelaskan kapan saldo melewati batas aman dan angka apa yang dipakai untuk peringatan itu.” | Memahami batas aman, tanggal, skenario, dan bahwa piutang belum pasti tidak dihitung di skenario hati-hati. |

**Tiga tugas inti PRD:** tugas 1 (mencatat transaksi), tugas 2 (membaca ringkasan), dan tugas 4 (menjelaskan peringatan). Target rencana: sedikitnya 4 dari 5 peserta menyelesaikan ketiganya tanpa bantuan.

## Setelah tugas

Tanyakan singkat:

1. “Bagian mana yang paling membingungkan?”
2. “Apakah ada kata atau angka yang sulit dibaca?”
3. “Jika ini data usaha Anda, informasi apa yang ingin Anda lihat lebih dulu?”

Jangan menjelaskan fungsi tombol selama tugas berlangsung. Jika peserta berhenti, tunggu sejenak lalu tanyakan apa yang sedang mereka cari. Tandai bantuan apa pun sebagai **dengan bantuan**.

## Lembar hasil

Isi satu baris per peserta dan tugas. Gunakan kode P1–P5; jangan tulis nama peserta atau data keuangan asli.

| Peserta | Perangkat / lebar layar | Tugas | Hasil (mandiri / dibantu / gagal) | Waktu | Hambatan yang terlihat | Kutipan tanpa identitas |
|---|---|---|---|---|---|---|
| P1 |  | 1 |  |  |  |  |
| P1 |  | 2 |  |  |  |  |
| P1 |  | 3 |  |  |  |  |
| P1 |  | 4 |  |  |  |  |

Salin empat baris tersebut untuk P2–P5. Sesudah semua sesi, hitung peserta yang menyelesaikan ketiga tugas inti secara mandiri. Urutkan masalah menurut jumlah peserta terdampak dan dampaknya pada pencatatan atau pemahaman kas. Perbaiki masalah yang berulang sebelum menyatakan antarmuka siap untuk fase berikutnya.
