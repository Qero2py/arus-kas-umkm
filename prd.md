# Product Requirements Document

## Sistem Pemantauan dan Proyeksi Arus Kas UMKM

| Field | Detail |
|---|---|
| Status | Draft untuk validasi dan implementasi prototipe |
| Versi | 1.0 |
| Terakhir diperbarui | 27 Oktober 2026 |
| Pemilik produk | Kelompok 9, Seminar Capstone Project |
| Platform | Web responsif |
| Stack yang ditetapkan | Next.js, Vercel, Supabase |

## 1. Ringkasan produk

Aplikasi web ini membantu pemilik dan pengelola UMKM mencatat arus uang usaha, melihat ringkasan per periode, mencatat utang/piutang, dan meninjau proyeksi saldo kas 7, 14, atau 30 hari. Sistem memberi peringatan berbasis aturan dengan alasan yang dapat diperiksa pengguna.

Produk ini adalah prototipe pemantauan kas jangka pendek. Angka selisih kas bukan laba akuntansi, proyeksi bukan kepastian, dan sistem tidak membuat keputusan atau tindakan keuangan untuk pengguna.

## 2. Latar belakang dan masalah

UMKM dapat mencatat transaksi melalui buku, nota, spreadsheet, atau ingatan pemilik. Praktik pencatatan dan frekuensi meninjau kas berbeda-beda. Tanpa catatan yang mudah ditinjau, pemilik dapat kesulitan memahami saldo kas, kewajiban mendatang, dan potensi kekurangan kas sebelum jatuh tempo.

Dokumen capstone melaporkan survei awal anonim dengan tiga responden; dua responden menyatakan pernah kesulitan menyediakan uang operasional. Sampel ini bersifat eksploratif dan tidak mewakili UMKM secara umum. Kebutuhan dan prioritas fitur harus terus divalidasi dengan calon pengguna.

## 3. Tujuan dan ukuran keberhasilan

### Tujuan produk

1. Memudahkan pencatatan dan koreksi pemasukan serta pengeluaran usaha.
2. Menampilkan posisi dan perubahan kas untuk periode yang dipilih.
3. Membantu pengguna melihat dampak kewajiban yang akan jatuh tempo.
4. Menyajikan proyeksi dan peringatan secara transparan, termasuk asumsi serta keterbatasan data.
5. Melindungi informasi keuangan dan membatasi akses hanya kepada pengguna yang berwenang.

### Ukuran keberhasilan prototipe

- Semua skenario utama FR-01 sampai FR-06 lulus pengujian fungsional.
- Hasil ringkasan, proyeksi, dan sisa kewajiban cocok dengan perhitungan acuan independen.
- Sedikitnya 4 dari 5 peserta uji menyelesaikan tiga tugas inti tanpa bantuan: mencatat transaksi, membaca ringkasan, dan menjelaskan peringatan.
- Peserta dapat menemukan periode, asumsi utama, dan alasan peringatan pada layar terkait.
- Akses tanpa autentikasi atau tanpa izin ke data usaha ditolak.
- Target p95 <= 3 detik untuk pemuatan ringkasan/proyeksi di kondisi uji yang disepakati; proposal menyebut target ketersediaan 160 dari 168 pemeriksaan per jam dalam uji tujuh hari. Target operasional ini perlu ditinjau untuk kecocokan dengan prototipe dan paket layanan.

Target tersebut adalah kriteria rencana, bukan klaim bahwa aplikasi sudah diuji atau memenuhi target.

## 4. Pengguna dan kebutuhan

### Pemilik UMKM

Pemilik mengatur saldo awal, ambang kas, dan horizon proyeksi; meninjau ringkasan, proyeksi, serta peringatan; dan menentukan sendiri tindakan selanjutnya.

### Pengelola keuangan

Pengelola yang diberi izin membantu mencatat atau mengoreksi transaksi dan kewajiban, lalu melihat informasi yang diizinkan pemilik. Otorisasi harus diperiksa oleh server/database, bukan hanya dengan menyembunyikan kontrol di antarmuka.

### Kebutuhan inti

- Mencatat pemasukan dan pengeluaran dengan cepat.
- Melihat saldo, arus masuk, arus keluar, dan selisih kas menurut periode.
- Mengetahui utang/piutang yang belum selesai dan tanggal jatuh tempo.
- Memahami kapan proyeksi melewati ambang kas dan data/asumsi apa yang memicunya.
- Mendapat pesan dan label dalam Bahasa Indonesia yang sederhana.

## 5. Ruang lingkup

### Termasuk (MVP)

- Akun dan akses ke usaha pengguna.
- Saldo awal dan pengaturan ambang/horizon proyeksi.
- Tambah, lihat, dan koreksi transaksi masuk/keluar.
- Catat utang/piutang, pembayaran/penerimaan sebagian, sisa, dan jatuh tempo.
- Ringkasan kas untuk periode pilihan.
- Proyeksi saldo 7/14/30 hari dengan skenario terjadwal dan hati-hati.
- Peringatan ambang kas dan kewajiban mendekati jatuh tempo beserta alasan.
- Penanda kondisi data kurang dan penjelasan asumsi.
- Antarmuka web responsif untuk desktop dan ponsel.

### Di luar lingkup MVP

- Machine learning atau klaim prediksi kebangkrutan.
- Perhitungan laporan laba rugi atau laba akuntansi.
- Integrasi otomatis dengan bank, dompet digital, marketplace, atau pajak.
- Keputusan kredit, rekomendasi pinjaman/investasi yang dipersonalisasi, atau pembayaran otomatis.
- Peluncuran komersial atau penggunaan produksi dengan data keuangan riil sebelum validasi keamanan dan persetujuan yang sesuai.
- Multi-usaha per akun pada prototipe awal.
- Ekspor lanjutan, grafik tren (Should), dan pemisahan transaksi usaha/pribadi (Could) sampai kebutuhan tersebut dikonfirmasi.

## 6. Alur pengguna utama

1. Pemilik membuat akun dan masuk.
2. Pemilik membuat atau mengakses satu profil usaha, memasukkan saldo awal, serta memilih ambang kas dan horizon proyeksi.
3. Pemilik/pengelola berizin mencatat pemasukan atau pengeluaran yang telah terjadi.
4. Pengguna mencatat utang/piutang dan tanggal jatuh tempo; pembayaran/penerimaan yang terjadi dicatat agar sisa kewajiban akurat.
5. Pengguna membuka ringkasan dan memilih periode.
6. Pemilik membuka proyeksi 7/14/30 hari, membaca skenario dan asumsi, lalu meninjau peringatan yang muncul.
7. Pengguna memutuskan tindakan sendiri; aplikasi tidak mengeksekusi pembayaran atau keputusan bisnis.

## 7. Kebutuhan fungsional

| ID | Kebutuhan | Prioritas | Kriteria penerimaan |
|---|---|---|---|
| FR-01 | Pengguna berizin dapat menambah, melihat, dan mengoreksi transaksi masuk/keluar dengan tanggal, nominal, kategori, dan keterangan. | Must | Input tidak valid ditolak dengan pesan jelas. Transaksi yang disimpan muncul pada daftar dan ringkasan terkait berubah sesuai nilai baru. |
| FR-02 | Pemilik dapat mengatur saldo awal dan pengguna berizin dapat melihat arus masuk, arus keluar, serta saldo menurut periode. | Must | Periode yang dipilih terlihat. Saldo aktual sesuai saldo awal ditambah pemasukan terealisasi dan dikurangi pengeluaran terealisasi. |
| FR-03 | Pengguna berizin dapat mencatat utang/piutang, pihak terkait, nominal, tanggal, jatuh tempo, pembayaran/penerimaan, dan status. | Must | Sisa dihitung benar setelah pembayaran/penerimaan sebagian atau penuh; data jatuh tempo terlihat. |
| FR-04 | Sistem menghitung pemasukan, pengeluaran, dan selisih kas untuk periode pilihan. | Must | Nilai cocok dengan perhitungan acuan. UI menyebutnya “selisih kas”, bukan “laba/rugi”. |
| FR-05 | Pemilik dapat meninjau proyeksi saldo untuk horizon 7, 14, atau 30 hari, komponen, skenario, asumsi, dan status kecukupan data. | Must | Proyeksi dapat direproduksi dari data dan aturan yang ditampilkan. Data kurang ditandai secara jelas; angka tidak disajikan seolah pasti. |
| FR-06 | Sistem menampilkan peringatan ketika aturan ambang kas atau jatuh tempo terpicu. | Must | Setiap peringatan menampilkan tingkat, tanggal/periode, aturan atau ambang pemicu, dan konteks nilai yang relevan. |
| FR-07 | Pengguna dapat menandai transaksi sebagai usaha/pribadi dan melihat dampaknya terpisah jika kebutuhan terkonfirmasi. | Could | Fitur hanya diaktifkan setelah validasi pengguna dan dampak pada saldo dijelaskan. |
| FR-08 | Pengguna dapat melihat grafik tren kas sederhana untuk periode pilihan bila waktu memungkinkan. | Should | Grafik memakai data yang sama dengan ringkasan dan memiliki label periode serta satuan yang jelas. |

## 8. Aturan bisnis dan perhitungan

- Semua nilai rupiah disimpan dan dihitung sebagai bilangan bulat, bukan floating point.
- Saldo aktual dihitung dari saldo awal dan transaksi yang telah terealisasi. Transaksi mendatang tidak boleh dihitung sebagai saldo aktual.
- Selisih kas periode = total pemasukan terealisasi dikurangi total pengeluaran terealisasi dalam periode. Istilah ini tidak menyatakan laba akuntansi.
- Sisa kewajiban = nilai awal dikurangi pembayaran/penerimaan yang sudah dicatat, dengan batas minimum nol dan validasi agar pembayaran tidak melampaui sisa tanpa konfirmasi koreksi.
- Proyeksi memakai saldo aktual, arus rutin bersih yang dihitung dari data yang tersedia, dan kewajiban mendatang yang belum terealisasi dalam horizon.
- Skenario terjadwal memasukkan piutang sesuai jadwal. Skenario hati-hati tidak memasukkan piutang yang belum dikonfirmasi. Kedua skenario menampilkan asumsi dan komponen perhitungan.
- Pembayaran yang sudah tercatat sebagai transaksi aktual tidak boleh dihitung kembali sebagai kewajiban masa depan.
- Ambang kas dan horizon dipilih/disimpan pada pengaturan pengguna; nilai default final perlu divalidasi.
- Data historis yang tidak cukup untuk menghitung arus rutin harus menghasilkan label “data belum cukup” atau padanan yang jelas, bukan proyeksi dengan keyakinan palsu.
- Peringatan hanya menjelaskan aturan yang terpicu. Sistem tidak memberi skor kredit atau instruksi finansial otomatis.

## 9. Pengalaman dan antarmuka

- Bahasa antarmuka utama: Bahasa Indonesia sederhana; hindari istilah akuntansi tanpa penjelasan.
- Ringkasan utama memprioritaskan saldo terkini, pemasukan/pengeluaran periode, selisih kas, dan peringatan aktif.
- Form transaksi harus ringkas, dengan validasi nominal dan tanggal serta umpan balik setelah simpan.
- Status kosong, data kurang, gagal memuat, dan berhasil disimpan harus memiliki pesan yang jelas serta langkah berikutnya.
- Proyeksi memisahkan skenario terjadwal dan hati-hati. Tampilkan periode, saldo awal proyeksi, arus rutin, kewajiban/piutang terjadwal, ambang, dan batas data.
- Gunakan warna bersama label/ikon/teks untuk status agar informasi tidak hanya bergantung pada warna.
- Layout harus tetap dapat digunakan pada layar ponsel, mendukung ukuran teks yang terbaca, navigasi yang konsisten, kontras memadai, dan kontrol keyboard dasar.
- Jangan menyiratkan bahwa proyeksi adalah jaminan, rekomendasi ahli, atau laporan keuangan formal.

## 10. Persyaratan nonfungsional

| ID | Persyaratan |
|---|---|
| NFR-01 Usability | Bahasa sederhana. Sedikitnya 4 dari 5 peserta uji menyelesaikan tiga tugas inti tanpa bantuan. |
| NFR-02 Privasi dan akses | Data usaha hanya dapat dibaca/diubah oleh pemilik dan pengelola berizin. Data riset hanya digunakan dengan persetujuan; identitas dan data sensitif diminimalkan/disamarkan. |
| NFR-03 Kinerja | p95 ringkasan/proyeksi <= 3 detik dalam kondisi uji dan dataset yang ditentukan. |
| NFR-04 Transparansi dan integritas | Periode, sumber data, asumsi, skenario, data kurang, dan alasan peringatan terlihat. Perhitungan harus cocok dengan acuan independen. |
| NFR-05 Ketersediaan uji | Proposal menetapkan target awal >=160 dari 168 pemeriksaan per jam selama tujuh hari uji. Validasi target dan metode pengukuran sebelum menjadikannya kriteria rilis. |
| NFR-06 Keamanan | Validasi input di server, pembatasan akses per usaha, pengelolaan rahasia di environment variables, HTTPS pada deployment, dan kebijakan Row Level Security (RLS) pada tabel yang berisi data pengguna. |
| NFR-07 Mata uang/waktu | Mata uang ditampilkan sebagai Rupiah (Rp); tanggal/periode menggunakan zona waktu Asia/Jakarta dan format yang konsisten. |

## 11. Data dan arsitektur teknis

### Stack

- **Next.js**: aplikasi web responsif, halaman dan alur server/client sesuai kebutuhan.
- **Vercel**: deployment aplikasi Next.js dan environment deployment.
- **Supabase**: PostgreSQL, autentikasi, dan kontrol akses berbasis RLS. Gunakan Supabase SSR/client sesuai pola integrasi Next.js yang berlaku saat implementasi.

### Entitas data awal

- `profiles`: identitas aplikasi yang terkait dengan pengguna autentikasi.
- `businesses`: satu usaha untuk pemilik pada MVP, nama usaha dan pengaturan ringkas.
- `business_members`: hubungan pengguna-usaha beserta peran owner/manager jika alur pengelola diaktifkan.
- `transactions`: usaha, tanggal, tipe masuk/keluar, jumlah rupiah, kategori, keterangan, dan status terealisasi/terjadwal.
- `obligations`: usaha, tipe utang/piutang, pihak, nilai, jumlah dibayar/diterima, jatuh tempo, dan status.
- `business_settings`: saldo awal, ambang kas, horizon default, dan pengaturan jendela rata-rata jika dipakai.
- `alert_events`: usaha, jenis/tingkat, tanggal pemicu, aturan, nilai terkait, dan status dilihat/selesai jika log diperlukan.

Nama tabel dan skema final harus ditetapkan dalam migrasi setelah alur akses disepakati. Hindari menyimpan data pribadi responden penelitian di basis data aplikasi kecuali memang diperlukan dan disetujui.

### Keamanan data

- Terapkan RLS untuk setiap tabel yang berisi data usaha; policy harus memverifikasi keanggotaan usaha dan peran.
- Jangan pernah mengirim service role key ke browser. Gunakan hanya di lingkungan server yang memerlukannya dan batasi aksesnya.
- Validasi otorisasi pada setiap operasi baca/tulis, termasuk server actions/API routes.
- Gunakan data contoh atau data yang disamarkan untuk demo dan uji kegunaan.
- Perubahan skema dilakukan lewat migration yang tersimpan di repositori; jangan mengandalkan perubahan manual yang tidak tercatat.

## 12. Pengujian dan evaluasi

- Uji hitung dengan kumpulan kasus acuan yang mencakup pemasukan/pengeluaran, koreksi transaksi, beberapa periode, saldo awal, kewajiban jatuh tempo, pembayaran sebagian, piutang yang belum pasti, data kosong, serta pencegahan hitung ganda.
- Uji hak akses untuk pengguna anonim, pemilik, pengelola berizin, dan pengguna dari usaha lain.
- Uji alur inti dari ponsel dan desktop: catat transaksi, lihat ringkasan, kelola kewajiban, pahami proyeksi/peringatan.
- Uji pesan untuk validasi, kosong, data tidak cukup, kegagalan jaringan, dan sukses.
- Catat hasil usability test apa adanya; jangan menyatakan target tercapai sebelum pengujian dilakukan.

## 13. Risiko, asumsi, dan keputusan terbuka

### Risiko dan mitigasi

- **Sampel pengguna terbatas**: validasi melalui target proposal 15-30 respons survei valid, minimal lima wawancara, dan dua observasi berizin.
- **Piutang terlambat atau data tidak rutin**: berikan dua skenario, tampilkan asumsi/data kurang, dan hindari kepastian palsu.
- **Salah hitung atau hitung ganda**: pisahkan arus aktual dari kewajiban terjadwal dan uji menggunakan perhitungan acuan independen.
- **Akses data tidak sah**: RLS dan uji akses negatif lintas akun/usaha.
- **Klaim produk melampaui bukti**: jangan menyebutnya AI/ML, laba rugi, prediksi bangkrut, atau keputusan kredit.

### Asumsi untuk validasi

- Pemilik/pengelola UMKM bersedia mencatat atau memasukkan transaksi secara manual.
- Pengguna dapat menyediakan saldo awal dan sebagian riwayat transaksi/kewajiban.
- Horizon 7/14/30 hari dan dua skenario piutang dapat dipahami dan berguna bagi calon pengguna.
- Satu usaha per akun cukup untuk prototipe capstone.

### Keputusan terbuka sebelum implementasi penuh

1. UMKM mitra, jenis usaha, wilayah, dan hasil validasi lapangan final.
2. Durasi data historis minimum untuk rata-rata arus rutin; perlakuan bila data kurang.
3. Nilai awal ambang kas dan cara pemilik mengubahnya.
4. Definisi operasional “jatuh tempo mendekati” untuk peringatan; apakah jendela hari dapat diatur.
5. Apakah pengelola dapat diundang oleh pemilik pada MVP atau hanya satu pengguna per usaha.
6. Target ketersediaan yang sesuai dengan lingkungan prototipe dan rencana evaluasi.
7. Metode autentikasi dan pemulihan akun yang akan digunakan.

## 14. Sumber kebutuhan

Dokumen ini merangkum materi di folder `Task/`, terutama:

- `SEMINAR CAPSTONE PROJECT - 4 - MERGED.pdf` - perencanaan awal dan prioritas lingkup.
- `SEMINAR CAPSTONE PROJECT - 5.pdf` - proposal capstone, bukti awal, kebutuhan, metode, dan target evaluasi.
- `SEMINAR CAPSTONE PROJECT - 6.pdf` - kebutuhan fungsional/nonfungsional, arsitektur, use case, dan aturan proyeksi.

Dokumen Pertemuan 6 tertanggal 27 Oktober 2026 menyatakan rancangan belum merupakan hasil implementasi. Jika ada perbedaan antar dokumen, PRD ini mengikuti lingkup terbaru Pertemuan 6 sambil mempertahankan batas bukti dan prioritas proposal.
